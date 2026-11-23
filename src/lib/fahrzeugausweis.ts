import { ANTRIEBE, GETRIEBE, normMotorcode } from './wartung';
import { getFreshToken } from './supabase';
import { vinGueltig } from './vin';
import type { FahrzeugFelder } from '../types';

/* ── Photo of the vehicle papers → form values ──
   /api/fahrzeugausweis reads the image; everything it returns is checked here.
   A value counts only when the reader marked it as certain AND it passes the
   format check of its field. Nothing is repaired or derived: a value that fails
   is reported as unclear and its input stays empty. Steuertrieb and KM-Stand are
   not on the papers and are never taken from a document. */

export const AUSWEIS_FELDER = [
  'vorname', 'nachname', 'firma', 'strasse', 'plzOrt', 'kennzeichen', 'chassisnummer', 'marke', 'modell',
  'erstzulassung', 'antrieb', 'getriebe', 'hubraumCcm', 'leistungKw', 'motorcode',
] as const;
type AusweisFeld = typeof AUSWEIS_FELDER[number];

export interface AusweisRoh {
  istFahrzeugdokument: boolean;
  felder: Record<AusweisFeld, { wert: string; sicher: boolean }>;
}

/** Form inputs a document can fill. */
export type ScanFeld = keyof FahrzeugFelder | 'vorname' | 'nachname';
export type ScanWerte = Partial<Record<ScanFeld, string>>;

export interface AusweisAuswertung {
  werte: ScanWerte;
  /** Printed but not reliably readable: labels of the fields to check by hand. */
  unklar: string[];
  /** Holder's address: shown for review, customers have no address field. */
  adresse?: string;
}

const LABEL: Record<AusweisFeld, string> = {
  vorname: 'Vorname', nachname: 'Nachname', firma: 'Firma', strasse: 'Strasse', plzOrt: 'PLZ / Ort', kennzeichen: 'Kontrollschild',
  chassisnummer: 'Chassisnummer (VIN)', marke: 'Marke', modell: 'Modell', erstzulassung: '1. Inv. Setzung', antrieb: 'Antrieb',
  getriebe: 'Getriebe', hubraumCcm: 'Hubraum', leistungKw: 'Leistung', motorcode: 'Motorkennbuchstabe',
};

/** Real calendar date, not in the future; accepts YYYY-MM-DD and DD.MM.YYYY. */
export function datumGueltig(s: string, heute = new Date()): string | undefined {
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ch = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!iso && !ch) return undefined;
  const [j, mo, d] = iso ? [iso[1], iso[2], iso[3]] : [ch![3], ch![2], ch![1]];
  const y = +j;
  const dt = new Date(Date.UTC(y, +mo - 1, +d));
  if (y < 1900 || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d || dt.getTime() > heute.getTime()) return undefined;
  return `${j}-${mo}-${d}`;
}

const text = (s: string, max = 60) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && /\p{L}|\d/u.test(t) && !/[?…]|unbekannt|unleserlich|n\/a/i.test(t) ? t : undefined;
};

const kennzeichen = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim().toUpperCase();
  return /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]{1,11}$/.test(t) && /\d/.test(t) ? t : undefined;
};

const zahl = (s: string, min: number, max: number) => {
  const t = s.trim().replace(/['’\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  return +t >= min && +t <= max ? t : undefined;
};

const PRUEFUNG: Record<AusweisFeld, (s: string) => string | undefined> = {
  vorname: (s) => text(s), nachname: (s) => text(s), firma: (s) => text(s, 80), strasse: (s) => text(s, 80), plzOrt: (s) => text(s, 60),
  kennzeichen, chassisnummer: (s) => vinGueltig(s), marke: (s) => text(s, 40), modell: (s) => text(s, 60),
  erstzulassung: (s) => datumGueltig(s),
  antrieb: (s) => ANTRIEBE.find((o) => o.value === s.trim().toLowerCase())?.value,
  getriebe: (s) => GETRIEBE.find((o) => o.value === s.trim().toLowerCase())?.value,
  hubraumCcm: (s) => zahl(s, 50, 12000), leistungKw: (s) => zahl(s, 1, 2000),
  motorcode: (s) => { const c = normMotorcode(s); return /^[A-Z0-9]{3,10}$/.test(c) ? c : undefined; },
};

/** Keeps what is certain and valid; everything else that was attempted is reported as unclear. */
export function ausweisAuswerten(roh: AusweisRoh): AusweisAuswertung {
  const ok: Partial<Record<AusweisFeld, string>> = {};
  const unklar: string[] = [];
  for (const k of AUSWEIS_FELDER) {
    const f = roh.felder?.[k];
    const wert = typeof f?.wert === 'string' ? f.wert : '';
    if (!wert.trim()) continue;
    const gut = f.sicher === true ? PRUEFUNG[k](wert) : undefined;
    if (gut) ok[k] = gut; else unklar.push(LABEL[k]);
  }

  const werte: ScanWerte = {};
  for (const k of ['kennzeichen', 'chassisnummer', 'marke', 'modell', 'erstzulassung', 'antrieb', 'getriebe', 'motorcode', 'vorname'] as const) {
    if (ok[k]) werte[k] = ok[k];
  }
  // A company without a contact person goes into Nachname, as in the PDF import.
  const nachname = ok.nachname ?? (ok.vorname ? undefined : ok.firma);
  if (nachname) werte.nachname = nachname;
  const motor = [ok.hubraumCcm && `${ok.hubraumCcm} cm³`, ok.leistungKw && `${ok.leistungKw} kW`].filter(Boolean).join(' · ');
  if (motor) werte.motor = motor;

  const adresse = [ok.strasse, ok.plzOrt].filter(Boolean).join(', ') || undefined;
  return { werte, unklar, adresse };
}

const MAX_KANTE = 2400;
const MAX_BASE64 = 3.9 * 1024 * 1024; // = 2.9 MB decoded, below the endpoint's limit

/** Decodes the photo (honouring its orientation) and re-encodes it as a JPEG that fits the upload limit. */
async function bildVorbereiten(file: File): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Bitte ein Bild wählen.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error('Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPG oder PNG versuchen.'); });
    const faktor = Math.min(1, MAX_KANTE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * faktor);
    canvas.height = Math.round(img.naturalHeight * faktor);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Bild konnte nicht verarbeitet werden.');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in the JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.92, 0.85, 0.75, 0.6]) {
      const data = canvas.toDataURL('image/jpeg', q).replace(/^data:[^,]*,/, '');
      if (data.length <= MAX_BASE64) return data;
    }
    throw new Error('Bild ist zu gross.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function ausweisLesen(file: File, signal?: AbortSignal): Promise<AusweisRoh> {
  const data = await bildVorbereiten(file);
  const token = await getFreshToken();
  if (!token) throw new Error('Nicht angemeldet.');
  const r = await fetch('/api/fahrzeugausweis', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const j = await r.json().catch(() => null) as { ok?: boolean; result?: AusweisRoh; error?: string } | null;
  if (!r.ok || !j?.ok || !j.result) throw new Error(j?.error || `Lesen fehlgeschlagen (${r.status})`);
  return j.result;
}
