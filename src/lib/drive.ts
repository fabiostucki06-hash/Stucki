import type { jsPDF } from 'jspdf';
import { getFreshToken } from './supabase';
import { showSavedToast, showToast } from '../components/ui/Toast';

/** Document type of an export; the server maps it to GarageOS/<Ordner>/<Dateiname>.pdf */
export type DriveDocType =
  | 'Rechnungen' | 'Anzahlungsrechnungen' | 'Offerten' | 'Materialofferten'
  | 'Auftragsbestätigungen' | 'Aufträge' | 'Wartungsplaene';

export interface DriveStatus {
  configured: boolean;
  connected: boolean;
  account: string;
  /** Required Vercel env vars that are not set. */
  missing: string[];
  /** Redirect URI to register at the Google OAuth client. */
  redirectUri: string;
}

const CALLBACK_PATH = '/drive-callback';

/** Only a positive answer is cached, so a fresh connection or setup fix applies to the next export. */
let knownConnected = false;
const remember = (connected: boolean) => { knownConnected = connected; };

const AUTH_TIMEOUT_MS = 20_000;
const SESSION_TIMEOUT_MS = 70_000; // a little above the server's maxDuration
const MIN_TRANSFER_TIMEOUT_MS = 60_000;
const MIN_BYTES_PER_MS = 50; // 50 kB/s: slower connections time out instead of blocking the queue
const STATUS_TIMEOUT_MS = 15_000;
const MAX_UPLOAD_ATTEMPTS = 3;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // same limit as api/drive-upload.ts
const FAILURE_TOAST_MS = 10_000; // long enough to read that the PDF is only local

/** A request that never answers must not block the upload queue forever. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error('Zeitüberschreitung');
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

async function authCall<T>(body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string }> {
  const token = await getFreshToken();
  if (!token) throw new Error('Nicht angemeldet');
  const r = await fetchWithTimeout('/api/drive-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }, AUTH_TIMEOUT_MS);
  if (r.status === 404) throw new Error('Server-Funktion nicht verfügbar (lokale Entwicklung)');
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Fehler ${r.status}`);
  return j;
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const s = await authCall<DriveStatus>({ action: 'status' });
  remember(s.connected);
  return s;
}

/** Leaves the app for Google's consent page; it comes back on /drive-callback. */
export async function connectDrive(): Promise<void> {
  const { url } = await authCall<{ url: string }>({ action: 'start' });
  window.location.assign(url);
}

export async function disconnectDrive(): Promise<void> {
  await authCall({ action: 'disconnect' });
  remember(false);
}

/** True while the app is on Google's redirect back; the tab should show Einstellungen. */
export const isDriveCallback = (): boolean => window.location.pathname.replace(/\/+$/, '') === CALLBACK_PATH;

/** Completes the OAuth redirect. The code leaves the address bar first, so a
    reload or a second effect run can't submit it twice. */
export async function finishDriveCallback(): Promise<void> {
  if (!isDriveCallback()) return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error');
  window.history.replaceState({}, '', '/');
  if (denied) {
    showToast(denied === 'access_denied' ? 'Google Drive nicht verbunden' : `Google Drive: ${denied}`, 'error');
    return;
  }
  if (!code || !state) return;
  try {
    await authCall({ action: 'finish', code, state });
    remember(true);
    showToast('Google Drive verbunden', 'success');
    window.dispatchEvent(new Event('garage-drive-changed'));
  } catch (err) {
    showToast(`Google Drive: ${err instanceof Error ? err.message : 'Verbindung fehlgeschlagen'}`, 'error');
  }
}

/** Why an upload can't start, or null when Drive is ready. */
async function blockedReason(): Promise<string | null> {
  if (knownConnected) return null;
  const s = await getDriveStatus();
  if (s.connected) return null;
  return s.configured
    ? 'Nicht verbunden (Einstellungen → Integrationen)'
    : `Nicht eingerichtet, in Vercel fehlen: ${s.missing.join(', ')}`;
}

function reportFailure(docType: DriveDocType, message: string, detail: Record<string, unknown> = {}): void {
  console.error('[Drive-Upload] fehlgeschlagen', { docType, message, ...detail });
  showToast(`Google Drive: ${message}. Das PDF bleibt nur lokal, es gibt keinen automatischen Nachversuch.`, 'error', FAILURE_TOAST_MS);
}

/** A failure with a readable message for the user and details for the console. */
class UploadError extends Error {
  constructor(message: string, readonly detail: Record<string, unknown>) {
    super(message);
  }
}

/** The server finds or creates the folder and opens a Drive upload session for this file. */
async function openUploadSession(docType: DriveDocType, filename: string, size: number): Promise<{ uploadUrl: string; folder?: string }> {
  const token = await getFreshToken();
  if (!token) throw new UploadError('Sitzung abgelaufen, bitte neu anmelden', { stage: 'session' });
  const r = await fetchWithTimeout('/api/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ docType, filename: `${filename}.pdf`, size }),
  }, SESSION_TIMEOUT_MS);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; error?: string; connected?: boolean; reconnect?: boolean; folder?: string };
  if (r.ok && j.ok && j.uploadUrl) return { uploadUrl: j.uploadUrl, folder: j.folder };
  if (j.connected === false) {
    remember(false);
    window.dispatchEvent(new Event('garage-drive-changed'));
  }
  throw new UploadError(j.error ?? (r.status === 413 ? 'PDF ist grösser als 25 MB' : `Fehler ${r.status}`), {
    stage: 'session', status: r.status, connected: j.connected, reconnect: j.reconnect,
  });
}

/** Success counts only when Drive names the stored file and holds every byte. */
async function holdsCompleteFile(r: Response, size: number): Promise<boolean> {
  const file = (await r.json().catch(() => null)) as { id?: string; size?: string } | null;
  return !!file?.id && (file.size === undefined || Number(file.size) === size);
}

/** After a lost answer: asks Drive whether the upload finished anyway. */
async function finishedAnyway(uploadUrl: string, size: number): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } }, STATUS_TIMEOUT_MS);
    return r.ok && (await holdsCompleteFile(r, size));
  } catch {
    return false;
  }
}

async function driveFailure(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
  if (j.error?.errors?.[0]?.reason === 'storageQuotaExceeded') return 'Google-Drive-Speicher voll';
  return `Google Drive ${r.status}${j.error?.message ? `: ${j.error.message}` : ''}`;
}

const isTemporary = (status: number) => status >= 500 || status === 408 || status === 429 || status === 404 || status === 410;

/** Sends the PDF straight to Google. False: temporary problem, a new session may try again. */
async function sendPdf(uploadUrl: string, pdf: ArrayBuffer): Promise<boolean> {
  const size = pdf.byteLength;
  let r: Response;
  try {
    r = await fetchWithTimeout(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
    }, Math.max(MIN_TRANSFER_TIMEOUT_MS, size / MIN_BYTES_PER_MS));
  } catch (err) {
    if (!(err instanceof TypeError)) throw new UploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen', { stage: 'transfer', bytes: size });
    return finishedAnyway(uploadUrl, size); // network error
  }
  if (r.ok) return holdsCompleteFile(r, size);
  if (isTemporary(r.status)) return finishedAnyway(uploadUrl, size);
  throw new UploadError(await driveFailure(r), { stage: 'transfer', status: r.status, bytes: size });
}

/** One upload at a time, so quick successive exports can't create the same folder twice. */
let uploadQueue: Promise<void> = Promise.resolve();

/** Uploads a generated PDF to the connected Google Drive in the background.
    Never throws: the local download already happened, Drive is the backup copy. */
export function archiveToDrive(doc: jsPDF, docType: DriveDocType, filename: string): Promise<void> {
  uploadQueue = uploadQueue.then(() => uploadToDrive(doc, docType, filename));
  return uploadQueue;
}

async function uploadToDrive(doc: jsPDF, docType: DriveDocType, filename: string): Promise<void> {
  try {
    const blocked = await blockedReason();
    if (blocked) return reportFailure(docType, blocked, { stage: 'status' });
    const pdf = doc.output('arraybuffer');
    if (pdf.byteLength > MAX_UPLOAD_BYTES) return reportFailure(docType, 'PDF ist grösser als 25 MB', { stage: 'size', bytes: pdf.byteLength });
    showToast('Wird in Google Drive gespeichert, Tab bitte offen lassen', 'info');
    // Every attempt gets a new session; the server then replaces a file that already arrived.
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      const { uploadUrl, folder } = await openUploadSession(docType, filename, pdf.byteLength);
      if (await sendPdf(uploadUrl, pdf)) {
        showSavedToast(folder ? `In Google Drive gespeichert (${folder})` : 'In Google Drive gespeichert');
        return;
      }
      if (attempt < MAX_UPLOAD_ATTEMPTS) await new Promise((resolve) => window.setTimeout(resolve, 1000 * 3 ** (attempt - 1)));
    }
    reportFailure(docType, 'Upload nach mehreren Versuchen fehlgeschlagen', { stage: 'transfer', bytes: pdf.byteLength });
  } catch (err) {
    if (err instanceof UploadError) return reportFailure(docType, err.message, err.detail);
    reportFailure(docType, err instanceof Error ? err.message : 'Upload fehlgeschlagen', { stage: 'request' });
  }
}
