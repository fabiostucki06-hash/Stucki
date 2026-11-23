// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Opens a Google Drive resumable upload session for the signed-in user:
//   POST /api/drive-upload  { docType, filename, size, customerId?, customerName? }  → { uploadUrl, folder, path }
//   Authorization: Bearer <Supabase access token of the signed-in user>
// The browser then PUTs the PDF straight to uploadUrl, so the file never passes
// through this function's request body (Vercel caps those at 4.5 MB).
// Files land in "GarageOS/<Aufträge|Rechnungen|Offerten|Wartungspläne|Sonstiges>/<Kunde>/<filename>";
// all missing folders are created and a file with the same name is replaced (new
// revision), so a re-exported document doesn't pile up duplicates. A customer folder
// is recognized by the customer id stored on it, so a renamed customer keeps their
// folder and namesakes stay apart. With the drive.file scope these lookups only
// ever see what this app created.
// uploadUrl works without a further token: it is never logged.

import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import {
  ReconnectError, TransientDriveError, accessTokenFrom, bearer, decryptToken, deleteConnection, driveError, getConnection,
  googleFetch, header, missingEnv, supabaseUserId,
} from './_drive.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = 'GarageOS';
const FALLBACK_FOLDER = 'Sonstiges';
const UNKNOWN_CUSTOMER = 'Unbekannter Kunde';
const CUSTOMER_ID_PROP = 'garageosCustomerId';
const MAX_BYTES = 25 * 1024 * 1024; // safety limit, same as src/lib/drive.ts
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

/** Customer folder name: no characters that break paths or sync clients, no leading/trailing dots. */
const cleanFolderName =(s: unknown): string =>
  typeof s !== 'string' ? '' : s.normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();

/** Only a plain id goes into a Drive query and the folder's properties (size-limited by Drive). */
const cleanCustomerId = (s: unknown): string => (typeof s === 'string' && /^[\w-]{1,64}$/.test(s) ? s : '');

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

interface DriveItem { id: string; name?: string; createdTime?: string }

const findOne = async (gToken: string, query: string): Promise<string | null> =>
  (await findItem(gToken, query))?.id ?? null;

async function findItem(gToken: string, query: string): Promise<DriveItem | null> {
  const base = `${DRIVE}?q=${encodeURIComponent(`${query} and trashed=false`)}&orderBy=createdTime&fields=nextPageToken,files(id,name,createdTime)&pageSize=20`;
  let pageToken: string | undefined;
  // Drive may return an empty page with a nextPageToken: that doesn't mean "not found".
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const url = pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base;
    const j = await driveJson<{ nextPageToken?: string; files?: DriveItem[] }>(url, gToken);
    if (j.files?.length) {
      // Oldest, then lowest id: every request settles on the same item if duplicates exist.
      const key = (f: DriveItem) => `${f.createdTime ?? ''}|${f.id}`;
      return [...j.files].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))[0];
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

/** The customer's folder under a document folder. Without a usable id or name: the shared fallback. */
async function ensureCustomerFolder(gToken: string, parent: string, rawName: unknown, rawId: unknown): Promise<{ id: string; name: string }> {
  const cleaned = cleanFolderName(rawName);
  const customerId = cleanCustomerId(rawId);
  if (!cleaned || !customerId) {
    const name = cleaned || UNKNOWN_CUSTOMER;
    return { id: await ensureFolder(gToken, name, parent), name };
  }
  const query = `appProperties has { key=${q(CUSTOMER_ID_PROP)} and value=${q(customerId)} } and mimeType=${q(FOLDER_MIME)} and ${q(parent)} in parents`;
  const existing = await findItem(gToken, query);
  if (existing) return { id: existing.id, name: existing.name ?? cleaned };

  // The name belongs to someone else (a namesake): the id's start tells the two apart.
  const taken = await findOne(gToken, `name=${q(cleaned)} and mimeType=${q(FOLDER_MIME)} and ${q(parent)} in parents`);
  const name = taken ? `${cleaned} (${customerId.slice(0, 6)})` : cleaned;
  const created = await driveJson<{ id: string }>(`${DRIVE}?fields=id`, gToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent], appProperties: { [CUSTOMER_ID_PROP]: customerId } }),
  });
  // Another device may have created it at the same moment: everyone settles on the oldest.
  const settled = await findItem(gToken, query).catch(() => null);
  return settled ? { id: settled.id, name: settled.name ?? name } : { id: created.id, name };
}

/** The app's own origin. Google only answers the browser's PUT (CORS) for the origin named here. */
function appOrigin(req: VercelLikeRequest): string | null {
  const origin = header(req, 'origin');
  const host = (header(req, 'x-forwarded-host') ?? header(req, 'host') ?? '').split(',')[0].trim();
  if (!origin || !host) return null;
  try {
    return new URL(origin).host === host ? origin : null;
  } catch {
    return null;
  }
}

async function startUpload(gToken: string, parent: string, filename: string, size: number, origin: string): Promise<string> {
  const existing = await findOne(gToken, `name=${q(filename)} and ${q(parent)} in parents and mimeType='application/pdf'`);
  // On update the parents can't be set through the metadata.
  const meta = existing ? { name: filename } : { name: filename, parents: [parent], mimeType: 'application/pdf' };
  const url = existing
    ? `${UPLOAD}/${existing}?uploadType=resumable&fields=id,webViewLink,size`
    : `${UPLOAD}?uploadType=resumable&fields=id,webViewLink,size`;
  const r = await googleFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${gToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': String(size),
      Origin: origin,
    },
    body: JSON.stringify(meta),
  });
  if (!r.ok) throw await driveError(r);
  const uploadUrl = r.headers.get('location');
  if (!uploadUrl) throw new TransientDriveError('Google Drive hat keine Upload-Adresse geliefert');
  return uploadUrl;
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur POST' });

  const token = bearer(req);
  const userId = token ? await supabaseUserId(token) : null;
  if (!token || !userId) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });

  const missing = missingEnv();
  if (missing.length) return res.status(501).json({ ok: false, configured: false, missing, error: `In Vercel fehlen: ${missing.join(', ')}` });

  let body: { docType?: unknown; filename?: unknown; size?: unknown; data?: unknown; customerId?: unknown; customerName?: unknown };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }

  const folder = folderFor(body.docType);
  const rawName = typeof body.filename === 'string' ? cleanName(body.filename) : '';
  const filename = rawName && !/\.pdf$/i.test(rawName) ? `${rawName}.pdf` : rawName;
  // A tab still running the previous app version sends the PDF itself.
  if (body.data !== undefined) return res.status(400).json({ ok: false, error: 'App wurde aktualisiert, bitte Seite neu laden und erneut exportieren' });
  const size = body.size;
  if (!filename || typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    return res.status(400).json({ ok: false, error: 'filename und size erforderlich' });
  }
  if (size > MAX_BYTES) return res.status(413).json({ ok: false, error: 'PDF ist grösser als 25 MB' });
  const origin = appOrigin(req);
  if (!origin) return res.status(403).json({ ok: false, error: 'Unbekannte Herkunft der Anfrage' });

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
    const { uploadUrl, customerFolder } = await withRetry(async () => {
      const gToken = await accessTokenFrom(refresh);
      const root = await ensureFolder(gToken, ROOT_NAME, 'root');
      const ids = await Promise.all(SUBFOLDERS.map((name) => ensureFolder(gToken, name, root)));
      const target = await ensureCustomerFolder(gToken, ids[SUBFOLDERS.indexOf(folder)], body.customerName, body.customerId);
      return { uploadUrl: await startUpload(gToken, target.id, filename, size, origin), customerFolder: target.name };
    });
    const folderPath = `${ROOT_NAME}/${folder}/${customerFolder}`;
    return res.status(200).json({ ok: true, uploadUrl, folder: folderPath, path: `${folderPath}/${filename}` });
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
