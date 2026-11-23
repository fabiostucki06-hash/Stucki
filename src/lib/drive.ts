import type { jsPDF } from 'jspdf';
import { getFreshToken } from './supabase';
import { showToast } from '../components/ui/Toast';

/** Drive folder per document type: Stucki Repair/<Typ>/<Dateiname>.pdf */
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
/** A "not connected" answer is reused this long, so exports don't each ask the server. */
const STATUS_TTL_MS = 60_000;

let known: { connected: boolean; at: number } | null = null;
const remember = (connected: boolean) => { known = { connected, at: Date.now() }; };

async function authCall<T>(body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string }> {
  const token = await getFreshToken();
  if (!token) throw new Error('Nicht angemeldet');
  const r = await fetch('/api/drive-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
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

async function isConnected(): Promise<boolean> {
  if (known?.connected) return true;
  if (known && Date.now() - known.at < STATUS_TTL_MS) return false;
  return (await getDriveStatus()).connected;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Uploads a generated PDF to the connected Google Drive in the background.
    Never throws: the local download already happened, Drive is the backup copy. */
export async function archiveToDrive(doc: jsPDF, docType: DriveDocType, filename: string): Promise<void> {
  try {
    if (!(await isConnected())) return;
    const token = await getFreshToken();
    if (!token) return;
    const r = await fetch('/api/drive-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ docType, filename: `${filename}.pdf`, data: toBase64(doc.output('arraybuffer')) }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; connected?: boolean; reconnect?: boolean };
    if (r.ok && j.ok) { showToast('In Google Drive gespeichert', 'success'); return; }
    if (j.connected === false) {
      remember(false);
      window.dispatchEvent(new Event('garage-drive-changed'));
      if (!j.reconnect) return;
    }
    showToast(`Google Drive: ${j.error ?? (r.status === 413 ? 'PDF zu gross' : `Fehler ${r.status}`)}`, 'error');
  } catch (err) {
    showToast(`Google Drive: ${err instanceof Error ? err.message : 'Upload fehlgeschlagen'}`, 'error');
  }
}
