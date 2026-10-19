// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Stores a generated PDF in Google Drive:
//   POST /api/drive-upload  { rootFolderId?, folder: string[], filename, data: <base64 PDF> }
//   POST /api/drive-upload  { test: true, rootFolderId? } → { name } of the reachable target folder
//   GET  /api/drive-upload  → { configured } (status shown in Einstellungen)
//   Authorization: Bearer <Supabase access token of the signed-in user>
// Files land in <root>/<folder…>/<filename>; missing folders are created and a
// file with the same name in the target folder is replaced (new revision), so a
// re-exported document doesn't pile up duplicates.
//
// Google access uses an OAuth refresh token of the Drive owner (service accounts
// have no storage quota in a personal "Meine Ablage"). Environment variables:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN  (required)
//   GOOGLE_DRIVE_FOLDER_ID  (optional root folder; default: "GarageOS" in My Drive)
// Without them the endpoint answers 501 { configured: false } and the app skips the upload.

import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';

declare const process: { env: Record<string, string | undefined> };

const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';
// Public anon key (same as in src/lib/supabase.ts).
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_NAME = 'GarageOS';
const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

interface UploadBody {
  /** Target folder chosen in Einstellungen; overrides GOOGLE_DRIVE_FOLDER_ID. */
  rootFolderId?: unknown;
  /** true: only check that the target folder is reachable, upload nothing. */
  test?: unknown;
  folder?: unknown;
  filename?: unknown;
  data?: unknown;
}

const header = (req: VercelLikeRequest, name: string): string | undefined => {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
};

/** Drive query literal: backslash and single quote escaped. */
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Folder / file names: no path separators, no control characters, bounded length. */
const cleanName = (s: string) => s.replace(/[\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

async function supabaseUserOk(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return false;
    const u = (await r.json()) as { id?: string };
    return !!u.id;
  } catch {
    return false;
  }
}

async function googleAccessToken(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }).toString(),
  });
  const j = (await r.json()) as { access_token?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google-Anmeldung fehlgeschlagen (${j.error ?? r.status})`);
  return j.access_token;
}

async function driveJson<T>(url: string, gToken: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function findOne(gToken: string, query: string): Promise<string | null> {
  const url = `${DRIVE}?q=${encodeURIComponent(`${query} and trashed=false`)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const j = await driveJson<{ files?: { id: string }[] }>(url, gToken);
  return j.files?.[0]?.id ?? null;
}

async function ensureFolder(gToken: string, name: string, parent: string): Promise<string> {
  const found = await findOne(gToken, `name=${q(name)} and mimeType=${q(FOLDER_MIME)} and ${q(parent)} in parents`);
  if (found) return found;
  const created = await driveJson<{ id: string }>(`${DRIVE}?supportsAllDrives=true&fields=id`, gToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  return created.id;
}

const FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

/** The folder exists, is not trashed and the Drive account may add files to it; returns its name. */
async function checkFolder(gToken: string, id: string): Promise<string> {
  const r = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${gToken}` },
  });
  if (r.status === 404) throw new Error('Ordner nicht gefunden oder kein Zugriff für das Drive-Konto');
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const f = (await r.json()) as { name?: string; mimeType?: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } };
  if (f.mimeType !== FOLDER_MIME) throw new Error('Die ID gehört nicht zu einem Ordner');
  if (f.trashed) throw new Error('Der Ordner liegt im Papierkorb');
  if (f.capabilities?.canAddChildren === false) throw new Error('Keine Schreibrechte für diesen Ordner');
  return f.name ?? id;
}

async function uploadPdf(gToken: string, parent: string, filename: string, pdf: Uint8Array<ArrayBuffer>): Promise<{ id: string; webViewLink?: string }> {
  const existing = await findOne(gToken, `name=${q(filename)} and ${q(parent)} in parents and mimeType='application/pdf'`);
  const boundary = `garageos${Date.now().toString(36)}`;
  // On update the parents can't be set through the metadata part.
  const meta = existing ? { name: filename } : { name: filename, parents: [parent], mimeType: 'application/pdf' };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    pdf,
    `\r\n--${boundary}--`,
  ]);
  const url = existing
    ? `${UPLOAD}/${existing}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`
    : `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`;
  return driveJson(url, gToken, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  // GET: status probe for Einstellungen → Integrationen (reveals nothing but the flag).
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur GET/POST' });

  if (!configured) return res.status(501).json({ ok: false, configured: false, error: 'Google Drive ist nicht eingerichtet' });

  const token = header(req, 'authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !(await supabaseUserOk(token))) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });

  let body: UploadBody;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as UploadBody;
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }
  const rootFolderId = typeof body.rootFolderId === 'string' ? body.rootFolderId.trim() : '';
  if (rootFolderId && !FOLDER_ID_RE.test(rootFolderId)) return res.status(400).json({ ok: false, error: 'Ungültige Ordner-ID' });

  if (body.test === true) {
    try {
      const gToken = await googleAccessToken();
      const id = rootFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (id) return res.status(200).json({ ok: true, name: await checkFolder(gToken, id) });
      // Default target: "GarageOS" in My Drive, created on the first upload.
      const found = await findOne(gToken, `name=${q(ROOT_NAME)} and mimeType=${q(FOLDER_MIME)} and 'root' in parents`);
      return res.status(200).json({ ok: true, name: found ? ROOT_NAME : `${ROOT_NAME} (wird beim ersten Upload angelegt)` });
    } catch (err) {
      return res.status(422).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const folder = Array.isArray(body.folder) ? body.folder.filter((s): s is string => typeof s === 'string').map(cleanName).filter(Boolean).slice(0, 4) : [];
  const rawName = typeof body.filename === 'string' ? cleanName(body.filename) : '';
  const filename = rawName && !/\.pdf$/i.test(rawName) ? `${rawName}.pdf` : rawName;
  const data = typeof body.data === 'string' ? body.data.replace(/^data:application\/pdf;[^,]*,/, '') : '';
  if (!filename || !data) return res.status(400).json({ ok: false, error: 'filename und data erforderlich' });

  let pdf: Uint8Array<ArrayBuffer>;
  try {
    pdf = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültige Base64-Daten' });
  }
  if (pdf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'PDF zu gross' });
  if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') return res.status(400).json({ ok: false, error: 'Keine PDF-Datei' });

  try {
    const gToken = await googleAccessToken();
    if (rootFolderId) await checkFolder(gToken, rootFolderId);
    let parent = rootFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID || (await ensureFolder(gToken, ROOT_NAME, 'root'));
    for (const name of folder) parent = await ensureFolder(gToken, name, parent);
    const file = await uploadPdf(gToken, parent, filename, pdf);
    return res.status(200).json({ ok: true, id: file.id, webViewLink: file.webViewLink, path: [...folder, filename].join('/') });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
