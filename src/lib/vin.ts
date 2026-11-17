import { fahrzeugProfil, markeAusVin, normMotorcode } from './wartung';
import type { Antrieb, FahrzeugFelder, Getriebe, Steuertrieb } from '../types';

/* ── VIN → vehicle data ──
   A VIN is WMI (1–3, manufacturer) · VDS (4–9) · VIS (10–17, 10 = model year).
   The VDS is manufacturer-coded; for European cars it rarely holds more than
   the model line. Two sources, merged:
   - local rules: WMI → Marke, VAG model code (7–8), Mercedes Baureihe (4–6);
   - NHTSA vPIC (public, CORS-enabled): complete for US-market VINs, often only
     Marke / Modell for European ones.
   The Motorkennbuchstabe is not part of a European VIN; it comes from the
   Fahrzeugausweis / Datenträger. What couldn't be resolved is reported. */

export const vinGueltig = (vin?: string): string | undefined =>
  (vin ?? '').replace(/\s/g, '').toUpperCase().match(/^[A-HJ-NPR-Z0-9]{17}$/)?.[0];

/** VAG model codes (VIN chars 7–8) → Modell (Typ). */
const VAG_MODELL: Record<string, Record<string, string>> = {
  audi: {
    '8P': 'A3 (8P)', '8V': 'A3 (8V)', '8Y': 'A3 (8Y)', '8K': 'A4 (B8)', '8W': 'A4 (B9)', '8T': 'A5 (8T)', '8F': 'A5 Cabriolet (8F)',
    'F5': 'A5 (F5)', '4F': 'A6 (C6)', '4G': 'A6 (C7)', '4A': 'A6 (C8)', '4H': 'A8 (D4)', '8U': 'Q3 (8U)', 'F3': 'Q3 (F3)',
    '8R': 'Q5 (8R)', 'FY': 'Q5 (FY)', '4L': 'Q7 (4L)', '4M': 'Q7 (4M)', '8J': 'TT (8J)', 'FV': 'TT (FV)', 'GE': 'e-tron (GE)',
  },
  vw: {
    '1J': 'Golf IV', '1K': 'Golf V', '5K': 'Golf VI', 'AU': 'Golf VII', '5G': 'Golf VII', 'CD': 'Golf VIII', '9N': 'Polo (9N)',
    '6R': 'Polo (6R)', 'AW': 'Polo (AW)', '3C': 'Passat (B6/B7)', '3G': 'Passat (B8)', '5N': 'Tiguan (5N)', 'AD': 'Tiguan (AD)',
    '1T': 'Touran (1T)', '5T': 'Touran (5T)', '7L': 'Touareg (7L)', '7P': 'Touareg (7P)', 'CR': 'Touareg (CR)', '7H': 'Transporter T5',
    '7J': 'Transporter T5', '2K': 'Caddy (2K)', 'AA': 'up!', '13': 'Scirocco', 'E1': 'ID.3', 'E2': 'ID.4',
  },
  skoda: {
    '1Z': 'Octavia II', '5E': 'Octavia III', 'NX': 'Octavia IV', '3T': 'Superb II', '3V': 'Superb III', '5J': 'Fabia II',
    'NJ': 'Fabia III', '5L': 'Yeti', 'NS': 'Kodiaq', 'NU': 'Karoq', 'NW': 'Scala', 'NH': 'Rapid', 'NY': 'Enyaq',
  },
  seat: { '1P': 'Leon (1P)', '5F': 'Leon (5F)', 'KL': 'Leon (KL)', '6J': 'Ibiza (6J)', 'KJ': 'Ibiza (KJ)', '5P': 'Altea', 'KH': 'Ateca' },
};

/** Mercedes Baureihe (VIN chars 4–6) → Modell. */
const MB_BAUREIHE: Record<string, string> = {
  '169': 'A-Klasse (W169)', '176': 'A-Klasse (W176)', '177': 'A-Klasse (W177)', '245': 'B-Klasse (W245)', '246': 'B-Klasse (W246)',
  '247': 'B-Klasse (W247)', '117': 'CLA (C117)', '118': 'CLA (C118)', '156': 'GLA (X156)', '203': 'C-Klasse (W203)',
  '204': 'C-Klasse (W204)', '205': 'C-Klasse (W205)', '206': 'C-Klasse (W206)', '211': 'E-Klasse (W211)', '212': 'E-Klasse (W212)',
  '213': 'E-Klasse (W213)', '214': 'E-Klasse (W214)', '221': 'S-Klasse (W221)', '222': 'S-Klasse (W222)', '223': 'S-Klasse (W223)',
  '253': 'GLC (X253)', '254': 'GLC (X254)', '166': 'GLE/ML (W166)', '167': 'GLE (V167)', '447': 'V-Klasse / Vito (447)',
  '639': 'Viano / Vito (639)', '906': 'Sprinter (906)', '907': 'Sprinter (907)', '910': 'Sprinter (910)',
};

function lokal(vin: string): Partial<FahrzeugFelder> {
  const marke = markeAusVin(vin);
  const out: Partial<FahrzeugFelder> = marke ? { marke } : {};
  const m = (marke ?? '').toLowerCase();
  if (m === 'mercedes') {
    const r = MB_BAUREIHE[vin.slice(3, 6)];
    if (r) out.modell = r;
  } else {
    const r = VAG_MODELL[m]?.[vin.slice(6, 8)];
    if (r) out.modell = r;
  }
  return out;
}

/** vPIC "DecodeVinValues" fields used here (all strings, '' when unknown). */
interface Vpic {
  Make?: string; Model?: string; Series?: string; FuelTypePrimary?: string; FuelTypeSecondary?: string; ElectrificationLevel?: string;
  TransmissionStyle?: string; DisplacementL?: string; EngineKW?: string; EngineHP?: string; EngineModel?: string; ModelYear?: string;
}

const titel = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

function antriebVon(r: Vpic): Antrieb | undefined {
  const el = (r.ElectrificationLevel ?? '').toLowerCase();
  const fuel = `${r.FuelTypePrimary ?? ''} ${r.FuelTypeSecondary ?? ''}`.toLowerCase();
  if (el.includes('phev') || el.includes('plug-in')) return 'plugin';
  if (el.includes('bev') || fuel.trim() === 'electric') return 'elektro';
  if (el.includes('hev')) return 'hybrid';
  if (fuel.includes('diesel')) return 'diesel';
  if (fuel.includes('natural gas') || fuel.includes('cng')) return 'gas';
  if (fuel.includes('gasoline') || fuel.includes('petrol')) return 'benzin';
  return undefined;
}

function getriebeVon(r: Vpic): Getriebe | undefined {
  const t = (r.TransmissionStyle ?? '').toLowerCase();
  if (t.includes('dual-clutch') || t.includes('dct')) return 'dsg';
  if (t.includes('continuously') || t.includes('cvt')) return 'cvt';
  if (t.includes('manual')) return 'manuell';
  if (t.includes('automatic')) return 'automat';
  return undefined;
}

/** "2.0 l · 155 kW (211 PS)" */
function motorVon(r: Vpic): string | undefined {
  const l = parseFloat(r.DisplacementL ?? '');
  const kw = parseFloat(r.EngineKW ?? '') || (parseFloat(r.EngineHP ?? '') ? parseFloat(r.EngineHP!) * 0.7457 : NaN);
  const teile = [
    Number.isFinite(l) && l > 0 ? `${l.toFixed(1)} l` : '',
    Number.isFinite(kw) && kw > 0 ? `${Math.round(kw)} kW (${Math.round(kw * 1.36)} PS)` : '',
  ].filter(Boolean);
  return teile.length ? teile.join(' · ') : undefined;
}

async function vpic(vin: string, signal?: AbortSignal): Promise<Vpic | null> {
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json() as { Results?: Vpic[] };
  return j.Results?.[0] ?? null;
}

export interface VinErgebnis {
  /** Resolved fields (only non-empty ones). */
  felder: Partial<FahrzeugFelder>;
  /** Model year as decoded by vPIC (not the 1. Inverkehrsetzung). */
  modelljahr?: number;
  /** Fields the VIN didn't resolve, e.g. "Motorkennbuchstabe". */
  offen: string[];
  /** The online lookup failed (offline, blocked): only local rules were used. */
  offline?: boolean;
}

const FELD_LABEL: Partial<Record<keyof FahrzeugFelder, string>> = {
  marke: 'Marke', modell: 'Modell', antrieb: 'Antrieb', getriebe: 'Getriebe', motor: 'Motor', motorcode: 'Motorkennbuchstabe', steuertrieb: 'Steuertrieb',
};

/** Decodes a VIN: local rules first, NHTSA vPIC for the rest. Throws only for an invalid VIN. */
export async function vinAbrufen(eingabe: string, signal?: AbortSignal): Promise<VinErgebnis> {
  const vin = vinGueltig(eingabe);
  if (!vin) throw new Error('Ungültige VIN (17 Zeichen, ohne I, O, Q)');
  const felder: Partial<FahrzeugFelder> = lokal(vin);
  let offline = false;
  let modelljahr: number | undefined;

  try {
    const r = await vpic(vin, signal);
    if (r) {
      // Only what vPIC confirms: many European makers don't encode the year in char 10.
      modelljahr = parseInt(r.ModelYear ?? '', 10) || undefined;
      if (!felder.marke && r.Make) felder.marke = titel(r.Make);
      if (r.Model) felder.modell = felder.modell ?? [r.Model, r.Series].filter(Boolean).join(' ');
      const a = antriebVon(r); if (a) felder.antrieb = a;
      const g = getriebeVon(r); if (g) felder.getriebe = g;
      const m = motorVon(r); if (m) felder.motor = m;
      // Only a code-like EngineModel ("CDNC", "K24Z7"), not a description ("EA888 Gen3").
      const code = (r.EngineModel ?? '').trim();
      if (/^[A-Z0-9]{3,8}$/.test(code) && /[A-Z]/.test(code)) felder.motorcode = code;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    offline = true;
  }

  // Steuertrieb only when an engine family settles it, not assumed from the Marke.
  const p = fahrzeugProfil({ ...felder, chassisnummer: vin });
  if (p.steuertriebQuelle === 'motor' && p.steuertrieb) felder.steuertrieb = p.steuertrieb as Steuertrieb;
  if (felder.motorcode) felder.motorcode = normMotorcode(felder.motorcode);

  // An EV has neither Motorkennbuchstabe-based intervals nor a Steuertrieb.
  const irrelevant = p.antrieb === 'elektro' ? ['motorcode', 'steuertrieb'] : [];
  const offen = (Object.keys(FELD_LABEL) as (keyof FahrzeugFelder)[])
    .filter((k) => !felder[k] && !irrelevant.includes(k)).map((k) => FELD_LABEL[k]!);
  return { felder, modelljahr, offen, offline };
}
