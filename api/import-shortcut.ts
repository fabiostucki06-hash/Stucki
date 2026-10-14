// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Background part import for an iOS Shortcut ("Inhalte von URL abrufen", POST JSON):
//   { "token": "<Kurzbefehl-Schlüssel>", "import_url": "<shared link or text>",
//     "active_offerte_id": "<optional, defaults to the user's active Offerte>" }
// Scrapes the part like /api/import-part, then appends it to the Offerte through
// the shortcut_add_part() RPC (see supabase/migrations/…_shortcut_import.sql),
// which checks the key, so no app UI has to render. The JSON answer carries a
// German `message` for the Shortcut's "Mitteilung anzeigen" and, when the part
// can't be placed automatically, an `open_url` that opens the import sheet.

import { extractPart, type VercelLikeRequest, type VercelLikeResponse } from './import-part.js';
import { cleanPartTitle } from '../src/lib/partTitle.js';

const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';
// Public anon key (same as in src/lib/supabase.ts); the RPC does its own auth via the token.
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

interface ShortcutBody {
  token?: string;
  import_url?: string;
  /** Alias for import_url when the Shortcut forwards share text instead of a link. */
  import_text?: string;
  active_offerte_id?: string;
}

interface RpcResult {
  ok: boolean;
  code?: 'unauthorized' | 'no_active_offerte' | 'offerte_not_found' | 'offerte_closed' | 'incomplete_part';
  offertNumber?: number;
  beschreibung?: string;
  vk?: string;
}

interface ShortcutRequest extends VercelLikeRequest {
  headers?: Record<string, string | string[] | undefined>;
}

const MESSAGES: Record<NonNullable<RpcResult['code']>, string> = {
  unauthorized: 'Ungültiger Kurzbefehl-Schlüssel. Bitte in GarageOS → Einstellungen neu erzeugen.',
  no_active_offerte: 'Keine aktive Offerte gewählt – Teil bitte in GarageOS zuordnen.',
  offerte_not_found: 'Die gewählte Offerte existiert nicht mehr.',
  offerte_closed: 'Die aktive Offerte ist bereits angenommen oder abgelehnt.',
  incomplete_part: 'Titel oder Preis nicht erkannt – Teil bitte in GarageOS ergänzen.',
};

function header(req: ShortcutRequest, name: string): string | undefined {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Same entry point the app already handles (App.tsx): opens the prefilled import sheet. */
function appImportUrl(req: ShortcutRequest, body: ShortcutBody): string {
  const host = header(req, 'x-forwarded-host') || header(req, 'host') || 'localhost';
  const proto = header(req, 'x-forwarded-proto') || 'https';
  const q = new URLSearchParams();
  if (body.import_url) q.set('import_url', body.import_url);
  if (body.import_text) q.set('import_text', body.import_text);
  if (body.active_offerte_id) q.set('offerte_id', body.active_offerte_id);
  return `${proto}://${host}/?${q}`;
}

export default async function handler(req: ShortcutRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Nur POST erlaubt.' });
    return;
  }
  let body: ShortcutBody | undefined;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ShortcutBody | undefined;
  } catch {
    res.status(400).json({ ok: false, message: 'Ungültiges JSON.' });
    return;
  }
  const token = body?.token?.trim();
  if (!body || !token) {
    res.status(401).json({ ok: false, code: 'unauthorized', message: MESSAGES.unauthorized });
    return;
  }
  if (!body.import_url?.trim() && !body.import_text?.trim()) {
    res.status(400).json({ ok: false, message: 'Kein Link erhalten (import_url fehlt).' });
    return;
  }

  const part = await extractPart({ url: body.import_url, text: body.import_text });
  const ek = parseFloat(part.ek);

  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/shortcut_add_part`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({
      p_token: token,
      p_offerte_id: body.active_offerte_id?.trim() || null,
      p_beschreibung: cleanPartTitle(part.title ?? ''),
      p_ek: ek > 0 ? ek : null,
      p_artikelnummer: part.artikelnummer || null,
      p_link: part.quelle || body.import_url || null,
    }),
  });
  if (!r.ok) {
    console.error('[import-shortcut] RPC failed:', r.status, await r.text());
    res.status(502).json({ ok: false, message: 'Speichern fehlgeschlagen – bitte später erneut versuchen.', open_url: appImportUrl(req, body) });
    return;
  }
  const result = (await r.json()) as RpcResult;

  if (result.ok) {
    res.status(200).json({
      ok: true,
      offertNumber: result.offertNumber,
      beschreibung: result.beschreibung,
      vk: result.vk,
      message: `Teil erfolgreich zu Offerte #${result.offertNumber} hinzugefügt!`,
    });
    return;
  }
  const code = result.code ?? 'incomplete_part';
  res.status(code === 'unauthorized' ? 401 : 200).json({
    ok: false,
    code,
    message: MESSAGES[code] + (code === 'incomplete_part' && part.blocked ? ' (Shop hat die Abfrage blockiert.)' : ''),
    // Everything but a bad key can still be finished by hand in the app.
    open_url: code === 'unauthorized' ? undefined : appImportUrl(req, body),
  });
}
