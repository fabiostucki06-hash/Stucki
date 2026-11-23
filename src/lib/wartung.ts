import { neueServiceId, plusMonate } from './vehicles';
import { modelljahrAusVin } from '../../supabase/functions/vin-decode/vds';
import type { Achsantrieb, Antrieb, Getriebe, IntervallQuelle, ServiceItem, Steuertrieb, Vehicle, WartungSpec } from '../types';

/* ── Fahrzeugprofil: what the Wartungsplan is generated from ──
   Antrieb / Getriebe / Steuertrieb are stored on the vehicle when known; else
   they are inferred from the Motorkennbuchstabe (MOTOREN), Marke, Modell, Motor
   and the VIN (WMI + model year only; the rest of a VIN is manufacturer-coded).

   No OEM / TecDoc / Autodata data is built in, so every interval carries its
   source (ServiceItem.quelle):
   - 'standard':  generic value, the vehicle data isn't enough for more;
   - 'richtwert': workshop Richtwert for the manufacturer / engine family;
   - 'geprueft':  checked by the workshop against the OEM schedule. Checked
     intervals are stored per Motorkennbuchstabe (table maintenance_specs,
     WartungSpec) and used for every vehicle with that engine.
   Only 'geprueft' counts as verified; the UI asks to check the others. Every
   item stays editable, and an interval set by hand is kept (intervallManuell). */

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
export const ACHSANTRIEBE: { value: Achsantrieb; label: string }[] = [
  { value: 'front',  label: 'Frontantrieb' },
  { value: 'heck',   label: 'Heckantrieb' },
  { value: 'allrad', label: 'Allrad' },
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

/** Model year from the VIN, only where it is unambiguous (vds.ts). */
export function baujahrAusVin(vin?: string, jetzt = new Date().getFullYear()): number | undefined {
  const v = vinOk(vin);
  return v ? modelljahrAusVin(markeAusVin(v), v, jetzt) : undefined;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

const RE_ELEKTRO = /\b(e-?tron|electric|elektro|bev|ev|id\.?\s?\d|e-golf|e-up|leaf|zoe|i3|i4|ix\d?|eqa|eqb|eqc|eqe|eqs|kona electric|ioniq\s?[56]|mach-e|enyaq|e-208|e-2008|model [3sxy])\b/;
const RE_PLUGIN = /\b(phev|plug-?in|gte|e-?hybrid|recharge|twin engine|\d{3}e)\b/;
const RE_HYBRID = /\b(hybrid|hev|mhev)\b/;
const RE_DIESEL = /\b(\d{2,3} ?d|tdi|cdi|dci|hdi|bluehdi|crdi|tdci|jtd|jtdm|multijet|d-4d|i-dtec|skyactiv-d|bluetec|diesel|d[2-5]|cdti|sdv\d|tdv\d)\b/;
const RE_GAS = /\b(cng|g-tec|tgi|erdgas|natural power)\b/;
const RE_BENZIN = /\b(\d{3}i|tsi|tfsi|fsi|gti|tce|puretech|ecoboost|vti|thp|t-?jet|skyactiv-g|benzin|turbo petrol)\b/;

/** Engine families whose Steuertrieb is documented. Matched on the
    Motorkennbuchstabe (`code`, prefix) or the Motor / Modell text. First match
    wins, so exceptions come before the rule of their manufacturer. */
interface Motor { name: string; antrieb?: 'benzin' | 'diesel'; steuertrieb: Steuertrieb; nass?: boolean; zahnriemen?: Intervall }
const MOTOREN: { gruppen: Gruppe[]; code?: RegExp; text?: RegExp; m: Motor }[] = [
  // VAG
  { gruppen: ['vag'], code: /^(CGP|CHF|BME|BZG)/, m: { name: 'EA111 1.2 3-Zylinder', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['vag'], code: /^(CAV|CAX|CBZ|CTH|BMY|BLG|BLF|BAG|BKG|BLP)/, m: { name: 'EA111 TSI / FSI', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['vag'], code: /^(BUD|BCA|BXW|CGG|AXP|BBY|BKY|AUA)/, m: { name: 'EA111 MPI 16V', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], code: /^(BSE|BSF|BSU|BGU|AXX|BWA|BPY)/, m: { name: 'EA113', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], code: /^(CHZ|DKR|DKL|DLA|CHY|CJZ|CZC|CZD|CZE|CPT|CHP|CMB|CXS|CVN|DAC|DAD|DPC|DPB|CWV|CUK|DGE|DFY)/, m: { name: 'EA211', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], code: /^(CCZ|CDA|CJS|CJX|CHH|CZP|CAW|CBF|CDN|CAE|CDH|CAB|CJK|DKZ|DKT|DJH|DNF|BZB|CPM|CNC)/, m: { name: 'EA888', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['vag'], code: /^(CAY|CFF|CFG|CBA|CBB|CBD|CAG|CAA|CFC|CFH|CFJ|CFW|CJA|CLH|CRB|CRL|CRK|CUN|CXH|CXF|CXE|CXG|CXX|DCX|DFG|DFH|DFC|CUA|DGT|DTT|DTR)/, m: { name: 'EA189 / EA288 TDI', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], code: /^(BKC|BXE|BLS|BKD|AZV|BKP|BMP|BMR|AXB|AXC|BJB|BMM|BRE|ASZ|ATD|AXR|AJM|BST)/, m: { name: 'Pumpe-Düse / SDI', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], code: /^(CCW|CDU|CAP|CAS|CKV|CRT|CVU|CLA|DCP|CDY|CRC)/, m: { name: 'TDI V6 (EA896/EA897)', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['vag'], text: /\b(1\.[2-9]|2\.0) ?tdi\b/, m: { name: 'TDI R3/R4', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['vag'], text: /\b[34]\.0 ?tdi\b/, m: { name: 'TDI V6/V8', antrieb: 'diesel', steuertrieb: 'kette' } },
  // BMW / Mini (Mini Cooper D up to 2010: PSA 1.6 HDi)
  { gruppen: ['bmw'], code: /^W16D16/, m: { name: 'PSA DV6', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['bmw'], code: /^([NBS]\d{2}|M[45]\d)/, m: { name: 'BMW M/N/B', steuertrieb: 'kette' } },
  // Mercedes: OM607 / OM608 are the Renault 1.5 dCi (K9K)
  { gruppen: ['mercedes'], code: /^OM60[78]/, m: { name: 'OM607/608 (K9K)', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['mercedes'], code: /^OM6\d\d/, m: { name: 'Mercedes OM', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['mercedes'], code: /^M\d{3}/, m: { name: 'Mercedes M', antrieb: 'benzin', steuertrieb: 'kette' } },
  // Stellantis (incl. Opel)
  { gruppen: ['stellantis'], code: /^(EB[02]|F12X[EH])/, text: /\bpuretech\b/, m: { name: 'PureTech EB (Nassriemen)', antrieb: 'benzin', steuertrieb: 'zahnriemen', nass: true, zahnriemen: [100000, 72] } },
  { gruppen: ['stellantis'], code: /^EP[36]/, text: /\b1\.[46] ?(thp|vti)\b/, m: { name: 'EP (Prince)', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['stellantis'], code: /^(TU[1-5]|EW(7|10)|ET3)/, m: { name: 'PSA TU / EW', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['stellantis'], code: /^(DV4|DV5|DV6|DW8|DW10|DW12|F15DT)/, text: /\b(1\.4|1\.5|1\.6|2\.0|2\.2) ?(blue)?hdi\b/, m: { name: 'HDi DV/DW', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['stellantis'], code: /^([AB]20DT|[ZY]19DT)/, m: { name: 'Opel 1.9 / 2.0 CDTI', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['stellantis'], code: /^[ZA]13DT/, m: { name: 'Opel 1.3 CDTI (Multijet)', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['stellantis'], code: /^([AB]14N[EF]T|[ZA]1[0-4]XE[PRL]|B1[24]XE[RL])/, m: { name: 'Opel Family 0 / 1.4 Turbo', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['stellantis'], code: /^([ZA]1[68]XE[RP]|[ZA]16LE[TR])/, m: { name: 'Opel Family 1', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['stellantis'], code: /^A20N[HF]T/, m: { name: 'Opel 2.0 Turbo', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['stellantis'], code: /^B16DT/, m: { name: 'Opel 1.6 CDTI', antrieb: 'diesel', steuertrieb: 'kette' } },
  // Ford (engine codes are model-specific: matched on the Motor text)
  { gruppen: ['ford'], text: /\b1\.0 ?ecoboost\b/, m: { name: '1.0 EcoBoost (Nassriemen)', antrieb: 'benzin', steuertrieb: 'zahnriemen', nass: true } },
  { gruppen: ['ford'], text: /\b2\.0 ?ecoblue\b/, m: { name: '2.0 EcoBlue (Nassriemen)', antrieb: 'diesel', steuertrieb: 'zahnriemen', nass: true } },
  { gruppen: ['ford'], text: /\b(2\.0|2\.3) ?ecoboost\b|\b2\.0 ?duratec\b/, m: { name: 'Duratec HE / EcoBoost 2.0', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['ford'], text: /\b(1\.25|1\.4|1\.6) ?(duratec|ti-?vct)\b|\b1\.6 ?ecoboost\b/, m: { name: 'Sigma', antrieb: 'benzin', steuertrieb: 'zahnriemen' } },
  { gruppen: ['ford'], text: /\b(1\.8|2\.2|2\.4|3\.2) ?tdci\b|transit.*\b2\.0 ?tdci\b/, m: { name: 'Duratorq Lynx / Puma', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['ford'], text: /\b(1\.4|1\.5|1\.6|2\.0) ?tdci\b/, m: { name: 'TDCi (PSA DV/DW)', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  // Renault / Dacia / Nissan
  { gruppen: ['renault', 'nissan'], code: /^K9K/, text: /\b1\.5 ?(blue)?dci\b/, m: { name: 'K9K 1.5 dCi', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['renault', 'nissan'], code: /^(D4F|D7F|K4J|K4M|K7J|K7M|F4R|F9Q)/, m: { name: 'Renault D/K/F', steuertrieb: 'zahnriemen' } },
  { gruppen: ['renault', 'nissan'], code: /^(H4B|H4D|H4M|H5F|H5H|HRA2)/, text: /\b(0\.9|1\.0|1\.2|1\.3) ?(tce|dig-t|ig-t)\b/, m: { name: 'Renault-Nissan H', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['renault', 'nissan'], code: /^(R9M|M9R|V9X)/, m: { name: 'Renault R9M / M9R / V9X dCi', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['nissan'], code: /^(HR|MR|QR|CR|YD|YS)\d/, m: { name: 'Nissan HR/MR/QR/CR/YD', steuertrieb: 'kette' } },
  // Fiat engines, also in Opel (1.3 CDTI) and Suzuki (1.3 DDiS)
  { gruppen: ['fiat'], code: /^(F1CE|4HV|312A2)/, m: { name: 'Fiat / Iveco mit Steuerkette', steuertrieb: 'kette' } },
  { gruppen: ['fiat'], code: /^(F1AE|169A[34]|187A1)/, m: { name: 'Fiat Fire / Iveco F1A', steuertrieb: 'zahnriemen' } },
  { gruppen: ['fiat', 'stellantis', 'suzuki'], text: /\b1\.3 ?(multijet|mjet|jtd|jtdm|cdti|ddis)\b/, m: { name: '1.3 Multijet', antrieb: 'diesel', steuertrieb: 'kette' } },
  { gruppen: ['fiat'], text: /\b0\.9 ?twinair\b|\b(2\.2|3\.0) ?multijet\b|\b1750 ?tbi\b/, m: { name: 'TwinAir / Multijet mit Kette', steuertrieb: 'kette' } },
  { gruppen: ['fiat'], text: /\b((1\.6|1\.9|2\.0|2\.3) ?(multijet|jtd|jtdm)|1\.4 ?(t-?jet|multiair|tb|16v|8v|fire)|1\.[12] ?(8v|fire))\b/, m: { name: 'Fiat Fire / Multijet R4', steuertrieb: 'zahnriemen' } },
  // Toyota: the old D-4D 2.5 / 3.0 (KD) and 2.0 (CD) run a belt
  { gruppen: ['toyota'], code: /^(\dKD|1CD)/, m: { name: 'Toyota D-4D KD / CD', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['toyota'], code: /^(\d?(KR|NR|ZR|NZ|ZZ|AZ|AR|GR|AD|ND|GD|WW)|M15A|M20A|A25A)/, text: /\b1\.4 ?d-?4d\b/, m: { name: 'Toyota KR/NR/ZR/AR/AD/GD/Dynamic Force', steuertrieb: 'kette' } },
  // Honda
  { gruppen: ['honda'], code: /^J\d{2}/, m: { name: 'Honda J (V6)', steuertrieb: 'zahnriemen' } },
  { gruppen: ['honda'], code: /^([KLRN]\d{2}|L[DEF][ABC])/, m: { name: 'Honda K/L/R/N', steuertrieb: 'kette' } },
  // Mazda: the 1.4 / 1.6 MZ-CD is the PSA DV diesel
  { gruppen: ['mazda'], code: /^(Y4|Y6)/, m: { name: 'Mazda MZ-CD (PSA DV)', antrieb: 'diesel', steuertrieb: 'zahnriemen' } },
  { gruppen: ['mazda'], code: /^(P5|PE|PY|HF|SH|S5|S8|Z6|LF|L8|L5|L3|ZJ|ZY|RF7J|R2AA)/, text: /\bskyactiv\b/, m: { name: 'Mazda SKYACTIV / MZR', steuertrieb: 'kette' } },
  // Hyundai / Kia: Beta / Alpha petrol and the old 2.0 CRDi run a belt
  { gruppen: ['hyundai'], code: /^(G4GC|G4GB|G4ED|G4EE|D4EA)/, m: { name: 'Hyundai Beta / Alpha / D 2.0 CRDi', steuertrieb: 'zahnriemen' } },
  { gruppen: ['hyundai'], code: /^(D[34]F|D4H|G3L|G4L|G4F|G4K|G4N)/, m: { name: 'Hyundai Kappa / Gamma / Nu / Theta / U / R', steuertrieb: 'kette' } },
  // Volvo: Ford 2.0 EcoBoost (B4204T6/T7) with chain, VEA and 5-cylinder with belt
  { gruppen: ['volvo'], code: /^B4204T[67]$/, m: { name: 'Ford 2.0 EcoBoost', antrieb: 'benzin', steuertrieb: 'kette' } },
  { gruppen: ['volvo'], code: /^([BD]42\d\dT|B3154T|D52\d\dT|B5\d{3}|B4164T|D4162T)/, m: { name: 'Volvo VEA / 5-Zylinder / 1.6', steuertrieb: 'zahnriemen' } },
];

/** "cff b" / "CFF-B" → "CFFB". */
export const normMotorcode = (c?: string) => (c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function motorVon(g: Gruppe, code: string, text: string): Motor | undefined {
  return MOTOREN.find((x) => x.gruppen.includes(g) && ((!!code && !!x.code?.test(code)) || !!x.text?.test(text)))?.m;
}

/** Engine family documented for exactly this Motorkennbuchstabe (never from free text or the Marke). */
export function motorfamilieAusCode(marke?: string, motorcode?: string): { name: string; steuertrieb: Steuertrieb } | undefined {
  const m = norm(marke);
  const code = normMotorcode(motorcode);
  return code ? motorVon(GRUPPE_VON[m] ?? GRUPPE_VON[m.split(/\s+/)[0]] ?? 'andere', code, '') : undefined;
}

export interface FahrzeugProfil {
  gruppe: Gruppe;
  /** Manufacturer key of maintenance_specs: the group, else the Marke. */
  hersteller: string;
  motorcode?: string;
  /** Engine family recognized from the Motorkennbuchstabe / Motor text. */
  motor?: Motor;
  antrieb?: Antrieb;
  getriebe?: Getriebe;
  steuertrieb?: Steuertrieb;
  /** Where the Steuertrieb comes from: stored, engine family, or assumed from the Marke. */
  steuertriebQuelle?: 'fahrzeug' | 'motor' | 'marke';
  baujahr?: number;
  /** Which of the above were inferred rather than stored. */
  erkannt: { marke?: string; antrieb?: boolean; getriebe?: boolean; steuertrieb?: boolean; baujahr?: boolean };
  /** Vehicle data missing to match the OEM schedule exactly. */
  fehlt: string[];
}

type ProfilQuelle = Partial<Pick<Vehicle, 'marke' | 'modell' | 'motor' | 'motorcode' | 'chassisnummer' | 'erstzulassung' | 'antrieb' | 'getriebe' | 'steuertrieb' | 'achsantrieb'>>;

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
  const motorcode = normMotorcode(v.motorcode) || undefined;
  const motor = motorVon(gruppe, motorcode ?? '', text);

  let antrieb = v.antrieb;
  if (!antrieb) {
    antrieb = gruppe === 'tesla' ? 'elektro'
      : motor?.antrieb && !RE_HYBRID.test(text) && !RE_PLUGIN.test(text) ? motor.antrieb
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
  let steuertriebQuelle: FahrzeugProfil['steuertriebQuelle'] = steuertrieb && 'fahrzeug';
  if (!steuertrieb && antrieb !== 'elektro') {
    if (motor) { steuertrieb = motor.steuertrieb; steuertriebQuelle = 'motor'; }
    else if (steuerketteBekannt(gruppe, antrieb, baujahr)) { steuertrieb = 'kette'; steuertriebQuelle = 'marke'; }
    if (steuertrieb) erkannt.steuertrieb = true;
  }

  const fehlt: string[] = [];
  if (antrieb !== 'elektro') {
    if (!motorcode) fehlt.push('Motorkennbuchstabe');
    if (!v.getriebe) fehlt.push('Getriebe');
  }
  if (!v.antrieb) fehlt.push('Antrieb');
  if (!/^\d{4}/.test(v.erstzulassung ?? '')) fehlt.push('1. Inverkehrsetzung');

  const hersteller = gruppe !== 'andere' ? gruppe : marke;
  return { gruppe, hersteller, motorcode, motor, antrieb, getriebe, steuertrieb, steuertriebQuelle, baujahr, erkannt, fehlt };
}

/** Manufacturers whose engines (as a rule) run a maintenance-free timing chain.
    Only an assumption (steuertriebQuelle 'marke'): the Motorkennbuchstabe
    decides. Unknown stays unknown: the Zahnriemen item is then kept. */
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

export interface Vorlage {
  key: VorlageKey;
  name: string;
  intervallKm?: number;
  intervallMonate?: number;
  quelle: IntervallQuelle;
  /** Reference of a checked interval (WartungSpec.quelleText). */
  quelleText?: string;
  /** What to check / which vehicle detail is missing. */
  hinweis?: string;
}

type Intervall = [km: number | undefined, monate: number | undefined];

const OEL: Partial<Record<Gruppe, Intervall>> = {
  vag: [30000, 24], bmw: [30000, 24], mercedes: [25000, 12], porsche: [20000, 24], volvo: [30000, 12],
  ford: [20000, 12], stellantis: [25000, 12], renault: [20000, 12], honda: [20000, 12], mazda: [20000, 12], nissan: [20000, 12],
  toyota: [15000, 12], hyundai: [15000, 12], fiat: [15000, 12], suzuki: [15000, 12], subaru: [15000, 12],
};
const ZUENDKERZEN: Partial<Record<Gruppe, Intervall>> = {
  vag: [60000, 72], mercedes: [60000, 72], toyota: [90000, 72], honda: [100000, 96], mazda: [75000, 72], subaru: [100000, 96],
};
const ZAHNRIEMEN: Partial<Record<Gruppe, Intervall>> = {
  ford: [160000, 120], stellantis: [150000, 120], volvo: [150000, 120], renault: [120000, 72], fiat: [120000, 60],
};

export const HINWEIS_STANDARD = 'Standardwert – bitte anhand Motorkennbuchstabe/VIN prüfen';
export const HINWEIS_RICHTWERT = 'Richtwert – mit Herstellervorgabe (Serviceheft / Motorkennbuchstabe) abgleichen';

/** "vag|CFFB|zahnriemen" */
export const specId = (hersteller: string, motorcode: string, key: VorlageKey) => `${hersteller}|${normMotorcode(motorcode)}|${key}`;

/** The items that apply to this vehicle, with intervals and their source.
    Intervals checked for the vehicle's engine (specs) replace the Richtwerte. */
export function wartungsVorlagen(v: ProfilQuelle, specs: WartungSpec[] = []): Vorlage[] {
  const p = fahrzeugProfil(v);
  const { gruppe: g, antrieb: a, getriebe, baujahr: bj } = p;
  const verbrenner = a !== 'elektro';
  const funken = a === undefined || a === 'benzin' || a === 'hybrid' || a === 'plugin' || a === 'gas';
  const alt = bj != null && bj < 2005;
  const longlife = g === 'vag' || g === 'bmw' || g === 'mercedes' || g === 'porsche';
  const out: Vorlage[] = [];
  // The manufacturer's Richtwert when there is one, else the generic Standardwert.
  const add = (key: VorlageKey, name: string, richtwert: Intervall | undefined, standard: Intervall, hinweis?: string) => {
    const [intervallKm, intervallMonate] = richtwert ?? standard;
    const quelle: IntervallQuelle = richtwert ? 'richtwert' : 'standard';
    out.push({ key, name, intervallKm, intervallMonate, quelle, hinweis: hinweis ?? (richtwert ? HINWEIS_RICHTWERT : HINWEIS_STANDARD) });
  };

  if (verbrenner) {
    add('oel', 'Motoröl & Ölfilter', OEL[g], [15000, 12],
      longlife ? 'Richtwert LongLife – fixes oder flexibles Intervall und Ölnorm laut Serviceheft prüfen' : undefined);
    add('luftfilter', 'Luftfilter', longlife ? [60000, 48] : undefined, [30000, 24]);
  }
  add('innenraumfilter', 'Innenraumfilter / Pollenfilter', longlife ? [30000, 24] : undefined, [15000, 12]);

  // Petrol filters sit in the tank for life on modern cars; diesel ones are changed.
  if (a === 'diesel') add('kraftstofffilter', 'Kraftstofffilter', g === 'bmw' || g === 'mercedes' ? [100000, 72] : undefined, [60000, 48]);
  else if (verbrenner && alt) add('kraftstofffilter', 'Kraftstofffilter', undefined, [60000, 48],
    'Standardwert – bei vielen Benzinern im Tank verbaut (lebenslang), anhand Motorkennbuchstabe prüfen');

  if (funken) add('zuendkerzen', 'Zündkerzen', ZUENDKERZEN[g], [60000, 48],
    a === undefined ? 'Antrieb unbekannt – entfällt bei Diesel; Intervall anhand Motorkennbuchstabe prüfen' : undefined);

  add('bremsfluessigkeit', 'Bremsflüssigkeit', g !== 'andere' ? [undefined, g === 'tesla' ? 48 : 24] : undefined, [undefined, 24]);

  if (verbrenner && p.steuertrieb !== 'kette') {
    const m = p.motor?.steuertrieb === 'zahnriemen' ? p.motor : undefined;
    const iv = m?.zahnriemen
      ?? (g === 'vag' ? ((bj ?? 0) >= 2013 ? [210000, 120] as Intervall : [120000, 60] as Intervall) : ZAHNRIEMEN[g]);
    // Without a known Zahnriemen the item is only kept to be on the safe side.
    const bekannt = p.steuertrieb === 'zahnriemen';
    add('zahnriemen', m?.nass ? 'Zahnriemen (Nassriemen) / Wasserpumpe' : 'Zahnriemen / Wasserpumpe', bekannt ? iv : undefined, iv ?? [120000, 72],
      !bekannt ? 'Steuertrieb unbekannt – Motorkennbuchstabe angeben (bei Steuerkette entfällt die Position)'
        : m?.nass ? `${m.name}: Riemen läuft im Öl – Ölnorm und Herstellervorgabe beachten`
        : undefined);
  }

  // Manual gearboxes are filled for life (older ones excepted); EVs have a sealed reduction gear.
  if (verbrenner) {
    if (getriebe === 'dsg') add('getriebeoel', 'Getriebeöl (DSG)', g === 'vag' ? [60000, undefined] : undefined, [60000, undefined],
      'Nasskupplung (z.B. DQ250/DQ381/DQ500): Wechsel nach Vorgabe; Trockenkupplung (DQ200): kein Wechselintervall – Getriebecode prüfen');
    else if (getriebe === 'cvt') add('getriebeoel', 'Getriebeöl (CVT)', undefined, [60000, undefined]);
    else if (getriebe === 'automat') add('getriebeoel', 'Getriebeöl (Automat)', g === 'mercedes' ? [125000, undefined] : undefined, [80000, undefined],
      'Viele Wandlerautomaten sind laut Hersteller lebenslang befüllt – Getriebecode prüfen');
    else if (getriebe === undefined) add('getriebeoel', 'Getriebeöl', undefined, [60000, undefined], 'Getriebe unbekannt – Getriebeart angeben');
    else if (alt) add('getriebeoel', 'Getriebeöl', undefined, [60000, undefined]);
  }

  // Only for a vehicle explicitly set to Allrad. Which of these exist depends on the system, and
  // electric all-wheel drive (one motor per axle) has none of them.
  if (v.achsantrieb === 'allrad' && verbrenner) {
    const hinweis = 'Standardwert – nur falls bei diesem Allradsystem verbaut; Öl und Intervall laut Herstellervorgabe prüfen, sonst Position löschen';
    add('allradkupplung', 'Allrad: Kupplung / Haldex-Öl', undefined, [60000, 36], hinweis);
    add('verteilergetriebe', 'Allrad: Verteilergetriebe-Öl', undefined, [100000, undefined], hinweis);
    add('hinterachsgetriebe', 'Allrad: Hinterachsdifferenzial-Öl', undefined, [100000, undefined], hinweis);
  }

  // Intervals checked against the OEM schedule for this engine.
  if (p.motorcode) {
    const geprueft = new Map(specs.filter((s) => s.hersteller === p.hersteller && s.motorcode === p.motorcode).map((s) => [s.vorlage, s]));
    for (const x of out) {
      const s = geprueft.get(x.key);
      if (s) Object.assign(x, { intervallKm: s.intervallKm, intervallMonate: s.intervallMonate, quelle: 'geprueft', quelleText: s.quelleText, hinweis: undefined });
    }
  }
  return out;
}

/** Identifies the vehicle's profile: stored on the vehicle when its plan was
    last matched to it (Vehicle.wartungsprofil). */
export const profilSignatur = (v: ProfilQuelle, specs: WartungSpec[] = []): string =>
  wartungsVorlagen(v, specs).map((x) => `${x.key}:${x.intervallKm ?? ''}/${x.intervallMonate ?? ''}${x.quelle === 'geprueft' ? '!' : ''}`).join(',');

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
  allradkupplung:    { name: 'Allrad: Kupplung / Haldex-Öl',   iv: [60000, 36] },
  verteilergetriebe: { name: 'Allrad: Verteilergetriebe-Öl',   iv: [100000, undefined] },
  hinterachsgetriebe: { name: 'Allrad: Hinterachsdifferenzial-Öl', iv: [100000, undefined] },
};

/** The Vorlage an item was made from (older items: by their name). */
export function vorlageVon(i: ServiceItem): VorlageKey | undefined {
  if (i.vorlage) return i.vorlage;
  const n = i.name.trim();
  if (n.startsWith('Getriebeöl')) return 'getriebeoel';
  if (n.startsWith('Zahnriemen')) return 'zahnriemen';
  return (Object.keys(LEGACY) as VorlageKey[]).find((k) => LEGACY[k].name === n);
}

const ausVorlage = (x: Vorlage): ServiceItem => ({
  id: neueServiceId(), vorlage: x.key, name: x.name, status: 'faellig', intervallKm: x.intervallKm, intervallMonate: x.intervallMonate,
  quelle: x.quelle, ...(x.quelleText ? { quelleText: x.quelleText } : {}),
});

/** A fresh Wartungsplan with only the items that apply to the vehicle. */
export const wartungsplanFuer = (v: ProfilQuelle, specs: WartungSpec[] = []): ServiceItem[] => wartungsVorlagen(v, specs).map(ausVorlage);

/** Never done, never edited: safe to drop when it no longer applies. */
const unberuehrt = (i: ServiceItem) =>
  !i.historie?.length && !i.letztesDatum && !i.letzteKm && !i.faelligDatum && !i.faelligKm && !i.notiz && !i.intervallManuell;

const gleich = (i: ServiceItem, [km, mt]: Intervall) => (i.intervallKm ?? undefined) === km && (i.intervallMonate ?? undefined) === mt;

/** Matches an existing plan to the vehicle's (new) profile:
    - items that don't apply any more are dropped, unless they carry history or edits;
    - items not set by hand (generated, or still on an earlier default) get the
      new interval and its source, and a due date / mileage that followed from
      the old interval moves along;
    - applicable items missing from the plan are added;
    - own positions and intervals edited or checked by hand stay as they are.
    `vorher` is the vehicle before the change (its profile counts as "not edited"). */
export function wartungsplanAbgleichen(items: ServiceItem[], v: ProfilQuelle, vorher?: ProfilQuelle, specs: WartungSpec[] = []): ServiceItem[] {
  const soll = new Map(wartungsVorlagen(v, specs).map((x) => [x.key, x]));
  const alt = new Map(vorher ? wartungsVorlagen(vorher, specs).map((x) => [x.key, x]) : []);
  const gesehen = new Set<VorlageKey>();
  const out: ServiceItem[] = [];

  for (const i of items) {
    const key = vorlageVon(i);
    if (!key) { out.push(i); continue; }
    gesehen.add(key);
    const s = soll.get(key);
    if (!s) { if (!unberuehrt(i)) out.push(i); continue; }
    const a = alt.get(key);
    const auto = !i.intervallManuell && (i.quelle != null || gleich(i, LEGACY[key].iv) || (a && gleich(i, [a.intervallKm, a.intervallMonate])));
    if (!auto) { out.push({ ...i, vorlage: key }); continue; }

    const n: ServiceItem = { ...i, vorlage: key, name: s.name, intervallKm: s.intervallKm, intervallMonate: s.intervallMonate, quelle: s.quelle };
    if (s.quelleText) n.quelleText = s.quelleText; else delete n.quelleText;
    delete n.geprueftAm;
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
export function mitWartungsplan(v: Vehicle, vorher?: Vehicle, specs: WartungSpec[] = []): Vehicle {
  const service = v.service ? wartungsplanAbgleichen(v.service, v, vorher, specs) : wartungsplanFuer(v, specs);
  return { ...v, service, wartungsprofil: profilSignatur(v, specs) };
}

/** Source of an item's interval for display: stored on newer items; older
    generated items take the one of their Vorlage while they carry its
    interval, else count as Standardwert. Own positions and intervals set by
    hand without a check have none. */
export function quelleVon(i: ServiceItem, vorlage?: Vorlage): IntervallQuelle | undefined {
  if (i.quelle) return i.quelle;
  if (!vorlageVon(i) || i.intervallManuell) return undefined;
  return vorlage && gleich(i, [vorlage.intervallKm, vorlage.intervallMonate]) ? vorlage.quelle : 'standard';
}
