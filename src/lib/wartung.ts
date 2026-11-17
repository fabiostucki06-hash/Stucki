import { neueServiceId, plusMonate } from './vehicles';
import type { Antrieb, Getriebe, ServiceItem, Steuertrieb, Vehicle } from '../types';

/* ── Fahrzeugprofil: what the Wartungsplan is generated from ──
   Antrieb / Getriebe / Steuertrieb are stored on the vehicle when known; else
   they are inferred from Marke, Modell, Motor and the VIN (Stammnummer). The
   intervals below are workshop Richtwerte per manufacturer, not OEM data: every
   item stays editable, and an edited interval is kept (intervallManuell). */

export const ANTRIEBE: { value: Antrieb; label: string }[] = [
  { value: 'benzin',  label: 'Benzin' },
  { value: 'diesel',  label: 'Diesel' },
  { value: 'hybrid',  label: 'Hybrid' },
  { value: 'plugin',  label: 'Plug-in-Hybrid' },
  { value: 'elektro', label: 'Elektro' },
  { value: 'gas',     label: 'Erdgas (CNG)' },
];
export const GETRIEBE: { value: Getriebe; label: string }[] = [
  { value: 'manuell', label: 'Manuell' },
  { value: 'automat', label: 'Automat (Wandler)' },
  { value: 'dsg',     label: 'Doppelkupplung (DSG)' },
  { value: 'cvt',     label: 'Stufenlos (CVT)' },
];
export const STEUERTRIEBE: { value: Steuertrieb; label: string }[] = [
  { value: 'zahnriemen', label: 'Zahnriemen' },
  { value: 'kette',      label: 'Steuerkette' },
];
export const labelVon = <T extends string>(liste: { value: T; label: string }[], v?: T) => liste.find((x) => x.value === v)?.label;

/** Manufacturer groups sharing service schedules. */
type Gruppe = 'vag' | 'bmw' | 'mercedes' | 'porsche' | 'volvo' | 'ford' | 'stellantis' | 'fiat' | 'renault'
  | 'toyota' | 'honda' | 'mazda' | 'hyundai' | 'nissan' | 'subaru' | 'suzuki' | 'tesla' | 'andere';

const GRUPPE_VON: Record<string, Gruppe> = {
  vw: 'vag', volkswagen: 'vag', audi: 'vag', skoda: 'vag', 'škoda': 'vag', seat: 'vag', cupra: 'vag',
  bmw: 'bmw', mini: 'bmw',
  mercedes: 'mercedes', 'mercedes-benz': 'mercedes', mb: 'mercedes', smart: 'mercedes',
  porsche: 'porsche', volvo: 'volvo', ford: 'ford',
  peugeot: 'stellantis', citroen: 'stellantis', 'citroën': 'stellantis', ds: 'stellantis', opel: 'stellantis',
  fiat: 'fiat', 'alfa romeo': 'fiat', alfa: 'fiat', jeep: 'fiat', lancia: 'fiat', abarth: 'fiat',
  renault: 'renault', dacia: 'renault',
  toyota: 'toyota', lexus: 'toyota', honda: 'honda', mazda: 'mazda',
  hyundai: 'hyundai', kia: 'hyundai', nissan: 'nissan', subaru: 'subaru', suzuki: 'suzuki',
  tesla: 'tesla', polestar: 'tesla',
};

/** World Manufacturer Identifier (VIN chars 1–3, else 1–2) → Marke. */
const WMI: Record<string, string> = {
  WVW: 'VW', WV1: 'VW', WV2: 'VW', WVG: 'VW', WAU: 'Audi', WUA: 'Audi', TMB: 'Skoda', VSS: 'Seat',
  WBA: 'BMW', WBS: 'BMW', WBY: 'BMW', WMW: 'Mini', WDB: 'Mercedes', WDD: 'Mercedes', WDC: 'Mercedes',
  W1K: 'Mercedes', W1N: 'Mercedes', W1V: 'Mercedes', WME: 'Smart', WP0: 'Porsche', WP1: 'Porsche',
  YV1: 'Volvo', WF0: 'Ford', VF3: 'Peugeot', VR3: 'Peugeot', VF7: 'Citroen', VR7: 'Citroen', VR1: 'DS',
  W0L: 'Opel', W0V: 'Opel', ZFA: 'Fiat', ZAR: 'Alfa Romeo', VF1: 'Renault', UU1: 'Dacia',
  JTD: 'Toyota', JTN: 'Toyota', SB1: 'Toyota', NMT: 'Toyota', JHM: 'Honda', SHH: 'Honda',
  JMZ: 'Mazda', JM1: 'Mazda', KMH: 'Hyundai', TMA: 'Hyundai', KNA: 'Kia', U5Y: 'Kia',
  JN1: 'Nissan', SJN: 'Nissan', VSK: 'Nissan', JF1: 'Subaru', TSM: 'Suzuki', JS2: 'Suzuki',
  '5YJ': 'Tesla', LRW: 'Tesla', XP7: 'Tesla',
};
const WMI2: Record<string, string> = { JT: 'Toyota', JS: 'Suzuki' };

const vinOk = (vin?: string) => (vin ?? '').replace(/\s/g, '').toUpperCase().match(/^[A-HJ-NPR-Z0-9]{17}$/)?.[0];

/** Marke from the VIN's manufacturer code. */
export function markeAusVin(vin?: string): string | undefined {
  const v = vinOk(vin);
  return v ? WMI[v.slice(0, 3)] ?? WMI2[v.slice(0, 2)] : undefined;
}

/** Model year from VIN char 10 (latest year of its 30-year cycle not in the
    future). Not every European maker encodes it; only a fallback. */
export function baujahrAusVin(vin?: string, jetzt = new Date().getFullYear()): number | undefined {
  const v = vinOk(vin);
  if (!v) return undefined;
  const i = 'ABCDEFGHJKLMNPRSTVWXY123456789'.indexOf(v[9]);
  if (i < 0) return undefined;
  let y = 1980 + i;
  while (y + 30 <= jetzt + 1) y += 30;
  return y;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

const RE_ELEKTRO = /\b(e-?tron|electric|elektro|bev|ev|id\.?\s?\d|e-golf|e-up|leaf|zoe|i3|i4|ix\d?|eqa|eqb|eqc|eqe|eqs|kona electric|ioniq\s?[56]|mach-e|enyaq|e-208|e-2008|model [3sxy])\b/;
const RE_PLUGIN = /\b(phev|plug-?in|gte|e-?hybrid|recharge|twin engine|\d{3}e)\b/;
const RE_HYBRID = /\b(hybrid|hev|mhev)\b/;
const RE_DIESEL = /\b(\d{2,3}d|tdi|cdi|dci|hdi|bluehdi|crdi|tdci|jtd|jtdm|multijet|d-4d|i-dtec|skyactiv-d|bluetec|diesel|d[2-5]|cdti|sdv\d|tdv\d)\b/;
const RE_GAS = /\b(cng|g-tec|tgi|erdgas|natural power)\b/;
const RE_BENZIN = /\b(\d{3}i|tsi|tfsi|fsi|gti|tce|puretech|ecoboost|vti|thp|t-?jet|skyactiv-g|benzin|turbo petrol)\b/;

export interface FahrzeugProfil {
  gruppe: Gruppe;
  antrieb?: Antrieb;
  getriebe?: Getriebe;
  steuertrieb?: Steuertrieb;
  baujahr?: number;
  /** Which of the above were inferred rather than stored. */
  erkannt: { marke?: string; antrieb?: boolean; getriebe?: boolean; steuertrieb?: boolean; baujahr?: boolean };
}

type ProfilQuelle = Partial<Pick<Vehicle, 'marke' | 'modell' | 'motor' | 'chassisnummer' | 'erstzulassung' | 'antrieb' | 'getriebe' | 'steuertrieb'>>;

/** Profile a vehicle's maintenance schedule is derived from. */
export function fahrzeugProfil(v: ProfilQuelle): FahrzeugProfil {
  const erkannt: FahrzeugProfil['erkannt'] = {};
  let marke = norm(v.marke);
  if (!marke) {
    const m = markeAusVin(v.chassisnummer);
    if (m) { marke = norm(m); erkannt.marke = m; }
  }
  const gruppe: Gruppe = GRUPPE_VON[marke] ?? GRUPPE_VON[marke.split(/\s+/)[0]] ?? 'andere';
  const text = `${norm(v.modell)} ${norm(v.motor)}`;

  let antrieb = v.antrieb;
  if (!antrieb) {
    antrieb = gruppe === 'tesla' ? 'elektro'
      : RE_ELEKTRO.test(text) ? 'elektro'
      : RE_PLUGIN.test(text) ? 'plugin'
      : RE_HYBRID.test(text) ? 'hybrid'
      : RE_GAS.test(text) ? 'gas'
      : RE_DIESEL.test(text) ? 'diesel'
      : RE_BENZIN.test(text) ? 'benzin'
      : undefined;
    if (antrieb) erkannt.antrieb = true;
  }

  let getriebe = v.getriebe;
  if (!getriebe) {
    getriebe = /\b(dsg|s ?tronic|dct|edc|pdk|dkg)\b/.test(text) ? 'dsg'
      : /\b(cvt|e-?cvt|multidrive)\b/.test(text) || (gruppe === 'toyota' && (antrieb === 'hybrid' || antrieb === 'plugin')) ? 'cvt'
      : /\b(automat\w*|steptronic|tiptronic|\dg-tronic)\b/.test(text) ? 'automat'
      : /\b(manuell|schalt\w*|mt)\b/.test(text) ? 'manuell'
      : undefined;
    if (getriebe) erkannt.getriebe = true;
  }

  let baujahr = /^\d{4}/.test(v.erstzulassung ?? '') ? parseInt(v.erstzulassung!.slice(0, 4), 10) : undefined;
  if (!baujahr) {
    baujahr = baujahrAusVin(v.chassisnummer);
    if (baujahr) erkannt.baujahr = true;
  }

  let steuertrieb = v.steuertrieb;
  if (!steuertrieb && antrieb !== 'elektro') {
    steuertrieb = steuerketteBekannt(gruppe, antrieb, baujahr) ? 'kette' : undefined;
    if (steuertrieb) erkannt.steuertrieb = true;
  }

  return { gruppe, antrieb, getriebe, steuertrieb, baujahr, erkannt };
}

/** Engine families that (as a rule) run a maintenance-free timing chain. Unknown
    stays unknown: the Zahnriemen item is then kept, to be on the safe side. */
function steuerketteBekannt(g: Gruppe, a: Antrieb | undefined, bj?: number): boolean {
  const benziner = a === 'benzin' || a === 'hybrid' || a === 'plugin' || a === 'gas';
  if (g === 'bmw' || g === 'mercedes' || g === 'porsche') return true;
  if (g === 'mazda') return (bj ?? 0) >= 2012;
  if (!benziner) return false;
  if (g === 'toyota' || g === 'honda' || g === 'nissan' || g === 'hyundai' || g === 'suzuki') return true;
  if (g === 'subaru') return (bj ?? 0) >= 2011;
  return false;
}

/* ── Vorlagen: the items a vehicle's Wartungsplan is built from ── */

export type VorlageKey = NonNullable<ServiceItem['vorlage']>;

export interface Vorlage { key: VorlageKey; name: string; intervallKm?: number; intervallMonate?: number }

type Intervall = [km: number | undefined, monate: number | undefined];

const OEL: Partial<Record<Gruppe, Intervall>> = {
  vag: [30000, 24], bmw: [30000, 24], mercedes: [25000, 12], porsche: [20000, 24], volvo: [30000, 12],
  ford: [20000, 12], stellantis: [25000, 12], renault: [20000, 12], honda: [20000, 12], mazda: [20000, 12], nissan: [20000, 12],
};
const ZUENDKERZEN: Partial<Record<Gruppe, Intervall>> = {
  vag: [60000, 72], mercedes: [60000, 72], toyota: [90000, 72], honda: [100000, 96], mazda: [75000, 72], subaru: [100000, 96],
};
const ZAHNRIEMEN: Partial<Record<Gruppe, Intervall>> = {
  ford: [160000, 120], stellantis: [150000, 120], volvo: [150000, 120], renault: [120000, 72], fiat: [120000, 60],
};

/** The items that apply to this vehicle, with its intervals. */
export function wartungsVorlagen(v: ProfilQuelle): Vorlage[] {
  const p = fahrzeugProfil(v);
  const { gruppe: g, antrieb: a, getriebe, baujahr: bj } = p;
  const verbrenner = a !== 'elektro';
  const funken = a === undefined || a === 'benzin' || a === 'hybrid' || a === 'plugin' || a === 'gas';
  const alt = bj != null && bj < 2005;
  const longlife = g === 'vag' || g === 'bmw' || g === 'mercedes' || g === 'porsche';
  const out: Vorlage[] = [];
  const add = (key: VorlageKey, name: string, [intervallKm, intervallMonate]: Intervall) => out.push({ key, name, intervallKm, intervallMonate });

  if (verbrenner) {
    add('oel', 'Motoröl & Ölfilter', OEL[g] ?? [15000, 12]);
    add('luftfilter', 'Luftfilter', longlife ? [60000, 48] : [30000, 24]);
  }
  add('innenraumfilter', 'Innenraumfilter / Pollenfilter', longlife ? [30000, 24] : [15000, 12]);

  // Petrol filters sit in the tank for life on modern cars; diesel ones are changed.
  if (a === 'diesel') add('kraftstofffilter', 'Kraftstofffilter', g === 'bmw' || g === 'mercedes' ? [100000, 72] : [60000, 48]);
  else if (verbrenner && alt) add('kraftstofffilter', 'Kraftstofffilter', [60000, 48]);

  if (funken) add('zuendkerzen', 'Zündkerzen', ZUENDKERZEN[g] ?? [60000, 48]);

  add('bremsfluessigkeit', 'Bremsflüssigkeit', [undefined, g === 'tesla' ? 48 : 24]);

  if (verbrenner && p.steuertrieb !== 'kette') {
    const iv = g === 'vag' ? ((bj ?? 0) >= 2013 ? [210000, 120] as Intervall : [120000, 60] as Intervall) : ZAHNRIEMEN[g] ?? [120000, 72];
    add('zahnriemen', 'Zahnriemen / Wasserpumpe', iv);
  }

  // Manual gearboxes are filled for life (older ones excepted); EVs have a sealed reduction gear.
  if (verbrenner) {
    if (getriebe === 'dsg') add('getriebeoel', 'Getriebeöl (DSG)', [60000, undefined]);
    else if (getriebe === 'cvt') add('getriebeoel', 'Getriebeöl (CVT)', [60000, undefined]);
    else if (getriebe === 'automat') add('getriebeoel', 'Getriebeöl (Automat)', [g === 'mercedes' ? 125000 : 80000, undefined]);
    else if (getriebe === undefined || alt) add('getriebeoel', 'Getriebeöl', [60000, undefined]);
  }
  return out;
}

/** Identifies the vehicle's profile: stored on the vehicle when its plan was
    last matched to it (Vehicle.wartungsprofil). */
export const profilSignatur = (v: ProfilQuelle): string =>
  wartungsVorlagen(v).map((x) => `${x.key}:${x.intervallKm ?? ''}/${x.intervallMonate ?? ''}`).join(',');

/** Generic defaults of earlier versions: an item still carrying them was never adjusted by hand. */
const LEGACY: Record<VorlageKey, { name: string; iv: Intervall }> = {
  oel:               { name: 'Motoröl & Ölfilter',             iv: [15000, 12] },
  luftfilter:        { name: 'Luftfilter',                     iv: [30000, 24] },
  innenraumfilter:   { name: 'Innenraumfilter / Pollenfilter', iv: [15000, 12] },
  kraftstofffilter:  { name: 'Kraftstofffilter',               iv: [60000, 48] },
  zuendkerzen:       { name: 'Zündkerzen',                     iv: [60000, 48] },
  bremsfluessigkeit: { name: 'Bremsflüssigkeit',               iv: [undefined, 24] },
  zahnriemen:        { name: 'Zahnriemen / Wasserpumpe',       iv: [120000, 72] },
  getriebeoel:       { name: 'Getriebeöl',                     iv: [60000, undefined] },
};

/** The Vorlage an item was made from (older items: by their name). */
export function vorlageVon(i: ServiceItem): VorlageKey | undefined {
  if (i.vorlage) return i.vorlage;
  const n = i.name.trim();
  if (n.startsWith('Getriebeöl')) return 'getriebeoel';
  return (Object.keys(LEGACY) as VorlageKey[]).find((k) => LEGACY[k].name === n);
}

const ausVorlage = (x: Vorlage): ServiceItem =>
  ({ id: neueServiceId(), vorlage: x.key, name: x.name, status: 'faellig', intervallKm: x.intervallKm, intervallMonate: x.intervallMonate });

/** A fresh Wartungsplan with only the items that apply to the vehicle. */
export const wartungsplanFuer = (v: ProfilQuelle): ServiceItem[] => wartungsVorlagen(v).map(ausVorlage);

/** Never done, never edited: safe to drop when it no longer applies. */
const unberuehrt = (i: ServiceItem) =>
  !i.historie?.length && !i.letztesDatum && !i.letzteKm && !i.faelligDatum && !i.faelligKm && !i.notiz && !i.intervallManuell;

const gleich = (i: ServiceItem, [km, mt]: Intervall) => (i.intervallKm ?? undefined) === km && (i.intervallMonate ?? undefined) === mt;

/** Matches an existing plan to the vehicle's (new) profile:
    - items that don't apply any more are dropped, unless they carry history or edits;
    - items still on the profile's (or an earlier default) interval get the new
      one, and a due date / mileage that followed from the old interval moves along;
    - applicable items missing from the plan are added;
    - own positions and intervals edited by hand stay as they are.
    `vorher` is the vehicle before the change (its profile counts as "not edited"). */
export function wartungsplanAbgleichen(items: ServiceItem[], v: ProfilQuelle, vorher?: ProfilQuelle): ServiceItem[] {
  const soll = new Map(wartungsVorlagen(v).map((x) => [x.key, x]));
  const alt = new Map(vorher ? wartungsVorlagen(vorher).map((x) => [x.key, x]) : []);
  const gesehen = new Set<VorlageKey>();
  const out: ServiceItem[] = [];

  for (const i of items) {
    const key = vorlageVon(i);
    if (!key) { out.push(i); continue; }
    gesehen.add(key);
    const s = soll.get(key);
    if (!s) { if (!unberuehrt(i)) out.push(i); continue; }
    const a = alt.get(key);
    const auto = !i.intervallManuell && (gleich(i, LEGACY[key].iv) || (a && gleich(i, [a.intervallKm, a.intervallMonate])));
    if (!auto) { out.push({ ...i, vorlage: key }); continue; }

    const n: ServiceItem = { ...i, vorlage: key, name: s.name, intervallKm: s.intervallKm, intervallMonate: s.intervallMonate };
    // Due values set by "Gemacht" (last service + old interval) follow the new interval.
    if (i.letztesDatum && i.faelligDatum && i.intervallMonate && i.faelligDatum === plusMonate(i.letztesDatum, i.intervallMonate))
      n.faelligDatum = s.intervallMonate ? plusMonate(i.letztesDatum, s.intervallMonate) : undefined;
    const lk = parseInt(i.letzteKm ?? '', 10);
    if (Number.isFinite(lk) && i.faelligKm && i.intervallKm && parseInt(i.faelligKm, 10) === lk + i.intervallKm)
      n.faelligKm = s.intervallKm ? String(lk + s.intervallKm) : undefined;
    out.push(n);
  }
  for (const [key, s] of soll) if (!gesehen.has(key)) out.push(ausVorlage(s));
  return out;
}

/** The vehicle with its plan matched to its profile (created when it has none
    yet) and the profile signature recorded. */
export function mitWartungsplan(v: Vehicle, vorher?: Vehicle): Vehicle {
  const service = v.service ? wartungsplanAbgleichen(v.service, v, vorher) : wartungsplanFuer(v);
  return { ...v, service, wartungsprofil: profilSignatur(v) };
}
