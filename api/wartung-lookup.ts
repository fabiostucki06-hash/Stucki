// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Researches the manufacturer's service intervals for one exact vehicle
// configuration with Google Gemini + Google Search grounding (Claude + web
// search only as a fallback when just ANTHROPIC_API_KEY is set):
//   POST /api/wartung-lookup  { fahrzeug: {...}, positionen: [{ key, name }] } → { ok: true, result: LookupResult }
//   GET  /api/wartung-lookup  → { configured, provider }
//   Authorization: Bearer <Supabase access token of the signed-in user>
//
// No guessing: an interval only counts as found ('belegt') when the model names
// a manufacturer or technical-data source AND that source's URL is one the web
// search actually returned in this request. Anything else comes back as
// 'unbelegt' with its intervals cleared, and the app keeps its Richtwert.
// Gemini's grounding links are Google redirects: they are resolved to the
// real pages before the check.
// Cache: results are stored per vehicle configuration + item in
// public.wartung_lookup_cache. Identical specs are answered from there; only
// items not cached yet (or cached without a source for more than 30 days) go
// to the AI provider, which keeps the Gemini free-tier quota for new vehicles.
// Environment variables: GEMINI_API_KEY (primary), GEMINI_MODEL (optional),
// ANTHROPIC_API_KEY (optional fallback).

import Anthropic from '@anthropic-ai/sdk';
import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import { SUPA_KEY, SUPA_URL, supabaseUserId } from './_drive.js';
import { GeminiError, NOT_CONFIGURED, anthropicKey, geminiGenerate, geminiKey, jsonAusText, zielUrl } from './_gemini.js';

const MODEL = 'claude-opus-5-5';

/** Mirrors VorlageKey in src/lib/wartung.ts. */
const KEYS = ['oel', 'luftfilter', 'innenraumfilter', 'kraftstofffilter', 'zuendkerzen', 'bremsfluessigkeit', 'zahnriemen',
  'getriebeoel', 'allradkupplung', 'verteilergetriebe', 'hinterachsgetriebe'] as const;
type Key = typeof KEYS[number];

const FELDER = ['marke', 'modell', 'erstzulassung', 'motor', 'motorcode', 'antrieb', 'achsantrieb', 'getriebe', 'steuertrieb', 'km'] as const;
type Fahrzeug = Partial<Record<typeof FELDER[number], string>>;

const TOOL: Anthropic.Tool = {
  name: 'intervalle_melden',
  description: 'Meldet die recherchierten Wartungsintervalle. Genau einmal aufrufen, wenn die Recherche abgeschlossen ist.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['positionen', 'hinweis'],
    properties: {
      positionen: {
        type: 'array',
        description: 'Eine Zeile pro angefragter Position (key), keine weiteren.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'anwendbar', 'intervallKm', 'intervallMonate', 'quelleTyp', 'quelleText', 'quelleUrl', 'hinweis'],
          properties: {
            key: { type: 'string', enum: [...KEYS] },
            anwendbar: { type: 'string', enum: ['ja', 'nein', 'unklar'], description: '"nein" nur wenn eine Quelle belegt, dass die Position bei genau dieser Konfiguration entfällt (z.B. Getriebe lebenslang befüllt, Steuerkette, Trockenkupplung DQ200).' },
            intervallKm: { type: 'integer', description: 'Wechselintervall in km laut Quelle; 0 wenn keines angegeben oder nicht belegt.' },
            intervallMonate: { type: 'integer', description: 'Wechselintervall in Monaten laut Quelle (Jahre × 12); 0 wenn keines angegeben oder nicht belegt.' },
            quelleTyp: { type: 'string', enum: ['hersteller', 'fachdaten', 'keine'], description: '"hersteller" = Serviceplan, Betriebsanleitung, Wartungsheft, Herstellerportal; "fachdaten" = Autodata, HaynesPro, TecDoc, ADAC, Teilehersteller-Katalog (z.B. ContiTech/Gates Wechselintervalle). Foren, Blogs, Händler-Werbeseiten, KI-Texte = "keine".' },
            quelleText: { type: 'string', description: 'Kurze Quellenangabe, z.B. "VW Serviceplan Golf VII", "Gates Wechselintervalle". "" wenn keine.' },
            quelleUrl: { type: 'string', description: 'URL der Quelle genau wie im Suchergebnis. "" wenn keine.' },
            hinweis: { type: 'string', description: 'Kurz auf Deutsch, z.B. "LongLife flexibel bis 30\'000 km / 24 Mt., fix 15\'000 km / 12 Mt." oder "nur mit Nasskupplung (DQ250)". Sonst "".' },
          },
        },
      },
      hinweis: { type: 'string', description: 'Ein kurzer Satz zur Recherche insgesamt (z.B. welche Daten fehlten), sonst "".' },
    },
  },
};

const SYSTEM = `Du recherchierst für eine Schweizer Autowerkstatt die Wartungsintervalle des Herstellers für genau ein Fahrzeug.

Vorgehen:
- Nutze alle Fahrzeugdaten: Marke, Modell, 1. Inverkehrsetzung (Baujahr), Motor, Motorkennbuchstabe, Antrieb, Antriebsart (Front/Heck/Allrad), Getriebe, Steuertrieb. Massgebend ist der Wartungsplan für den europäischen / Schweizer Markt.
- Suche gezielt mit der Websuche: Serviceplan / Wartungsplan des Herstellers, Betriebsanleitung, technische Datenbanken (Autodata, HaynesPro), Wechselintervalle der Riemenhersteller (ContiTech, Gates) nach Motorkennbuchstabe.
- Melde für jede angefragte Position (und nur diese) das Intervall nach km und/oder Monaten, das für genau diese Konfiguration gilt. Getriebe- und Allrad-Positionen nur für das angegebene Getriebe bzw. Allradsystem.
- Erfinde nichts. Ohne Quelle, die das Intervall für diese Konfiguration nennt: intervallKm 0, intervallMonate 0, quelleTyp "keine". Kein Schätzen, kein Übertragen von anderen Motoren oder Baujahren, keine "üblichen" Werte.
- quelleUrl muss eine URL aus deinen Suchergebnissen sein, die das Intervall tatsächlich enthält.
- Bei Ölwechsel mit festem und flexiblem (LongLife) Intervall: das feste Intervall melden, das flexible im hinweis.
- Melde das Ergebnis am Ende mit dem Werkzeug intervalle_melden.`;

interface KiPosition {
  key: Key; anwendbar: 'ja' | 'nein' | 'unklar'; intervallKm: number; intervallMonate: number;
  quelleTyp: 'hersteller' | 'fachdaten' | 'keine'; quelleText: string; quelleUrl: string; hinweis: string;
}

/** "https://www.x.ch/a/b/?q#h" → "x.ch/a/b": the same page however the URL is written. */
function urlSchluessel(u: string): string {
  try {
    const x = new URL(u.trim());
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return ''; }
}

/** Every URL the web search returned (results and citations) in these blocks. */
function gefundeneUrls(content: unknown[], into: Set<string>) {
  for (const b of content as { type: string; content?: unknown; citations?: { url?: string }[] }[]) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content as { url?: string }[]) if (r.url) into.add(urlSchluessel(r.url));
    }
    for (const c of b.citations ?? []) if (c.url) into.add(urlSchluessel(c.url));
  }
}

const zahl = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : 0);
const text = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

type KiAntwort = { positionen?: Partial<KiPosition>[]; hinweis?: string };

/** The model's answer checked against the search: an interval is only
    'belegt' with a recognized source whose page the search really returned. */
function auswerten(ki: KiAntwort, positionen: { key: Key }[], urls: Set<string>) {
  const angefragt = new Set(positionen.map((p) => p.key));
  const gesehen = new Set<Key>();
  const ergebnis = (Array.isArray(ki.positionen) ? ki.positionen : []).flatMap((p) => {
    const key = p.key as Key;
    if (!angefragt.has(key) || gesehen.has(key)) return [];
    gesehen.add(key);
    const quelleTyp = p.quelleTyp === 'hersteller' || p.quelleTyp === 'fachdaten' ? p.quelleTyp : 'keine';
    const anwendbar = p.anwendbar === 'ja' || p.anwendbar === 'nein' ? p.anwendbar : 'unklar';
    const roh = text(p.quelleUrl, 500);
    const url = /^https?:\/\//i.test(roh) ? roh : '';
    const belegt = quelleTyp !== 'keine' && !!url && urls.has(urlSchluessel(url));
    const km = belegt ? zahl(p.intervallKm, 400_000) : 0;
    const monate = belegt ? zahl(p.intervallMonate, 240) : 0;
    return [{
      key,
      status: belegt && (anwendbar === 'nein' || km || monate) ? 'belegt' : 'unbelegt',
      anwendbar: belegt ? anwendbar : 'unklar',
      intervallKm: km || undefined,
      intervallMonate: monate || undefined,
      quelleTyp: belegt ? quelleTyp : 'keine',
      quelleText: belegt ? text(p.quelleText, 120) : '',
      quelleUrl: belegt ? url : '',
      hinweis: text(p.hinweis, 240),
    }];
  });
  return { positionen: ergebnis, hinweis: text(ki.hinweis, 300) };
}

const ANWEISUNG_JSON = `Antworte am Ende ausschliesslich mit einem JSON-Objekt (ohne weiteren Text) in dieser Form:
{"positionen":[{"key":"<key der Position>","anwendbar":"ja|nein|unklar","intervallKm":<Zahl, 0 wenn keines belegt>,"intervallMonate":<Zahl, 0 wenn keines belegt>,"quelleTyp":"hersteller|fachdaten|keine","quelleText":"<kurze Quellenangabe oder leer>","quelleUrl":"<URL der Seite aus den Suchergebnissen, die das Intervall enthält, oder leer>","hinweis":"<kurz auf Deutsch oder leer>"}],"hinweis":"<ein Satz zur Recherche oder leer>"}
- Genau eine Zeile pro angefragter Position.
- "nein" nur, wenn eine Quelle belegt, dass die Position bei genau dieser Konfiguration entfällt.
- quelleTyp "hersteller" = Serviceplan, Betriebsanleitung, Wartungsheft, Herstellerportal; "fachdaten" = Autodata, HaynesPro, TecDoc, ADAC, Teilehersteller-Katalog. Foren, Blogs, Händler-Werbeseiten = "keine".`;

/** Google Search grounding: every page the search used, resolved from Google's redirect links. */
async function mitGemini(anfrage: string): Promise<{ ki: KiAntwort | null; urls: Set<string> }> {
  const a = await geminiGenerate({
    system: `${SYSTEM.replace(/\n- Melde das Ergebnis.*$/s, '')}\n\n${ANWEISUNG_JSON}`,
    parts: [{ text: anfrage }],
    search: true,
    timeoutMs: 200_000,
  });
  const ziele = await Promise.all(a.quellen.map((q) => zielUrl(q.uri)));
  const urls = new Set(ziele.filter((u): u is string => !!u).map(urlSchluessel).filter(Boolean));
  return { ki: jsonAusText<KiAntwort>(a.text), urls };
}

async function mitClaude(apiKey: string, anfrage: string): Promise<{ ki: KiAntwort | null; urls: Set<string> }> {
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: anfrage }];
  const urls = new Set<string>();
  // Server-side web search can pause a long turn (pause_turn): continue it, at most a few times.
  for (let runde = 0; runde < 4; runde++) {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, TOOL],
      tool_choice: { type: 'auto' },
      messages,
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    gefundeneUrls(r.content, urls);
    const call = r.content.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
    if (call && call.type === 'tool_use') return { ki: call.input as KiAntwort, urls };
    if (r.stop_reason === 'refusal') return { ki: null, urls };
    messages.push({ role: 'assistant', content: r.content });
    // Ended without reporting: ask once more for the report.
    if (r.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Melde jetzt das Ergebnis mit intervalle_melden.' });
  }
  return { ki: null, urls };
}

/* ── Shared cache (public.wartung_lookup_cache) ── */

type Ergebnis = ReturnType<typeof auswerten>;
type CachePosition = Ergebnis['positionen'][number];
const UNBELEGT_TAGE = 30;

/** Same fields and normalisation as konfigSchluessel in src/lib/wartung.ts (km excluded). */
const cacheSchluessel = (f: Fahrzeug): string =>
  [(f.marke ?? '').trim().toLowerCase(), (f.modell ?? '').trim().toLowerCase(), (f.erstzulassung ?? '').slice(0, 4),
    (f.motor ?? '').trim().toLowerCase(), (f.motorcode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    f.antrieb ?? '', f.achsantrieb ?? '', f.getriebe ?? '', f.steuertrieb ?? ''].join('|');

const restHeaders = (token: string) => ({ apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** Cached positions for this configuration that are still valid. A failing cache never blocks the lookup. */
async function cacheLesen(token: string, schluessel: string): Promise<Map<Key, CachePosition>> {
  const out = new Map<Key, CachePosition>();
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/wartung_lookup_cache?select=vorlage,data,belegt,updated_at&schluessel=eq.${encodeURIComponent(schluessel)}`,
      { headers: restHeaders(token), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return out;
    const grenze = Date.now() - UNBELEGT_TAGE * 86_400_000;
    for (const z of (await r.json()) as { vorlage: Key; data: CachePosition; belegt: boolean; updated_at: string }[]) {
      if (!KEYS.includes(z.vorlage) || !z.data) continue;
      if (!z.belegt && Date.parse(z.updated_at) < grenze) continue;
      out.set(z.vorlage, z.data);
    }
  } catch { /* no cache: research everything */ }
  return out;
}

async function cacheSchreiben(token: string, schluessel: string, positionen: CachePosition[]) {
  if (!positionen.length) return;
  const jetzt = new Date().toISOString();
  try {
    await fetch(`${SUPA_URL}/rest/v1/wartung_lookup_cache?on_conflict=schluessel,vorlage`, {
      method: 'POST',
      headers: { ...restHeaders(token), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(positionen.map((p) => ({ schluessel, vorlage: p.key, data: p, belegt: p.status === 'belegt', updated_at: jetzt }))),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error('[wartung-lookup] cache', e); }
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  // Gemini is the primary provider; Claude only when no Gemini key is set.
  const gemini = geminiKey(), claude = anthropicKey();
  const configured = !!gemini || !!claude;
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured, provider: gemini ? 'gemini' : claude ? 'anthropic' : null });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur GET/POST' });

  const auth = req.headers?.authorization;
  const token = (Array.isArray(auth) ? auth[0] : auth)?.replace(/^Bearer\s+/i, '');
  if (!token || !(await supabaseUserId(token))) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  if (!configured) return res.status(501).json({ ok: false, configured: false, code: 'not_configured', error: NOT_CONFIGURED });

  const fahrzeug: Fahrzeug = {};
  let positionen: { key: Key; name: string }[] = [];
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as { fahrzeug?: Record<string, unknown>; positionen?: unknown[] };
    for (const k of FELDER) {
      const v = body.fahrzeug?.[k];
      if (typeof v === 'string' && v.trim()) fahrzeug[k] = v.trim().slice(0, 120);
    }
    positionen = (Array.isArray(body.positionen) ? body.positionen : [])
      .filter((p): p is { key: Key; name: string } => !!p && KEYS.includes((p as { key: Key }).key))
      .map((p) => ({ key: p.key, name: String(p.name ?? '').slice(0, 80) }));
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }
  if (!fahrzeug.marke || !fahrzeug.modell) return res.status(400).json({ ok: false, error: 'Marke und Modell fehlen' });
  if (!positionen.length) return res.status(400).json({ ok: false, error: 'Keine Positionen angefragt' });

  // Identical specs: answered from the shared cache, only missing items are researched.
  const schluessel = cacheSchluessel(fahrzeug);
  const cache = await cacheLesen(token, schluessel);
  const ausCache = positionen.flatMap((p) => { const c = cache.get(p.key); return c ? [c] : []; });
  const offen = positionen.filter((p) => !cache.has(p.key));
  if (!offen.length) {
    return res.status(200).json({ ok: true, cached: true, result: { positionen: ausCache, hinweis: 'Aus dem Recherche-Speicher (gleiche Fahrzeugkonfiguration).' } });
  }

  const anfrage = `Fahrzeug:\n${FELDER.filter((k) => fahrzeug[k]).map((k) => `- ${k}: ${fahrzeug[k]}`).join('\n')}\n\nPositionen:\n${
    offen.map((p) => `- ${p.key}: ${p.name}`).join('\n')}`;
  try {
    const { ki, urls } = gemini ? await mitGemini(anfrage) : await mitClaude(claude, anfrage);
    if (!ki) return res.status(502).json({ ok: false, error: 'Die Recherche lieferte kein auswertbares Ergebnis' });
    const neu = auswerten(ki, offen, urls);
    await cacheSchreiben(token, schluessel, neu.positionen);
    return res.status(200).json({ ok: true, cached: false, result: { positionen: [...ausCache, ...neu.positionen], hinweis: neu.hinweis } });
  } catch (e) {
    if (e instanceof GeminiError) return res.status(e.status).json({ ok: false, ...(e.code ? { code: e.code } : {}), error: e.message });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen – bitte kurz warten und erneut versuchen' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ ok: false, code: 'invalid_key', error: 'Der Anthropic API Key in Vercel ist ungültig oder wurde widerrufen.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ ok: false, error: `KI-Dienst nicht erreichbar (${e.status ?? 'Netzwerk'})` });
    console.error('[wartung-lookup]', e);
    return res.status(500).json({ ok: false, error: 'Unerwarteter Fehler bei der Recherche' });
  }
}

