import type { ArbeitPosition, Customer, MaterialPosition, Position } from '../types';

/** Data read from an uploaded PDF by /api/pdf-import. Unknown text = "", unknown number = 0. */
export interface PdfImportResult {
  dokumentTyp: 'offerte' | 'rechnung' | 'unbekannt';
  kunde: {
    vorname: string; nachname: string; firma: string; telefon: string; email: string;
    strasse: string; plzOrt: string;
    marke: string; modell: string; kennzeichen: string; chassisnummer: string; km: string; erstzulassung: string;
  };
  titel: string;
  datum: string;
  dokumentNummer: string;
  positionen: {
    typ: 'arbeit' | 'material';
    beschreibung: string;
    menge: number;
    einzelpreis: number;
    total: number;
    stunden: number;
    stundenansatz: number;
  }[];
  gesamttotal: number;
  notizen: string;
}

/** Same default as a new Arbeit row in the forms. */
const DEFAULT_STUNDENANSATZ = 80;
export const PDF_IMPORT_MAX_BYTES = 3 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

/** Import failure; `code` is set when the Anthropic API key in Vercel is the cause. */
export class PdfImportError extends Error {
  constructor(message: string, readonly code?: 'not_configured' | 'invalid_key') {
    super(message);
  }
}

/** Whether ANTHROPIC_API_KEY is set on the server; null when the check itself failed. */
export async function pdfImportConfigured(): Promise<boolean | null> {
  try {
    const r = await fetch('/api/pdf-import');
    const json = (await r.json()) as { configured?: boolean };
    return typeof json.configured === 'boolean' ? json.configured : null;
  } catch {
    return null;
  }
}

export async function importPdf(file: File, token: string): Promise<PdfImportResult> {
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Bitte eine PDF-Datei wählen');
  if (file.size > PDF_IMPORT_MAX_BYTES) throw new Error('PDF ist zu gross (max. 3 MB)');
  const data = await fileToBase64(file);
  const r = await fetch('/api/pdf-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data, filename: file.name }),
  });
  const json = (await r.json().catch(() => null)) as { ok?: boolean; result?: PdfImportResult; error?: string; code?: string } | null;
  if (!r.ok || !json?.ok || !json.result) {
    const code = json?.code === 'not_configured' || json?.code === 'invalid_key' ? json.code : undefined;
    throw new PdfImportError(json?.error || `Import fehlgeschlagen (${r.status})`, code);
  }
  return json.result;
}

const n2 = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Positions in the app's shape. Arbeit: ZE = hours × 100 (1 ZE = 0.6 min); the printed
    amount stays the price, missing hours or rate are derived from it. */
export function toPositionen(result: PdfImportResult): Position[] {
  return result.positionen
    .filter((p) => p.beschreibung.trim())
    .map((p): Position => {
      const total = n2(p.total);
      if (p.typ === 'arbeit') {
        const stunden = n2(p.stunden);
        const sa = n2(p.stundenansatz) || (stunden && total ? total / stunden : 0) || DEFAULT_STUNDENANSATZ;
        const ze = stunden ? Math.round(stunden * 100) : total ? Math.round((total / sa) * 100) : 0;
        const preis = total || (ze / 100) * sa;
        const a: ArbeitPosition = {
          typ: 'arbeit', beschreibung: p.beschreibung.trim(),
          ze: ze ? String(ze) : '', stundenansatz: String(Math.round(sa * 100) / 100), preis: preis ? preis.toFixed(2) : '',
        };
        return a;
      }
      const menge = n2(p.menge) || 1;
      const stueck = n2(p.einzelpreis) || (total ? total / menge : 0);
      const m: MaterialPosition = {
        typ: 'material', beschreibung: p.beschreibung.trim(),
        menge: String(menge), stueckpreis: stueck ? stueck.toFixed(2) : '', preis: (total || menge * stueck).toFixed(2),
      };
      return m;
    });
}

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s.-]/g, '');

/** Existing Kunde with the same Kennzeichen, else the same name; null when none matches. */
export function findKunde(k: PdfImportResult['kunde'], customers: Customer[]): Customer | null {
  const kz = norm(k.kennzeichen);
  if (kz) {
    const byKz = customers.find((c) => norm(c.kennzeichen) === kz);
    if (byKz) return byKz;
  }
  const vn = norm(k.vorname), nn = norm(k.nachname || k.firma);
  if (!nn) return null;
  return customers.find((c) => norm(c.nachname) === nn && (!vn || norm(c.vorname) === vn)) ?? null;
}

/** New Kunde from the PDF; a company without contact person goes into Nachname. */
export function neuerKunde(k: PdfImportResult['kunde']): Omit<Customer, 'id' | 'createdAt'> {
  const opt = (s: string) => s.trim() || undefined;
  return {
    vorname: k.vorname.trim(),
    nachname: k.nachname.trim() || k.firma.trim() || 'Unbekannt (PDF-Import)',
    telefon: k.telefon.trim(),
    email: opt(k.email),
    marke: opt(k.marke),
    modell: opt(k.modell),
    kennzeichen: opt(k.kennzeichen),
    km: opt(k.km),
    chassisnummer: opt(k.chassisnummer),
    erstzulassung: opt(k.erstzulassung),
  };
}

/** Draft title: the PDF's own title, else a reference to the imported document. */
export function importTitel(result: PdfImportResult, filename: string): string {
  if (result.titel.trim()) return result.titel.trim();
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(result.datum) ? result.datum.split('-').reverse().join('.') : '';
  const ref = [result.dokumentNummer && `Nr. ${result.dokumentNummer}`, datum && `vom ${datum}`].filter(Boolean).join(' ');
  return `Import ${ref || filename.replace(/\.pdf$/i, '')}`;
}
