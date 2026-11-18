import { fahrzeugProfil, markeAusVin, normMotorcode } from './wartung';
import { SUPA_KEY, SUPA_URL, getFreshToken } from './supabase';
import { motorVarianten, type VinVariante } from './motorkatalog';
import { vdsModell } from '../../supabase/functions/vin-decode/vds';
import type { Antrieb, FahrzeugFelder, Getriebe, Steuertrieb } from '../types';

/* ── VIN → vehicle data ──
   A VIN is WMI (1–3, manufacturer) · VDS (4–9) · VIS (10–17, 10 = model year).
   Resolved server-side by the Edge Function vin-decode (supabase/functions):
   ISO 3779 parse with built-in VDS model tables (vds.ts) and the free NHTSA
   vPIC; optional commercial decoders and an AI lookup only when their keys are
   configured. Cached per VIN pattern in vin_cache. Where the VIN doesn't encode
   the engine (most European / Asian VINs), the factory engine variants of the
   model come from the built-in Motorkatalog (or the AI lookup) to pick from.
   When the function isn't reachable, a local fallback runs in the browser:
   - local rules: WMI → Marke, VDS → Modell (same tables, vds.ts);
   - NHTSA vPIC (public, CORS-enabled): complete for US-market VINs, often only
     Marke / Modell for European ones.
   What couldn't be resolved is reported. */

export const vinGueltig = (vin?: string): string | undefined =>
  (vin ?? '').replace(/\s/g, '').toUpperCase().match(/^[A-HJ-NPR-Z0-9]{17}$/)?.[0];

function lokal(vin: string): Partial<FahrzeugFelder> {
  const marke = markeAusVin(vin);
  const modell = vdsModell(marke, vin);
  return { ...(marke ? { marke } : {}), ...(modell ? { modell } : {}) };
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

export type { VinVariante };

/** Result of the Edge Function vin-decode (mirrors Ergebnis there). */
interface VinServerErgebnis {
  felder: Partial<FahrzeugFelder>;
  modelljahr?: number;
  generation?: string;
  motorEindeutig: boolean;
  varianten: VinVariante[];
  sicherheit?: 'hoch' | 'mittel' | 'niedrig';
  hinweis?: string;
  quellen: string[];
}

export interface VinErgebnis {
  /** Resolved fields (only non-empty ones). */
  felder: Partial<FahrzeugFelder>;
  /** Model year (not the 1. Inverkehrsetzung). */
  modelljahr?: number;
  /** Generation / platform, e.g. "5G, 2012–2020". */
  generation?: string;
  /** Engine variants to pick from when the VIN doesn't settle the engine. */
  varianten: VinVariante[];
  /** Fields the VIN didn't resolve, e.g. "Motorkennbuchstabe". */
  offen: string[];
  /** Where the data comes from, e.g. ["ISO 3779", "NHTSA vPIC", "KI-Recherche (Web)"]. */
  quellen: string[];
  /** Served from vin_cache. */
  cache?: boolean;
  hinweis?: string;
  sicherheit?: 'hoch' | 'mittel' | 'niedrig';
  /** The server lookup failed (offline, blocked): only the local fallback was used. */
  offline?: boolean;
}

const FELD_LABEL: Partial<Record<keyof FahrzeugFelder, string>> = {
  marke: 'Marke', modell: 'Modell', antrieb: 'Antrieb', getriebe: 'Getriebe', motor: 'Motor', motorcode: 'Motorkennbuchstabe', steuertrieb: 'Steuertrieb',
};

/** Steuertrieb from a documented engine family, Motorkennbuchstabe normalised; returns the open fields. */
function abschliessen(vin: string, felder: Partial<FahrzeugFelder>, varianten: VinVariante[]): string[] {
  const p = fahrzeugProfil({ ...felder, chassisnummer: vin });
  if (!felder.steuertrieb && p.steuertriebQuelle === 'motor' && p.steuertrieb) felder.steuertrieb = p.steuertrieb as Steuertrieb;
  if (felder.motorcode) felder.motorcode = normMotorcode(felder.motorcode);
  // An EV has neither Motorkennbuchstabe-based intervals nor a Steuertrieb; picking a variant fills the engine fields.
  const irrelevant: (keyof FahrzeugFelder)[] = p.antrieb === 'elektro' ? ['motorcode', 'steuertrieb'] : [];
  if (varianten.length) irrelevant.push('antrieb', 'getriebe', 'motor', 'motorcode', 'steuertrieb');
  return (Object.keys(FELD_LABEL) as (keyof FahrzeugFelder)[])
    .filter((k) => !felder[k] && !irrelevant.includes(k)).map((k) => FELD_LABEL[k]!);
}

/** Built-in engine variants when the engine is still open; an electric model is settled by its single entry. */
function katalog(felder: Partial<FahrzeugFelder>, modelljahr?: number): VinVariante[] {
  if (felder.motor || felder.motorcode) return [];
  const liste = motorVarianten(felder.marke, felder.modell, modelljahr);
  if (liste.length === 1 && liste[0].antrieb === 'elektro') { felder.antrieb = 'elektro'; return []; }
  return liste;
}

async function server(vin: string, signal?: AbortSignal): Promise<{ ergebnis: VinServerErgebnis; cache: boolean }> {
  const token = await getFreshToken();
  if (!token) throw new Error('Nicht angemeldet');
  const r = await fetch(`${SUPA_URL}/functions/v1/vin-decode`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ vin }),
  });
  const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; quelle?: string; ergebnis?: VinServerErgebnis };
  if (!r.ok || !j.ok || !j.ergebnis) throw new Error(j.error || `HTTP ${r.status}`);
  return { ergebnis: j.ergebnis, cache: j.quelle === 'cache' };
}

/** Local fallback: WMI / VDS rules and NHTSA vPIC from the browser. */
async function lokalAbrufen(vin: string, signal?: AbortSignal): Promise<VinErgebnis> {
  const felder: Partial<FahrzeugFelder> = lokal(vin);
  const quellen = ['ISO 3779'];
  let modelljahr: number | undefined;
  try {
    const r = await vpic(vin, signal);
    if (r) {
      quellen.push('NHTSA vPIC');
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
  }
  const varianten = katalog(felder, modelljahr);
  return { felder, modelljahr, varianten, offen: abschliessen(vin, felder, varianten), quellen, offline: true };
}

/** Decodes any valid VIN via the Edge Function, else locally. Throws only for an invalid VIN. */
export async function vinAbrufen(eingabe: string, signal?: AbortSignal): Promise<VinErgebnis> {
  const vin = vinGueltig(eingabe);
  if (!vin) throw new Error('Ungültige VIN (17 Zeichen, ohne I, O, Q)');
  let antwort: Awaited<ReturnType<typeof server>>;
  try {
    antwort = await server(vin, signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return lokalAbrufen(vin, signal);
  }
  const { ergebnis: e, cache } = antwort;
  const felder: Partial<FahrzeugFelder> = {};
  for (const [k, v] of Object.entries(e.felder) as [keyof FahrzeugFelder, string][]) if (v) (felder as Record<string, string>)[k] = v;
  const varianten = e.motorEindeutig ? [] : e.varianten?.length ? e.varianten : katalog(felder, e.modelljahr);
  return {
    felder, modelljahr: e.modelljahr, generation: e.generation, varianten, offen: abschliessen(vin, felder, varianten),
    quellen: e.quellen ?? [], cache, hinweis: e.hinweis, sicherheit: e.sicherheit,
  };
}
