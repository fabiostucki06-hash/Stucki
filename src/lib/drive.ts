import type { jsPDF } from 'jspdf';
import { getFreshToken } from './supabase';
import { showSavedToast, showToast } from '../components/ui/Toast';
import type { Customer } from '../types';

/** Document type of an export; the server maps it to GarageOS/<Ordner>/<Kunde>/<Dateiname>.pdf */
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
/** An interrupted upload is continued at most this often, and for this long. */
const MAX_RESUMES = 6;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Waiting for the pending copy to be stored before the download starts, at most. */
const STORE_WAIT_MS = 800;

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

/** Customer fields the server needs for the folder; nothing else is kept with a pending upload. */
type DriveKunde = Pick<Customer, 'id' | 'vorname' | 'nachname'>;

function reportFailure(docType: DriveDocType, message: string, detail: Record<string, unknown> = {}): void {
  console.error('[Drive-Upload] fehlgeschlagen', { docType, message, ...detail });
  showToast(`Google Drive: ${message}. Das PDF bleibt nur lokal, es gibt keinen automatischen Nachversuch.`, 'error', FAILURE_TOAST_MS);
}

/** A failure with a readable message for the user and details for the console. */
class UploadError extends Error {
  constructor(message: string, readonly detail: Record<string, unknown>, readonly interrupted = false) {
    super(message);
  }
}

/** The server finds or creates the folder and opens a Drive upload session for this file. */
async function openUploadSession(docType: DriveDocType, filename: string, size: number, customer: DriveKunde | undefined): Promise<{ uploadUrl: string; folder?: string }> {
  const token = await getFreshToken();
  if (!token) throw new UploadError('Sitzung abgelaufen, bitte neu anmelden', { stage: 'session' }, true);
  const r = await fetchWithTimeout('/api/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      docType, filename: `${filename}.pdf`, size,
      customerId: customer?.id,
      customerName: customer ? `${customer.vorname ?? ''} ${customer.nachname ?? ''}` : undefined,
    }),
  }, SESSION_TIMEOUT_MS);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; error?: string; connected?: boolean; reconnect?: boolean; folder?: string };
  if (r.ok && j.ok && j.uploadUrl) return { uploadUrl: j.uploadUrl, folder: j.folder };
  if (j.connected === false) {
    remember(false);
    window.dispatchEvent(new Event('garage-drive-changed'));
  }
  throw new UploadError(j.error ?? (r.status === 413 ? 'PDF ist grösser als 25 MB' : `Fehler ${r.status}`), {
    stage: 'session', status: r.status, connected: j.connected, reconnect: j.reconnect,
  }, j.connected !== false && isTemporary(r.status));
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
    if (!(err instanceof TypeError)) {
      const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      throw new UploadError(message, { stage: 'transfer', bytes: size }, message === 'Zeitüberschreitung');
    }
    return finishedAnyway(uploadUrl, size); // network error
  }
  if (r.ok) return holdsCompleteFile(r, size);
  if (isTemporary(r.status)) return finishedAnyway(uploadUrl, size);
  throw new UploadError(await driveFailure(r), { stage: 'transfer', status: r.status, bytes: size });
}

/* ── Pending uploads ────────────────────────────────────────────────────────
   On a phone the local download hands the screen to the PDF viewer / download
   sheet (iOS, the home-screen app above all): the app is paused or reloaded
   and an upload started at that moment is cut off without a word. So every
   export is kept on the device (IndexedDB) until Drive holds the file, and an
   interrupted upload continues as soon as the app is back in front or online,
   also after a reload. A definite answer (not connected, quota, too large, …)
   ends it with an error toast. The server replaces a file of the same name,
   so a resumed upload never creates a second copy. */

interface PendingUpload {
  id: string;
  docType: DriveDocType;
  filename: string;
  customer?: DriveKunde;
  pdf: ArrayBuffer;
  createdAt: number;
  /** Interrupted attempts so far. */
  tries: number;
}

const DB_NAME = 'garage-drive', STORE = 'uploads';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

const merken = (u: PendingUpload) => idb('readwrite', (s) => s.put(u));
const vergessen = (id: string) => idb('readwrite', (s) => s.delete(id)).catch(() => undefined);
const alleOffenen = () => idb('readonly', (s) => s.getAll() as IDBRequest<PendingUpload[]>).catch(() => [] as PendingUpload[]);

/** Network gone, request cut off or timed out: worth continuing later. */
const unterbrochen = (err: unknown) =>
  err instanceof TypeError || (err instanceof Error && err.message === 'Zeitüberschreitung') || navigator.onLine === false;

type Ergebnis = 'ok' | 'fehler' | 'unterbrochen';

async function uploadOnce(u: PendingUpload, nachgeholt: boolean): Promise<Ergebnis> {
  try {
    let blocked: string | null;
    try { blocked = await blockedReason(); } catch (err) {
      if (unterbrochen(err) || (err instanceof Error && err.message === 'Nicht angemeldet')) return 'unterbrochen';
      throw err;
    }
    if (blocked) { reportFailure(u.docType, blocked, { stage: 'status' }); return 'fehler'; }
    showToast(nachgeholt ? `Google Drive: ${u.filename} wird nachträglich gespeichert` : 'Wird in Google Drive gespeichert', 'info');
    // Every attempt gets a new session; the server then replaces a file that already arrived.
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      const { uploadUrl, folder } = await openUploadSession(u.docType, u.filename, u.pdf.byteLength, u.customer);
      if (await sendPdf(uploadUrl, u.pdf)) {
        const wo = folder ? ` (${folder})` : '';
        showSavedToast(nachgeholt ? `${u.filename} nachträglich in Google Drive gespeichert${wo}` : `In Google Drive gespeichert${wo}`);
        return 'ok';
      }
      if (attempt < MAX_UPLOAD_ATTEMPTS) await new Promise((resolve) => window.setTimeout(resolve, 1000 * 3 ** (attempt - 1)));
    }
    return 'unterbrochen'; // only temporary answers / lost connections
  } catch (err) {
    if (err instanceof UploadError) {
      if (err.interrupted) return 'unterbrochen';
      reportFailure(u.docType, err.message, err.detail);
      return 'fehler';
    }
    if (unterbrochen(err)) return 'unterbrochen';
    reportFailure(u.docType, err instanceof Error ? err.message : 'Upload fehlgeschlagen', { stage: 'request' });
    return 'fehler';
  }
}

/** One upload at a time, so quick successive exports can't create the same folder twice. */
let uploadQueue: Promise<void> = Promise.resolve();
const imGange = new Set<string>();
let nachversuch: number | undefined;

function einreihen(u: PendingUpload, nachgeholt: boolean): void {
  if (imGange.has(u.id)) return;
  imGange.add(u.id);
  uploadQueue = uploadQueue.then(async () => {
    try {
      const r = await uploadOnce(u, nachgeholt);
      if (r !== 'unterbrochen') { await vergessen(u.id); return; }
      const tries = u.tries + 1;
      if (tries >= MAX_RESUMES || Date.now() - u.createdAt > MAX_PENDING_AGE_MS) {
        await vergessen(u.id);
        reportFailure(u.docType, `${u.filename} konnte nicht hochgeladen werden (Verbindung)`, { stage: 'resume', tries });
        return;
      }
      if (!(await merken({ ...u, tries }).then(() => true, () => false))) {
        reportFailure(u.docType, 'Verbindung unterbrochen', { stage: 'resume', tries });
        return;
      }
      if (document.visibilityState === 'visible') {
        showToast('Google Drive: Verbindung unterbrochen, wird automatisch nachgeholt', 'info', 5000);
        // Still in front and online: try again shortly (a paused phase may simply be over).
        if (navigator.onLine !== false) {
          window.clearTimeout(nachversuch);
          nachversuch = window.setTimeout(() => void offeneNachholen(), 15_000);
        }
      }
    } finally {
      imGange.delete(u.id);
    }
  });
}

/** Continues every upload that was cut off (app paused, reloaded, offline). */
export async function offeneNachholen(): Promise<void> {
  if (typeof indexedDB === 'undefined' || !localStorage.getItem('garage_token')) return;
  for (const u of await alleOffenen()) einreihen(u, true);
}

let nachholenAktiv = false;
/** Resumes pending uploads now and whenever the app comes back to the front or online. */
export function driveNachholenStarten(): void {
  void offeneNachholen();
  if (nachholenAktiv) return;
  nachholenAktiv = true;
  const los = () => { if (document.visibilityState === 'visible') void offeneNachholen(); };
  document.addEventListener('visibilitychange', los);
  window.addEventListener('online', los);
  window.addEventListener('pageshow', los);
}

/** Saves a generated PDF locally and to the connected Google Drive. The Drive
    copy is kept on the device and its upload started before the local
    download, which on a phone can pause the app. Never throws for Drive:
    the local download is the primary copy, Drive the backup. */
export async function pdfSpeichern(doc: jsPDF, filename: string, docType: DriveDocType, customer: Customer | undefined): Promise<void> {
  let u: PendingUpload | null = null;
  try {
    const pdf = doc.output('arraybuffer');
    if (pdf.byteLength > MAX_UPLOAD_BYTES) reportFailure(docType, 'PDF ist grösser als 25 MB', { stage: 'size', bytes: pdf.byteLength });
    else {
      u = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, docType, filename, pdf, createdAt: Date.now(), tries: 0,
        customer: customer ? { id: customer.id, vorname: customer.vorname, nachname: customer.nachname } : undefined,
      };
      const gemerkt = typeof indexedDB === 'undefined'
        ? Promise.resolve()
        : merken(u).catch((err) => console.warn('[Drive-Upload] nicht vorgemerkt', err));
      await Promise.race([gemerkt, new Promise((resolve) => window.setTimeout(resolve, STORE_WAIT_MS))]);
    }
  } catch (err) {
    reportFailure(docType, err instanceof Error ? err.message : 'PDF konnte nicht vorbereitet werden', { stage: 'prepare' });
  }
  if (u) einreihen(u, false);
  try {
    doc.save(`${filename}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:
${err instanceof Error ? err.message : String(err)}`);
  }
}
