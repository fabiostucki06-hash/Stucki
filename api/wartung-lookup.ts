// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Researches the manufacturer's service intervals for one exact vehicle
// configuration with Claude + web search:
//   POST /api/wartung-lookup  { fahrzeug: {...}, positionen: [{ key, name }] } → { ok: true, result: LookupResult }
//   GET  /api/wartung-lookup  → { configured } (whether ANTHROPIC_API_KEY is set)
//   Authorization: Bearer <Supabase access token of the signed-in user>
//
// No guessing: an interval only counts as found ('belegt') when the model names
// a manufacturer or technical-data source AND that source's URL is one the web
// search actually returned in this request. Anything else comes back as
// 'unbelegt' with its intervals cleared, and the app keeps its Richtwert.
// Environment variable: ANTHROPIC_API_KEY (required).

import Anthropic from '@anthropic-ai/sdk';
import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import { supabaseUserOk } from './drive-upload.js';

declare const process: { env: Record<string, string | undefined> };

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

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  const configured = !!apiKey;
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur GET/POST' });

  const auth = req.headers?.authorization;
  const token = (Array.isArray(auth) ? auth[0] : auth)?.replace(/^Bearer\s+/i, '');
  if (!token || !(await supabaseUserOk(token))) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  if (!configured) {
    return res.status(501).json({ ok: false, configured: false, code: 'not_configured', error: 'Der Anthropic API Key ist in Vercel nicht konfiguriert (Umgebungsvariable ANTHROPIC_API_KEY fehlt).' });
  }

  let fahrzeug: Fahrzeug = {};
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

  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: `Fahrzeug:\n${FELDER.filter((k) => fahrzeug[k]).map((k) => `- ${k}: ${fahrzeug[k]}`).join('\n')}\n\nPositionen:\n${
      positionen.map((p) => `- ${p.key}: ${p.name}`).join('\n')}`,
  }];
  const urls = new Set<string>();
  try {
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
      if (call && call.type === 'tool_use') {
        const ki = call.input as { positionen: KiPosition[]; hinweis: string };
        const angefragt = new Set(positionen.map((p) => p.key));
        const ergebnis = (ki.positionen ?? []).filter((p) => angefragt.has(p.key)).map((p) => {
          const url = /^https?:\/\//i.test(p.quelleUrl) ? p.quelleUrl.trim() : '';
          // Verified only with a recognized source the search really returned.
          const belegt = p.quelleTyp !== 'keine' && !!url && urls.has(urlSchluessel(url));
          const km = belegt ? zahl(p.intervallKm, 400_000) : 0;
          const monate = belegt ? zahl(p.intervallMonate, 240) : 0;
          return {
            key: p.key,
            status: belegt && (p.anwendbar === 'nein' || km || monate) ? 'belegt' : 'unbelegt',
            anwendbar: belegt ? p.anwendbar : 'unklar',
            intervallKm: km || undefined,
            intervallMonate: monate || undefined,
            quelleTyp: belegt ? p.quelleTyp : 'keine',
            quelleText: belegt ? p.quelleText.slice(0, 120) : '',
            quelleUrl: belegt ? url : '',
            hinweis: p.hinweis.slice(0, 240),
          };
        });
        return res.status(200).json({ ok: true, result: { positionen: ergebnis, hinweis: ki.hinweis?.slice(0, 300) ?? '' } });
      }
      if (r.stop_reason === 'refusal') return res.status(422).json({ ok: false, error: 'Die Recherche wurde abgelehnt' });
      messages.push({ role: 'assistant', content: r.content });
      // Ended without reporting: ask once more for the report.
      if (r.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Melde jetzt das Ergebnis mit intervalle_melden.' });
    }
    return res.status(502).json({ ok: false, error: 'Die Recherche lieferte kein Ergebnis' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen – bitte kurz warten und erneut versuchen' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ ok: false, code: 'invalid_key', error: 'Der Anthropic API Key in Vercel ist ungültig oder wurde widerrufen.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ ok: false, error: `KI-Dienst nicht erreichbar (${e.status ?? 'Netzwerk'})` });
    console.error('[wartung-lookup]', e);
    return res.status(500).json({ ok: false, error: 'Unerwarteter Fehler bei der Recherche' });
  }
}
