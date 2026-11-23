// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Stores a generated PDF in the signed-in user's Google Drive:
//   POST /api/drive-upload  { docType, filename, data: <base64 PDF> }
//   Authorization: Bearer <Supabase access token of the signed-in user>
// Files land in "GarageOS/<Rechnungen|Offerten|Wartungsplaene|Sonstiges>/<filename>";
// missing folders are created and a file with the same name is replaced (new
// revision), so a re-exported document doesn't pile up duplicates. With the
// drive.file scope these lookups only ever see what this app created.

import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import {
  ReconnectError, accessTokenFrom, bearer, decryptToken, deleteConnection, driveError, getConnection, missingEnv, supabaseUserId,
} from './_drive.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = 'GarageOS';
const FALLBACK_FOLDER = 'Sonstiges';
const MAX_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB (base64 adds a third)

const DOC_FOLDERS: Record<string, string> = {
  Rechnungen: 'Rechnungen',
  Anzahlungsrechnungen: 'Rechnungen',
  Offerten: 'Offerten',
  Materialofferten: 'Offerten',
  Wartungsplaene: 'Wartungsplaene',
};

const folderFor = (docType: unknown): string =>
  typeof docType === 'string' && Object.hasOwn(DOC_FOLDERS, docType) ? DOC_FOLDERS[docType] : FALLBACK_FOLDER;

/** Drive query literal: backslash and single quote escaped. */
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** File names: no path separators, no control characters, bounded length. */
const cleanName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

async function driveJson<T>(url: string, gToken: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw await driveError(r);
  return (await r.json()) as T;
}

async function findOne(gToken: string, query: string): Promise<string | null> {
  const url = `${DRIVE}?q=${encodeURIComponent(`${query} and trashed=false`)}&orderBy=createdTime&fields=files(id,createdTime)&pageSize=20`;
  const j = await driveJson<{ files?: { id: string; createdTime?: string }[] }>(url, gToken);
  // Oldest, then lowest id: every request settles on the same item if duplicates exist.
  const key = (f: { id: string; createdTime?: string }) => `${f.createdTime ?? ''}|${f.id}`;
  const [first] = [...(j.files ?? [])].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return first?.id ?? null;
}

async function ensureFolder(gToken: string, name: string, parent: string): Promise<string> {
  const query = `name=${q(name)} and mimeType=${q(FOLDER_MIME)} and ${q(parent)} in parents`;
  const found = await findOne(gToken, query);
  if (found) return found;
  const created = await driveJson<{ id: string }>(`${DRIVE}?fields=id`, gToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  // Drive allows equal names: if another device created it too, use the oldest.
  // The spare stays untouched, because a parallel upload may already be using it.
  return (await findOne(gToken, query).catch(() => null)) ?? created.id;
}

async function uploadPdf(gToken: string, parent: string, filename: string, pdf: Uint8Array<ArrayBuffer>): Promise<{ id: string; webViewLink?: string }> {
  const existing = await findOne(gToken, `name=${q(filename)} and ${q(parent)} in parents and mimeType='application/pdf'`);
  const boundary = `garageos${crypto.randomUUID().replace(/-/g, '')}`;
  // On update the parents can't be set through the metadata part.
  const meta = existing ? { name: filename } : { name: filename, parents: [parent], mimeType: 'application/pdf' };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    pdf,
    `\r\n--${boundary}--`,
  ]);
  const url = existing
    ? `${UPLOAD}/${existing}?uploadType=multipart&fields=id,webViewLink`
    : `${UPLOAD}?uploadType=multipart&fields=id,webViewLink`;
  return driveJson(url, gToken, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur POST' });

  const token = bearer(req);
  const userId = token ? await supabaseUserId(token) : null;
  if (!token || !userId) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });

  const missing = missingEnv();
  if (missing.length) return res.status(501).json({ ok: false, configured: false, missing, error: `In Vercel fehlen: ${missing.join(', ')}` });

  let body: { docType?: unknown; filename?: unknown; data?: unknown };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }

  const folder = folderFor(body.docType);
  const rawName = typeof body.filename === 'string' ? cleanName(body.filename) : '';
  const filename = rawName && !/\.pdf$/i.test(rawName) ? `${rawName}.pdf` : rawName;
  const data = typeof body.data === 'string' ? body.data : '';
  if (!filename || !data) return res.status(400).json({ ok: false, error: 'filename und data erforderlich' });

  let pdf: Uint8Array<ArrayBuffer>;
  try {
    pdf = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültige Base64-Daten' });
  }
  if (pdf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'PDF zu gross für den Upload' });
  if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') return res.status(400).json({ ok: false, error: 'Keine PDF-Datei' });

  try {
    const row = await getConnection(token, userId);
    if (!row) return res.status(409).json({ ok: false, connected: false, error: 'Google Drive nicht verbunden' });
    let refresh: string;
    try {
      refresh = await decryptToken(row.refresh_token_enc, userId);
    } catch {
      // GOOGLE_CLIENT_SECRET was rotated: the stored token can't be read anymore.
      throw new ReconnectError('Google-Verbindung ungültig – bitte neu verbinden');
    }
    const gToken = await accessTokenFrom(refresh);
    const root = await ensureFolder(gToken, ROOT_NAME, 'root');
    const parent = await ensureFolder(gToken, folder, root);
    const file = await uploadPdf(gToken, parent, filename, pdf);
    const folderPath = `${ROOT_NAME}/${folder}`;
    return res.status(200).json({ ok: true, id: file.id, webViewLink: file.webViewLink, folder: folderPath, path: `${folderPath}/${filename}` });
  } catch (err) {
    if (err instanceof ReconnectError) {
      await deleteConnection(token, userId).catch(() => undefined);
      return res.status(409).json({ ok: false, connected: false, reconnect: true, error: err.message });
    }
    return res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
