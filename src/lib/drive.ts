import type { jsPDF } from 'jspdf';
import { getFreshToken } from './supabase';
import { getSettings } from './settings';
import { showToast } from '../components/ui/Toast';

/** Drive folder per document type: GarageOS/<Typ>/<Jahr>/<Dateiname>.pdf */
export type DriveDocType = 'Offerten' | 'Materialofferten' | 'Auftragsbestätigungen' | 'Anzahlungsrechnungen' | 'Rechnungen';

// Once the server says Drive isn't set up, stop trying for this page load.
let unconfigured = false;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Uploads a generated PDF to Google Drive (api/drive-upload.ts) in the background.
    Never throws: the local download already happened, Drive is the archive copy. */
export async function archiveToDrive(doc: jsPDF, docType: DriveDocType, filename: string): Promise<void> {
  if (unconfigured) return;
  try {
    const token = await getFreshToken();
    if (!token) return;
    const r = await fetch('/api/drive-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        rootFolderId: getSettings().driveFolderId || undefined,
        folder: [docType, String(new Date().getFullYear())],
        filename: `${filename}.pdf`,
        data: toBase64(doc.output('arraybuffer')),
      }),
    });
    // 501: Drive not set up on the server; 404: no /api (local vite dev).
    if (r.status === 501 || r.status === 404) { unconfigured = true; return; }
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (r.ok && j.ok) showToast(`Auf Google Drive gespeichert (${docType})`, 'success');
    else showToast(`Google Drive: ${j.error ?? `Fehler ${r.status}`}`, 'error');
  } catch (err) {
    showToast(`Google Drive: ${err instanceof Error ? err.message : 'Upload fehlgeschlagen'}`, 'error');
  }
}

/** Accepts a bare folder ID or a pasted Drive URL
    (…/drive/folders/<id>, …/open?id=<id>) and returns the ID; '' when none. */
export function parseDriveFolderId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) ?? s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

/** Plausible Drive file/folder ID (what the server accepts). */
export const isDriveFolderId = (id: string): boolean => /^[A-Za-z0-9_-]{10,100}$/.test(id);

export type DriveTestResult = { ok: true; name: string } | { ok: false; error: string };

/** Asks the server whether the folder ('' = default target) exists and is
    writable for the Drive account the uploads use. */
export async function testDriveFolder(folderId: string): Promise<DriveTestResult> {
  try {
    const token = await getFreshToken();
    if (!token) return { ok: false, error: 'Nicht angemeldet' };
    const r = await fetch('/api/drive-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ test: true, rootFolderId: folderId || undefined }),
    });
    if (r.status === 404) return { ok: false, error: 'Server-Funktion nicht verfügbar (lokale Entwicklung)' };
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; name?: string; error?: string };
    return r.ok && j.ok ? { ok: true, name: j.name ?? '' } : { ok: false, error: j.error ?? `Fehler ${r.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen' };
  }
}
