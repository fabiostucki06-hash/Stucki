import { todayISO } from './offerte-docs';
import { STD_SATZ } from './company';
import type { ArbeitPosition, Customer, FahrzeugFeld, FahrzeugFelder, Nachweis, ServiceEintrag, ServiceItem, Vehicle } from '../types';

/** The vehicle fields that used to live on the Customer (see FahrzeugFeld). */
export const FAHRZEUG_FELDER: FahrzeugFeld[] = ['marke', 'modell', 'kennzeichen', 'km', 'chassisnummer', 'erstzulassung', 'antrieb', 'getriebe', 'steuertrieb', 'achsantrieb', 'motor', 'motorcode'];

export const hatFahrzeugDaten = (f: Partial<FahrzeugFelder>): boolean =>
  FAHRZEUG_FELDER.some((k) => String(f[k] ?? '').trim() !== '');

/** Splits Customer data into the customer row and its vehicle fields (null: none given). */
export function splitFahrzeug<T extends Partial<Customer>>(data: T): { kunde: Omit<T, FahrzeugFeld>; fahrzeug: FahrzeugFelder | null } {
  const kunde = { ...data };
  const fahrzeug: Record<string, string> = {};
  let given = false;
  for (const k of FAHRZEUG_FELDER) {
    if (!(k in kunde)) continue;
    given = true;
    const v = String(kunde[k] ?? '').trim();
    if (v) fahrzeug[k] = v;
    delete kunde[k];
  }
  return { kunde, fahrzeug: given ? fahrzeug as FahrzeugFelder : null };
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
  for (const k of FAHRZEUG_FELDER) if (c[k]) (v as unknown as Record<string, string>)[k] = String(c[k]);
  return v;
}

/** The customer with the vehicle fields of `v` (cleared without one): what the
    PDFs, lists and the Kunde lines of the documents show. */
export function kundeMitFahrzeug(c: Customer, v: Vehicle | undefined): Customer {
  const out: Customer = { ...c };
  for (const k of FAHRZEUG_FELDER) {
    if (v?.[k]) (out as unknown as Record<string, string>)[k] = v[k]!;
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

/** "Marke Modell Motor Kennzeichen 85000km", for the KI-ZE estimate. */
export const fahrzeugText = (v: Partial<FahrzeugFelder> | undefined): string =>
  v ? [v.marke, v.modell, v.motor, v.motorcode, v.antrieb, v.kennzeichen, v.km ? v.km + 'km' : ''].filter(Boolean).join(' ') || 'unbekannt' : 'unbekannt';

/** 85000 → "85'000" (Swiss thousands separator). */
export function formatKm(km: string | number | undefined): string {
  const n = typeof km === 'number' ? km : parseInt(String(km ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n.toLocaleString('de-CH') : String(km ?? '');
}

export const kmZahl = (km: string | number | undefined): number | null => {
  const n = typeof km === 'number' ? km : parseInt(String(km ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/* ── Wartungsplan ── */

/** Former defaults, no longer part of any Wartungsplan; filtered out when an
    existing plan is shown (see the wartungsplan_defaults migrations). */
const ENTFERNTE_SERVICE = new Set([
  'MFK / Fahrzeugprüfung',
  'Reifenwechsel Sommer/Winter',
  'Wischerblätter',
  'Klimaservice',
  'Kühlflüssigkeit',
  'Bremsbeläge & -scheiben prüfen',
  'Batterie prüfen',
]);

export const ohneEntfernteService = (items: ServiceItem[]): ServiceItem[] =>
  items.filter((i) => !ENTFERNTE_SERVICE.has(i.name.trim()));

export const neueServiceId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** ISO date + n months (end of month clamps, 31.01. + 1 → 28./29.02.). */
export function plusMonate(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Due date / mileage that follow from a service on `datum` at `km` plus the
    item's interval. Nothing without a basis: no date → no due date, etc. */
export function faelligAus(item: ServiceItem, datum?: string, km?: string): Pick<ServiceItem, 'faelligDatum' | 'faelligKm'> {
  const kmN = kmZahl(km);
  return {
    faelligDatum: item.intervallMonate && datum && ISO_DATUM.test(datum) ? plusMonate(datum.slice(0, 10), item.intervallMonate) : undefined,
    faelligKm: item.intervallKm && kmN != null ? String(kmN + item.intervallKm) : undefined,
  };
}

/** Whether a stored due value differs from last service + interval (= set by hand). */
export function faelligVonHand(i: ServiceItem): boolean {
  const soll = faelligAus(i, i.letztesDatum, i.letzteKm);
  return (!!i.faelligKm && kmZahl(i.faelligKm) !== kmZahl(soll.faelligKm)) || (!!i.faelligDatum && i.faelligDatum !== soll.faelligDatum);
}

/** What proves a service entry. */
export type Beleg = { nachweis: Nachweis; auftragId?: string };

/** Proof of a history entry. Entries from before proofs were recorded could
    only be made by "Gemacht" in this workshop. */
export const eintragNachweis = (e: Partial<Beleg>): Beleg =>
  ({ nachweis: e.nachweis ?? 'werkstatt', ...(e.auftragId ? { auftragId: e.auftragId } : {}) });

/** Every Nachweis with its labels; `farbe` = status dot (documented green, not orange). */
export const NACHWEIS: Record<Nachweis, { label: string; kurz: string; belegt: boolean; farbe: string }> = {
  werkstatt:   { label: 'In dieser Werkstatt erledigt',     kurz: 'Werkstatt',     belegt: true,  farbe: 'var(--green)' },
  serviceheft: { label: 'Serviceheft / Servicenachweis',    kurz: 'Serviceheft',   belegt: true,  farbe: 'var(--green)' },
  rechnung:    { label: 'Rechnung einer anderen Werkstatt', kurz: 'Fremdrechnung', belegt: true,  farbe: 'var(--green)' },
  kunde:       { label: 'Ohne Beleg (Angabe Kunde)',        kurz: 'ohne Beleg',    belegt: false, farbe: 'var(--orange)' },
};

/** Ticks an item off as done on `datum` at `km`: logged in the history, next
    due date / mileage moved on by the interval. The only place an interval
    advances; call it for work actually done ("Gemacht", or a documented
    earlier service entered in the editor), never for an Offerte.
    `beleg`: what proves it; unset = done in this workshop ("Gemacht"). */
export function serviceErledigt(item: ServiceItem, datum: string, km?: string, beleg: Partial<Beleg> = {}): ServiceItem {
  const kmN = kmZahl(km);
  const kmS = kmN != null ? String(kmN) : undefined;
  return {
    ...item,
    status: 'gemacht',
    letztesDatum: datum,
    letzteKm: kmS,
    ...faelligAus(item, datum, kmS),
    historie: [...(item.historie ?? []), { datum, ...(kmS ? { km: kmS } : {}), ...eintragNachweis(beleg) }],
  };
}

/** Undoes the last entry: back to the previous service (if any) and "fällig". */
export function serviceZuruecksetzen(item: ServiceItem): ServiceItem {
  const historie = (item.historie ?? []).slice(0, -1);
  const prev = historie[historie.length - 1];
  const base: ServiceItem = { ...item, historie, letztesDatum: undefined, letzteKm: undefined, faelligDatum: undefined, faelligKm: undefined };
  return { ...(prev ? serviceErledigt({ ...base, historie: historie.slice(0, -1) }, prev.datum, prev.km, prev) : base), status: 'faellig' };
}

/** Where the item's last service comes from: the newest history entry when
    it is the stored last service, else `null` = entered without a record.
    `undefined` = no last service known. */
export function letzterService(i: ServiceItem): (ServiceEintrag & Beleg) | null | undefined {
  if (!i.letztesDatum && !i.letzteKm) return undefined;
  const e = i.historie?.[i.historie.length - 1];
  return e && e.datum === i.letztesDatum ? { ...e, ...eintragNachweis(e) } : null;
}

/** Proof of the last service as shown; entered without a record = no proof. */
export function letzterBeleg(i: ServiceItem): (typeof NACHWEIS)[Nachweis] | undefined {
  const l = letzterService(i);
  return l === undefined ? undefined : NACHWEIS[l?.nachweis ?? 'kunde'];
}

/** The last service as entered in the editor. */
export interface LetzterServiceEingabe {
  datum?: string;
  km?: string;
  beleg: Beleg;
  faelligDatum?: string;
  faelligKm?: string;
}

/** Applies an edited last service. Nothing is assumed:
    - without a date: stored as entered, no history entry (= no proof);
    - same date / km, other proof: the entry's proof is updated, nothing moves;
    - new date: logged with its proof via serviceErledigt (due values move on
      by the interval unless set here by hand). A same or earlier date
      corrects the entry it replaces. */
export function letztenServiceSetzen(item: ServiceItem, e: LetzterServiceEingabe): ServiceItem {
  const faellig = { faelligDatum: e.faelligDatum, faelligKm: e.faelligKm };
  if (!e.datum) return { ...item, letztesDatum: undefined, letzteKm: e.km, ...faellig };

  const alt = letzterService(item);
  const hist = item.historie ?? [];
  if (e.datum === item.letztesDatum && e.km === item.letzteKm) {
    const b = eintragNachweis(e.beleg);
    const altBeleg = alt ?? { nachweis: 'kunde' as Nachweis, auftragId: undefined };
    if (b.nachweis === altBeleg.nachweis && b.auftragId === altBeleg.auftragId) return { ...item, ...faellig };
    const eintrag: ServiceEintrag = { datum: e.datum, ...(e.km ? { km: e.km } : {}), ...b };
    return { ...item, ...faellig, historie: alt ? [...hist.slice(0, -1), eintrag] : [...hist, eintrag] };
  }

  const korrektur = !!alt && e.datum <= (item.letztesDatum ?? '');
  const n = serviceErledigt({ ...item, historie: korrektur ? hist.slice(0, -1) : hist }, e.datum, e.km, e.beleg);
  const vonHand = e.faelligDatum !== item.faelligDatum || e.faelligKm !== item.faelligKm;
  return vonHand ? { ...n, ...faellig } : n;
}

/** Warning window before the due date / mileage. */
const BALD_TAGE = 30;
const BALD_KM = 1000;

/** 'unbekannt': open item without a known last service or due value. */
export type ServiceZustand = 'ueberfaellig' | 'bald' | 'gemacht' | 'faellig' | 'unbekannt';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}/;

/** Next due mileage / date of an item: the stored value (set when ticked off
    or by hand), else the last service plus the interval. Nothing is assumed:
    without a stored due value and without a last service there is no due
    mileage / date (the item shows as "unbekannt" until it is entered). */
export function naechsteFaelligkeit(item: ServiceItem): { km?: number; datum?: string } {
  let km = kmZahl(item.faelligKm) ?? undefined;
  if (km == null && item.intervallKm) {
    const letzte = kmZahl(item.letzteKm);
    if (letzte != null) km = letzte + item.intervallKm;
  }

  let datum = item.faelligDatum && ISO_DATUM.test(item.faelligDatum) ? item.faelligDatum : undefined;
  if (!datum && item.intervallMonate && item.letztesDatum && ISO_DATUM.test(item.letztesDatum))
    datum = plusMonate(item.letztesDatum.slice(0, 10), item.intervallMonate);
  return { km, datum };
}

/** What the item shows now: overdue / due soon (by date or the vehicle's
    mileage, see naechsteFaelligkeit) wins over the stored status. An open item
    with no due value is 'unbekannt', never assumed to be in the future. */
export function serviceZustand(
  item: ServiceItem, v: Partial<Pick<Vehicle, 'km' | 'erstzulassung' | 'createdAt'>> | undefined, heute = todayISO(),
): ServiceZustand {
  const km = kmZahl(v?.km);
  const { km: fKm, datum } = naechsteFaelligkeit(item);
  if (datum && datum <= heute) return 'ueberfaellig';
  if (fKm != null && km != null && km >= fKm) return 'ueberfaellig';
  const bald = plusTage(heute, BALD_TAGE);
  if (datum && datum <= bald) return 'bald';
  if (fKm != null && km != null && km >= fKm - BALD_KM) return 'bald';
  if (item.status !== 'gemacht' && fKm == null && !datum) return 'unbekannt';
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
  const rang: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, unbekannt: 2, faellig: 3, gemacht: 4 };
  return ohneEntfernteService(v.service)
    .map((item) => ({ item, zustand: serviceZustand(item, v) }))
    .filter((x) => x.zustand === 'ueberfaellig' || x.zustand === 'bald')
    .sort((a, b) => rang[a.zustand] - rang[b.zustand]);
}

/** Offerte positions for Wartungsplan items: one Arbeit line each (note and
    interval appended; the Inspektion is named without its interval), without ZE / price yet, so the Offerte is priced
    afterwards. Only values set on the item are carried over, nothing assumed.
    Read-only: the items (last service, next due, status) stay as they are. */
export const wartungsPositionen = (items: ServiceItem[]): ArbeitPosition[] =>
  items.map((i) => ({
    typ: 'arbeit',
    beschreibung: [
      [i.name, i.notiz].filter(Boolean).join(' – '),
      i.vorlage !== 'inspektion' && (i.intervallKm || i.intervallMonate) &&
        `(Intervall ${[i.intervallKm ? `${formatKm(i.intervallKm)} km` : '', i.intervallMonate ? `${i.intervallMonate} Mt.` : ''].filter(Boolean).join(' / ')})`,
    ].filter(Boolean).join(' '),
    ze: '',
    stundenansatz: STD_SATZ,
    preis: '0.00',
  }));
