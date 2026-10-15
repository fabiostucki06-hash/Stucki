// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Background part import for an iOS Shortcut ("Inhalte von URL abrufen"), either
//   GET  /api/import-shortcut?import_url=<link>[&active_offerte_id=<id>]
//   POST /api/import-shortcut  { "import_url", "active_offerte_id"? }
// (GET /api/import-part?… lands here too). No key is required: the part goes
// into the active Offerte. An optional legacy `token` (or "Authorization:
// Bearer <key>") still picks that user's settings when valid. Scrapes the part like /api/import-part, then appends it through the
// shortcut_add_part() RPC (supabase/migrations/…_shortcut_import.sql) and only
// answers success once that write has committed. The JSON carries `success`,
// a German `message` for "Mitteilung anzeigen", `error` on failure and, when the
// part can't be placed automatically, an `open_url` that opens the import sheet.

import { extractPart, type VercelLikeRequest, type VercelLikeResponse } from './import-part.js';
import { cleanPartTitle } from '../src/lib/partTitle.js';

const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';
// Public anon key (same as in src/lib/supabase.ts); the RPC is open to anon.
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

interface ShortcutInput {
  token?: string;
  import_url?: string;
  /** Alias for import_url when the Shortcut forwards share text instead of a link. */
  import_text?: string;
  active_offerte_id?: string;
}

type ErrorCode = 'no_active_offerte' | 'offerte_not_found' | 'offerte_closed' | 'incomplete_part';

interface RpcResult {
  ok: boolean;
  code?: ErrorCode;
  offertNumber?: number;
  beschreibung?: string;
  vk?: string;
}

/** `error` (stable, for logs/automation) and German `message` (shown on the iPhone). */
const ERRORS: Record<ErrorCode, { error: string; message: string }> = {
  no_active_offerte: { error: 'Keine aktive Offerte gewählt', message: 'Keine aktive Offerte gewählt – Teil bitte in GarageOS zuordnen.' },
  offerte_not_found: { error: 'Active offer not found', message: 'Die gewählte Offerte existiert nicht mehr.' },
  offerte_closed: { error: 'Active offer is no longer open', message: 'Die aktive Offerte ist bereits angenommen oder abgelehnt.' },
  incomplete_part: { error: 'Could not read title or price', message: 'Titel oder Preis nicht erkannt – Teil bitte in GarageOS ergänzen.' },
};

type Json = Record<string, unknown>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function readInput(req: VercelLikeRequest): ShortcutInput | null {
  const q = req.query ?? {};
  let body: Record<string, unknown> = {};
  if (req.method === 'POST' && req.body) {
    try {
      body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const pick = (k: keyof ShortcutInput) => (typeof body[k] === 'string' ? (body[k] as string).trim() || undefined : undefined) ?? first(q[k]);
  const bearer = first(req.headers?.authorization)?.match(/^Bearer\s+(.+)$/i)?.[1];
  return {
    token: pick('token') ?? bearer,
    import_url: pick('import_url'),
    import_text: pick('import_text'),
    active_offerte_id: pick('active_offerte_id') ?? first(q.offerte_id),
  };
}

/** Same entry point the app already handles (App.tsx): opens the prefilled import sheet. */
function appImportUrl(req: VercelLikeRequest, input: ShortcutInput): string {
  const host = first(req.headers?.['x-forwarded-host']) || first(req.headers?.host) || 'localhost';
  const proto = first(req.headers?.['x-forwarded-proto']) || 'https';
  const q = new URLSearchParams();
  if (input.import_url) q.set('import_url', input.import_url);
  if (input.import_text) q.set('import_text', input.import_text);
  if (input.active_offerte_id) q.set('offerte_id', input.active_offerte_id);
  return `${proto}://${host}/?${q}`;
}

/** Shop host ("autodoc.ch") the part came from; the app groups orders by it (src/lib/suppliers.ts). */
function supplierDomain(link: string | undefined): string | undefined {
  try {
    return link ? new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

const fail = (status: number, code: ErrorCode, extra: Json = {}) => ({
  status, json: { success: false, ok: false, code, ...ERRORS[code], ...extra },
});

/** Parse + save. Shared by GET/POST /api/import-shortcut and GET /api/import-part. */
export async function runShortcutImport(req: VercelLikeRequest): Promise<{ status: number; json: Json }> {
  const input = readInput(req);
  if (!input) return { status: 400, json: { success: false, ok: false, error: 'Invalid JSON body', message: 'Ungültiges JSON.' } };
  if (!input.import_url && !input.import_text) {
    return { status: 400, json: { success: false, ok: false, error: 'Missing import_url', message: 'Kein Link erhalten (import_url fehlt).' } };
  }

  const part = await extractPart({ url: input.import_url, text: input.import_text });
  const ek = parseFloat(part.ek);
  console.log('[import-shortcut] parsed:', { url: input.import_url, title: part.title, ek: part.ek, artnr: part.artikelnummer, blocked: part.blocked, error: part.error });

  let r: Response;
  try {
    r = await fetch(`${SUPA_URL}/rest/v1/rpc/shortcut_add_part`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        p_token: input.token ?? null,
        p_offerte_id: input.active_offerte_id ?? null,
        p_beschreibung: cleanPartTitle(part.title ?? ''),
        p_ek: ek > 0 ? ek : null,
        p_artikelnummer: part.artikelnummer || null,
        p_link: part.quelle || input.import_url || null,
      }),
    });
  } catch (e) {
    console.error('[import-shortcut] database unreachable:', e);
    return { status: 502, json: { success: false, ok: false, error: 'Database unreachable', message: 'Speichern fehlgeschlagen – bitte später erneut versuchen.', open_url: appImportUrl(req, input) } };
  }
  if (!r.ok) {
    // PGRST202 here means the shortcut_import migration isn't applied.
    console.error('[import-shortcut] RPC failed:', r.status, await r.text());
    return { status: 502, json: { success: false, ok: false, error: `Database write failed (HTTP ${r.status})`, message: 'Speichern fehlgeschlagen – bitte später erneut versuchen.', open_url: appImportUrl(req, input) } };
  }
  const result = (await r.json()) as RpcResult;

  if (result.ok) {
    console.log('[import-shortcut] saved to Offerte #%s:', result.offertNumber, result.beschreibung);
    return {
      status: 200,
      json: {
        success: true, ok: true,
        offertNumber: result.offertNumber, beschreibung: result.beschreibung, artikelnummer: part.artikelnummer, ek: part.ek, vk: result.vk,
        quelle: part.quelle, lieferant: supplierDomain(part.quelle || input.import_url),
        message: 'Teil zu Offerte hinzugefügt',
      },
    };
  }
  const code = result.code ?? 'incomplete_part';
  console.warn('[import-shortcut] not saved:', code);
  const extra: Json = { open_url: appImportUrl(req, input) };
  if (code === 'incomplete_part' && part.blocked) extra.message = `${ERRORS[code].message} (Shop hat die Abfrage blockiert.)`;
  return fail(422, code, extra);
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ success: false, ok: false, error: 'Method not allowed', message: 'Nur GET oder POST erlaubt.' });
    return;
  }
  const { status, json } = await runShortcutImport(req);
  res.status(status).json(json);
}
