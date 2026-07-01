import { buildRechnungWorkbookBuffer } from './xlsx-rechnung';
import { showToast } from '../components/ui/Toast';
import type { Customer, Rechnung } from '../types';

function bufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function exportRechnungPDF(rechnung: Rechnung, customer: Customer | undefined) {
  try {
    const xlsxBuf = await buildRechnungWorkbookBuffer(rechnung, customer);
    const filename = `Rechnung_${rechnung.rechnungNumber}_${customer?.nachname ?? 'Kunde'}.xlsx`;

    const res = await fetch('/api/rechnung-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: bufferToBase64(xlsxBuf), filename }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const pdfBlob = await res.blob();
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.xlsx$/, '.pdf');
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg = raw.includes('CLOUDCONVERT_API_KEY')
      ? 'PDF-Dienst ist noch nicht konfiguriert (fehlender API-Key). Bitte Admin kontaktieren.'
      : `PDF-Export fehlgeschlagen: ${raw}`;
    showToast(msg, 'error');
  }
}
