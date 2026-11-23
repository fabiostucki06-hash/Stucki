// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Stores a generated PDF in the signed-in user's Google Drive:
//   POST /api/drive-upload  { docType, filename, data: <base64 PDF> }
//   Authorization: Bearer <Supabase access token of the signed-in user>
// Files land in "GarageOS/<Aufträge|Rechnungen|Offerten|Wartungspläne|Sonstiges>/<filename>";
// all missing folders are created and a file with the same name is replaced (new
// revision), so a re-exported document doesn't pile up duplicates. With the
// drive.file scope these lookups only ever see what this app created.

import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import {
  ReconnectError, TransientDriveError, accessTokenFrom, bearer, decryptToken, deleteConnection, driveError, getConnection,
  googleFetch, missingEnv, supabaseUserId,
} from './_drive.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = 'GarageOS';
const FALLBACK_FOLDER = 'Sonstiges';
const MAX_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB (base64 adds a third)
const MAX_ATTEMPTS = 3;
const RETRY_WINDOW_MS = 25_000; // stays inside the function's maxDuration (vercel.json)
const MAX_SEARCH_PAGES = 5;

const SUBFOLDERS = ['Aufträge', 'Rechnungen', 'Offerten', 'Wartungspläne', FALLBACK_FOLDER];

const DOC_FOLDERS: Record<string, string> = {
  Aufträge: 'Aufträge',
  Auftragsbestätigungen: 'Aufträge',
  Rechnungen: 'Rechnungen',
  Anzahlungsrechnungen: 'Rechnungen',
  Offerten: 'Offerten',
  Materialofferten: 'Offerten',
  Wartungsplaene: 'Wartungspläne',
};

const folderFor = (docType: unknown): string =>
  typeof docType === 'string' && Object.hasOwn(DOC_FOLDERS, docType) ? DOC_FOLDERS[docType] : FALLBACK_FOLDER;

/** Drive query literal: backslash and single quote escaped. */
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** File names: no path separators, no control characters, bounded length. */
const cleanName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

async function driveJson<T>(url: string, gToken: string, init: RequestInit = {}): Promise<T> {
  const r = await googleFetch(url, { ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw await driveError(r);
  return (await r.json()) as T;
}

/** Runs the idempotent find-or-create chain again after a temporary failure. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const retry = err instanceof TransientDriveError && attempt < MAX_ATTEMPTS && Date.now() - started < RETRY_WINDOW_MS;
      if (!retry) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * 3 ** (attempt - 1)));
    }
  }
}

async function findOne(gToken: string, query: string): Promise<string | null> {
  const base = `${DRIVE}?q=${encodeURIComponent(`${query} and trashed=false`)}&orderBy=createdTime&fields=nextPageToken,files(id,createdTime)&pageSize=20`;
  let pageToken: string | undefined;
  // Drive may return an empty page with a nextPageToken: that doesn't mean "not found".
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const url = pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base;
    const j = await driveJson<{ nextPageToken?: string; files?: { id: string; createdTime?: string }[] }>(url, gToken);
    if (j.files?.length) {
      // Oldest, then lowest id: every request settles on the same item if duplicates exist.
      const key = (f: { id: string; createdTime?: string }) => `${f.createdTime ?? ''}|${f.id}`;
      return [...j.files].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))[0].id;
    }
    if (!j.nextPageToken) return null;
    pageToken = j.nextPageToken;
  }
  // Unfinished search: creating now could duplicate a folder that exists.
  throw new TransientDriveError('Google-Drive-Suche unvollständig – später erneut exportieren');
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
    ? `${UPLOAD}/${existing}?uploadType=multipart&fields=id,webViewLink,size`
    : `${UPLOAD}?uploadType=multipart&fields=id,webViewLink,size`;
  const file = await driveJson<{ id: string; webViewLink?: string; size?: string }>(url, gToken, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  // Success is only reported once Drive holds the complete file.
  if (file.size !== undefined && Number(file.size) !== pdf.length) {
    throw new TransientDriveError('Upload unvollständig – später erneut exportieren');
  }
  return file;
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
  if (pdf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'PDF ist grösser als 3 MB' });
  if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') return res.status(400).json({ ok: false, error: 'Keine PDF-Datei' });

  try {
    const row = await getConnection(token, userId);
    if (!row) return res.status(409).json({ ok: false, connected: false, error: 'Google Drive nicht verbunden' });
    let refresh: string;
    try {
      refresh = await decryptToken(row.refresh_token_enc, userId);
    } catch {
      // GOOGLE_CLIENT_SECRET changed: kept, because restoring a mistyped secret makes it readable again.
      throw new ReconnectError('Google-Verbindung nicht lesbar – in den Einstellungen trennen und neu verbinden', true);
    }
    const file = await withRetry(async () => {
      const gToken = await accessTokenFrom(refresh);
      const root = await ensureFolder(gToken, ROOT_NAME, 'root');
      const ids = await Promise.all(SUBFOLDERS.map((name) => ensureFolder(gToken, name, root)));
      return uploadPdf(gToken, ids[SUBFOLDERS.indexOf(folder)], filename, pdf);
    });
    const folderPath = `${ROOT_NAME}/${folder}`;
    return res.status(200).json({ ok: true, id: file.id, webViewLink: file.webViewLink, folder: folderPath, path: `${folderPath}/${filename}` });
  } catch (err) {
    console.error('[drive-upload] failed', { folder, reconnect: err instanceof ReconnectError, message: err instanceof Error ? err.message : String(err) });
    if (err instanceof ReconnectError) {
      if (err.keepConnection) return res.status(409).json({ ok: false, reconnect: true, error: err.message });
      await deleteConnection(token, userId).catch(() => undefined);
      return res.status(409).json({ ok: false, connected: false, reconnect: true, error: err.message });
    }
    return res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
