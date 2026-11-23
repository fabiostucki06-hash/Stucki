import { markeAusVin, motorfamilieAusCode, normMotorcode } from './wartung';
import { SUPA_KEY, SUPA_URL, getFreshToken } from './supabase';
import { motorVarianten, type VinVariante } from './motorkatalog';
import { vdsModell, vdsModellVorschlag } from '../../supabase/functions/vin-decode/vds';
import type { Antrieb, FahrzeugFelder, Getriebe } from '../types';

/* ── VIN → vehicle data ──
   A VIN is WMI (1–3, manufacturer) · VDS (4–9) · VIS (10–17, 10 = model year).
   Resolved server-side by the Edge Function vin-decode (supabase/functions),
   with a browser fallback (WMI / VDS tables, NHTSA vPIC) when it isn't reachable.

   Strict rule: `felder` holds only what the VIN or a decoder states for this
   vehicle. Everything else stays empty and is reported in `offen`:
   - Marke from the WMI, Modell from a VDS layout that is fixed for the make;
   - Antrieb, Getriebe, Motor, Motorkennbuchstabe from a decoder's clean answer;
   - Steuertrieb only from a delivered Motorkennbuchstabe of a documented family;
   - 1. Inverkehrsetzung never: a VIN holds at most the model year.
   AI research and the Motorkatalog only produce suggestions (`varianten`,
   `modellVorschlag`), which the user has to pick. */

export const vinGueltig = (vin?: string): string | undefined =>
  (vin ?? '').replace(/\s/g, '').toUpperCase().match(/^[A-HJ-NPR-Z0-9]{17}$/)?.[0];

function lokal(vin: string): Partial<FahrzeugFelder> {
  const marke = markeAusVin(vin);
  const modell = vdsModell(marke, vin);
  return { ...(marke ? { marke } : {}), ...(modell ? { modell } : {}) };
}

/** vPIC "DecodeVinValues" fields used here (all strings, '' when unknown). */
interface Vpic {
  ErrorCode?: string; Make?: string; Model?: string; Series?: string; FuelTypePrimary?: string; FuelTypeSecondary?: string; ElectrificationLevel?: string;
  TransmissionStyle?: string; DisplacementL?: string; EngineKW?: string; EngineHP?: string; EngineModel?: string; ModelYear?: string;
}

const titel = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

function antriebVon(r: Vpic): Antrieb | undefined {
  const el = (r.ElectrificationLevel ?? '').toLowerCase();
  const fuel = (r.FuelTypePrimary ?? '').toLowerCase().trim();
  if (el.includes('phev') || el.includes('plug-in')) return 'plugin';
  if (el.includes('bev') || fuel === 'electric') return 'elektro';
  if (el.includes('hev')) return 'hybrid';
  // A secondary electric fuel without an electrification level doesn't say which hybrid it is.
  if ((r.FuelTypeSecondary ?? '').toLowerCase().includes('electric')) return undefined;
  if (fuel.includes('diesel')) return 'diesel';
  if (fuel.includes('natural gas') || fuel.includes('cng')) return 'gas';
  if (fuel.includes('gasoline') || fuel.includes('petrol')) return 'benzin';
  return undefined;
}

function getriebeVon(r: Vpic): Getriebe | undefined {
  const t = (r.TransmissionStyle ?? '').toLowerCase();
  if (t.includes('automated manual') || /\bamt\b/.test(t)) return undefined;
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
  motorEindeutig: boolean;
  varianten: VinVariante[];
  modellVorschlag?: string;
  hinweis?: string;
  quellen: string[];
}

export interface VinErgebnis {
  /** Reliably resolved fields (only non-empty ones). */
  felder: Partial<FahrzeugFelder>;
  /** Model year (not the 1. Inverkehrsetzung). */
  modelljahr?: number;
  /** Unconfirmed engine variants to pick from. */
  varianten: VinVariante[];
  /** Unconfirmed model name to take over on request. */
  modellVorschlag?: string;
  /** Fields that could not be resolved reliably. */
  offen: (keyof FahrzeugFelder)[];
  /** Sources that contributed to `felder`. */
  quellen: string[];
  /** Served from vin_cache. */
  cache?: boolean;
  hinweis?: string;
  /** The server lookup failed (offline, blocked): only the local fallback was used. */
  offline?: boolean;
}

const VIN_FELDER: (keyof FahrzeugFelder)[] = ['marke', 'modell', 'antrieb', 'getriebe', 'motor', 'motorcode', 'steuertrieb', 'erstzulassung'];

/** Motorkennbuchstabe normalised, Steuertrieb from its documented family; returns the open fields. */
function abschliessen(felder: Partial<FahrzeugFelder>): (keyof FahrzeugFelder)[] {
  if (felder.motorcode) felder.motorcode = normMotorcode(felder.motorcode);
  if (!felder.steuertrieb && felder.antrieb !== 'elektro') {
    const familie = motorfamilieAusCode(felder.marke, felder.motorcode);
    if (familie) felder.steuertrieb = familie.steuertrieb;
  }
  // An EV has neither a Motorkennbuchstabe-based schedule nor a Steuertrieb.
  const irrelevant: (keyof FahrzeugFelder)[] = felder.antrieb === 'elektro' ? ['motorcode', 'steuertrieb'] : [];
  return VIN_FELDER.filter((k) => !felder[k] && !irrelevant.includes(k));
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
  const quellen: string[] = [];
  let modelljahr: number | undefined;
  try {
    const r = await vpic(vin, signal);
    if (r) {
      if (!felder.marke && r.Make) felder.marke = titel(r.Make);
      // ErrorCode 0 alone = decoded cleanly. Anything else (typical for European VINs): only the Make counts.
      if ((r.ErrorCode ?? '').split(',').every((c) => c.trim() === '0')) {
        quellen.push('NHTSA vPIC');
        modelljahr = parseInt(r.ModelYear ?? '', 10) || undefined;
        if (r.Model) felder.modell = felder.modell ?? [r.Model, r.Series].filter(Boolean).join(' ');
        const a = antriebVon(r); if (a) felder.antrieb = a;
        const g = getriebeVon(r); if (g) felder.getriebe = g;
        const m = motorVon(r); if (m) felder.motor = m;
        // Only a code-like EngineModel ("CDNC", "K24Z7"), not a description ("EA888 Gen3").
        const code = (r.EngineModel ?? '').trim();
        if (/^[A-Z0-9]{3,8}$/.test(code) && /\d/.test(code)) felder.motorcode = code;
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  const varianten = katalog(felder, modelljahr);
  const modellVorschlag = felder.modell ? undefined : vdsModellVorschlag(felder.marke, vin);
  return { felder, modelljahr, varianten, modellVorschlag, offen: abschliessen(felder), quellen, offline: true };
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
    felder, modelljahr: e.modelljahr, varianten, modellVorschlag: e.modellVorschlag, offen: abschliessen(felder),
    // The AI research only yields suggestions, so it isn't a source of the entered data.
    quellen: (e.quellen ?? []).filter((q) => q !== 'KI-Recherche (Web)'), cache, hinweis: e.hinweis,
  };
}
