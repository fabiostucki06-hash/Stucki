// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Reads an uploaded PDF (Offerte, Rechnung, Kostenvoranschlag …) with Claude and
// returns its data as structured JSON, from which the app creates a draft:
//   POST /api/pdf-import  { data: <base64 PDF>, filename? } → { ok: true, result: PdfImportResult }
//   GET  /api/pdf-import  → { configured } (whether ANTHROPIC_API_KEY is set)
//   Authorization: Bearer <Supabase access token of the signed-in user>
// The PDF goes to Claude as a document block (text and scanned pages alike), so
// no separate PDF parser or OCR step is needed.
// Environment variable: ANTHROPIC_API_KEY (required).

import Anthropic from '@anthropic-ai/sdk';
import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import { supabaseUserOk } from './drive-upload.js';

declare const process: { env: Record<string, string | undefined> };

const MAX_BYTES = 3 * 1024 * 1024; // base64 adds a third; Vercel caps request bodies at 4.5 MB

/** Mirrors PdfImportResult in src/lib/pdf-import.ts. Unknown text = "", unknown number = 0. */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dokumentTyp', 'kunde', 'titel', 'datum', 'dokumentNummer', 'positionen', 'gesamttotal', 'notizen'],
  properties: {
    dokumentTyp: { type: 'string', enum: ['offerte', 'rechnung', 'unbekannt'] },
    kunde: {
      type: 'object',
      additionalProperties: false,
      required: ['vorname', 'nachname', 'firma', 'telefon', 'email', 'strasse', 'plzOrt', 'marke', 'modell', 'kennzeichen', 'chassisnummer', 'km', 'erstzulassung'],
      properties: {
        vorname: { type: 'string' },
        nachname: { type: 'string' },
        firma: { type: 'string' },
        telefon: { type: 'string' },
        email: { type: 'string' },
        strasse: { type: 'string' },
        plzOrt: { type: 'string' },
        marke: { type: 'string' },
        modell: { type: 'string' },
        kennzeichen: { type: 'string' },
        chassisnummer: { type: 'string' },
        km: { type: 'string' },
        erstzulassung: { type: 'string' },
      },
    },
    titel: { type: 'string' },
    datum: { type: 'string' },
    dokumentNummer: { type: 'string' },
    positionen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['typ', 'beschreibung', 'menge', 'einzelpreis', 'total', 'stunden', 'stundenansatz'],
        properties: {
          typ: { type: 'string', enum: ['arbeit', 'material'] },
          beschreibung: { type: 'string' },
          menge: { type: 'number' },
          einzelpreis: { type: 'number' },
          total: { type: 'number' },
          stunden: { type: 'number' },
          stundenansatz: { type: 'number' },
        },
      },
    },
    gesamttotal: { type: 'number' },
    notizen: { type: 'string' },
  },
} as const;

const PROMPT = `Lies dieses Dokument einer Autowerkstatt (Offerte, Rechnung, Kostenvoranschlag o. ä.) und gib seine Daten im vorgegebenen JSON-Format zurück.

- dokumentTyp: "offerte" für Offerten/Angebote/Kostenvoranschläge, "rechnung" für Rechnungen, sonst "unbekannt".
- kunde: der Empfänger bzw. Kunde (nicht die ausstellende Werkstatt) und sein Fahrzeug. Bei einer Firma ohne Kontaktperson den Firmennamen in "firma".
- datum im Format YYYY-MM-DD.
- positionen: jede einzelne Position in der Reihenfolge des Dokuments, ohne Zwischensummen, Rabatt-, MWST- oder Totalzeilen.
  - typ "arbeit" für Arbeitszeit/Lohn (Stunden, AW, ZE), "material" für Teile, Material, Pauschalen und alles andere.
  - menge, einzelpreis, total in CHF ohne Tausendertrennzeichen; total = Positionsbetrag wie gedruckt.
  - Bei Arbeit: stunden = Arbeitszeit in Stunden (ZE/100, Minuten/60), stundenansatz = Ansatz in CHF pro Stunde.
- gesamttotal: der zu bezahlende Endbetrag des Dokuments.
- notizen: Bemerkungen oder Zahlungsbedingungen, die nicht zu einer Position gehören.
Was im Dokument nicht steht: Text als "", Zahlen als 0. Nichts erfinden.`;

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  const configured = !!process.env.ANTHROPIC_API_KEY?.trim();
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur GET/POST' });

  const auth = req.headers?.authorization;
  const token = (Array.isArray(auth) ? auth[0] : auth)?.replace(/^Bearer\s+/i, '');
  if (!token || !(await supabaseUserOk(token))) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });

  if (!configured) {
    return res.status(501).json({ ok: false, configured: false, error: 'PDF-Import ist nicht eingerichtet – in Vercel fehlt die Umgebungsvariable ANTHROPIC_API_KEY' });
  }

  let data: string;
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as { data?: unknown };
    data = typeof body.data === 'string' ? body.data.replace(/\s+/g, '') : '';
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }
  if (!data || !/^[A-Za-z0-9+/]+=*$/.test(data)) return res.status(400).json({ ok: false, error: 'Keine PDF-Datei erhalten' });
  if (data.length * 0.75 > MAX_BYTES) return res.status(413).json({ ok: false, error: 'PDF ist zu gross (max. 3 MB)' });
  if (!data.startsWith('JVBER')) return res.status(400).json({ ok: false, error: 'Die Datei ist kein PDF' }); // "%PDF"

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // A declined request is re-run on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') return res.status(422).json({ ok: false, error: 'Das Dokument konnte nicht ausgewertet werden' });
    if (response.stop_reason === 'max_tokens') return res.status(422).json({ ok: false, error: 'Das Dokument hat zu viele Positionen für einen Import' });
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return res.status(200).json({ ok: true, result: JSON.parse(text) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ ok: false, error: 'Zu viele Anfragen – bitte kurz warten und erneut versuchen' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ ok: false, error: 'ANTHROPIC_API_KEY ist ungültig' });
    if (e instanceof Anthropic.BadRequestError) return res.status(422).json({ ok: false, error: `PDF konnte nicht gelesen werden: ${e.message}` });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ ok: false, error: `KI-Dienst nicht erreichbar (${e.status ?? 'Netzwerk'})` });
    if (e instanceof SyntaxError) return res.status(502).json({ ok: false, error: 'Antwort der KI war unvollständig' });
    console.error('[pdf-import]', e);
    return res.status(500).json({ ok: false, error: 'Unerwarteter Fehler beim Import' });
  }
}
