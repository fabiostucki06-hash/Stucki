import { todayISO } from './offerte-docs';
import type { Customer, FahrzeugFeld, FahrzeugFelder, ServiceItem, Vehicle } from '../types';

/** The vehicle fields that used to live on the Customer (see FahrzeugFeld). */
export const FAHRZEUG_FELDER: FahrzeugFeld[] = ['marke', 'modell', 'kennzeichen', 'km', 'chassisnummer', 'erstzulassung'];

export const hatFahrzeugDaten = (f: Partial<FahrzeugFelder>): boolean =>
  FAHRZEUG_FELDER.some((k) => String(f[k] ?? '').trim() !== '');

/** Splits Customer data into the customer row and its vehicle fields (null: none given). */
export function splitFahrzeug<T extends Partial<Customer>>(data: T): { kunde: Omit<T, FahrzeugFeld>; fahrzeug: FahrzeugFelder | null } {
  const kunde = { ...data };
  const fahrzeug: FahrzeugFelder = {};
  let given = false;
  for (const k of FAHRZEUG_FELDER) {
    if (!(k in kunde)) continue;
    given = true;
    const v = String(kunde[k] ?? '').trim();
    if (v) fahrzeug[k] = v;
    delete kunde[k];
  }
  return { kunde, fahrzeug: given ? fahrzeug : null };
}

/** Oldest first: the first vehicle is the customer's main one. */
export const sortiereFahrzeuge = (vs: Vehicle[]): Vehicle[] =>
  [...vs].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

/** A customer row still carrying the old vehicle fields (written before the
    vehicles table, or by an outdated client) as a vehicle. Same id the
    migration gives it, so editing it stores exactly that vehicle. */
export function legacyFahrzeug(c: Customer): Vehicle | null {
  if (!hatFahrzeugDaten(c)) return null;
  const v: Vehicle = { id: `v_${c.id}`, customerId: c.id, createdAt: c.createdAt };
  for (const k of FAHRZEUG_FELDER) if (c[k]) v[k] = String(c[k]);
  return v;
}

/** The customer with the vehicle fields of `v` (cleared without one): what the
    PDFs, lists and the Kunde lines of the documents show. */
export function kundeMitFahrzeug(c: Customer, v: Vehicle | undefined): Customer {
  const out: Customer = { ...c };
  for (const k of FAHRZEUG_FELDER) {
    if (v?.[k]) out[k] = v[k];
    else delete out[k];
  }
  return out;
}

/** "BMW 320d" (or the plate when make and model are missing). */
export const fahrzeugTitel = (v: Partial<FahrzeugFelder>): string =>
  [v.marke, v.modell].filter(Boolean).join(' ') || v.kennzeichen || 'Fahrzeug';

/** "BMW 320d · ZH 123456", for selects. */
export const fahrzeugLabel = (v: Partial<FahrzeugFelder>): string =>
  [[v.marke, v.modell].filter(Boolean).join(' '), v.kennzeichen].filter(Boolean).join(' · ') || 'Fahrzeug ohne Angaben';

export const fahrzeugChips = (v: Partial<FahrzeugFelder> | undefined): string[] =>
  v ? [v.marke, v.modell, v.kennzeichen, v.km ? `${formatKm(v.km)} km` : ''].filter((x): x is string => !!x) : [];

/** "Marke Modell Kennzeichen 85000km", for the KI-ZE estimate. */
export const fahrzeugText = (v: Partial<FahrzeugFelder> | undefined): string =>
  v ? [v.marke, v.modell, v.kennzeichen, v.km ? v.km + 'km' : ''].filter(Boolean).join(' ') || 'unbekannt' : 'unbekannt';

/** 85000 → "85'000" (Swiss thousands separator). */
export function formatKm(km: string | number | undefined): string {
  const n = typeof km === 'number' ? km : parseInt(String(km ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n.toLocaleString('de-CH') : String(km ?? '');
}

const kmZahl = (km: string | number | undefined): number | null => {
  const n = typeof km === 'number' ? km : parseInt(String(km ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/* ── Service-Wartungsplan ── */

/** Usual intervals for a passenger car in Switzerland; adjustable per vehicle. */
export const STANDARD_SERVICE: { name: string; intervallKm?: number; intervallMonate?: number }[] = [
  { name: 'Motoröl & Ölfilter',       intervallKm: 15000,  intervallMonate: 12 },
  { name: 'Luftfilter',               intervallKm: 30000,  intervallMonate: 24 },
  { name: 'Innenraumfilter / Pollenfilter', intervallKm: 15000, intervallMonate: 12 },
  { name: 'Kraftstofffilter',         intervallKm: 60000,  intervallMonate: 48 },
  { name: 'Zündkerzen',               intervallKm: 60000,  intervallMonate: 48 },
  { name: 'Bremsflüssigkeit',         intervallMonate: 24 },
  { name: 'Bremsbeläge & -scheiben prüfen', intervallKm: 30000, intervallMonate: 24 },
  { name: 'Kühlflüssigkeit',          intervallMonate: 48 },
  { name: 'Zahnriemen / Wasserpumpe', intervallKm: 120000, intervallMonate: 72 },
  { name: 'Getriebeöl',               intervallKm: 60000 },
  { name: 'Klimaservice',             intervallMonate: 24 },
  { name: 'Batterie prüfen',          intervallMonate: 12 },
  { name: 'Wischerblätter',           intervallMonate: 12 },
  { name: 'Reifenwechsel Sommer/Winter', intervallMonate: 6 },
  { name: 'MFK / Fahrzeugprüfung',    intervallMonate: 36 },
];

export const neueServiceId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function standardServicePlan(): ServiceItem[] {
  return STANDARD_SERVICE.map((s) => ({ id: neueServiceId(), name: s.name, status: 'faellig', intervallKm: s.intervallKm, intervallMonate: s.intervallMonate }));
}

/** ISO date + n months (end of month clamps, 31.01. + 1 → 28./29.02.). */
export function plusMonate(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Ticks an item off as done on `datum` at `km`: logged in the history, next
    due date / mileage moved on by the interval. */
export function serviceErledigt(item: ServiceItem, datum: string, km?: string): ServiceItem {
  const kmN = kmZahl(km);
  return {
    ...item,
    status: 'gemacht',
    letztesDatum: datum,
    letzteKm: kmN != null ? String(kmN) : undefined,
    faelligDatum: item.intervallMonate ? plusMonate(datum, item.intervallMonate) : undefined,
    faelligKm: item.intervallKm && kmN != null ? String(kmN + item.intervallKm) : undefined,
    historie: [...(item.historie ?? []), { datum, ...(kmN != null ? { km: String(kmN) } : {}) }],
  };
}

/** Undoes the last tick: back to the previous service (if any) and "fällig". */
export function serviceZuruecksetzen(item: ServiceItem): ServiceItem {
  const historie = (item.historie ?? []).slice(0, -1);
  const prev = historie[historie.length - 1];
  const base: ServiceItem = { ...item, historie, letztesDatum: undefined, letzteKm: undefined, faelligDatum: undefined, faelligKm: undefined };
  return { ...(prev ? serviceErledigt({ ...base, historie: historie.slice(0, -1) }, prev.datum, prev.km) : base), status: 'faellig' };
}

/** Warning window before the due date / mileage. */
const BALD_TAGE = 30;
const BALD_KM = 1000;

export type ServiceZustand = 'ueberfaellig' | 'bald' | 'gemacht' | 'faellig';

/** What the item shows now: overdue / due soon (by date or the vehicle's
    mileage) wins over the stored status. */
export function serviceZustand(item: ServiceItem, fahrzeugKm?: string, heute = todayISO()): ServiceZustand {
  const km = kmZahl(fahrzeugKm), fKm = kmZahl(item.faelligKm);
  if (item.faelligDatum && item.faelligDatum <= heute) return 'ueberfaellig';
  if (fKm != null && km != null && km >= fKm) return 'ueberfaellig';
  const bald = plusTage(heute, BALD_TAGE);
  if (item.faelligDatum && item.faelligDatum <= bald) return 'bald';
  if (fKm != null && km != null && km >= fKm - BALD_KM) return 'bald';
  return item.status;
}

function plusTage(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Items that need attention at the next visit: overdue first, then due soon. */
export function anstehendeServices(v: Vehicle | undefined): { item: ServiceItem; zustand: ServiceZustand }[] {
  if (!v?.service?.length) return [];
  const rang: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, faellig: 2, gemacht: 3 };
  return v.service
    .map((item) => ({ item, zustand: serviceZustand(item, v.km) }))
    .filter((x) => x.zustand === 'ueberfaellig' || x.zustand === 'bald')
    .sort((a, b) => rang[a.zustand] - rang[b.zustand]);
}
