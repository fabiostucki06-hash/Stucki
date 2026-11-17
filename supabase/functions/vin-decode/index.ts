// Supabase Edge Function: universal VIN resolution for the vehicle form.
//   POST /functions/v1/vin-decode  { vin }  → { ok: true, quelle: 'cache' | 'neu', ergebnis: VinServerErgebnis }
//   Authorization: Bearer <access token of a signed-in user>
//
// Pipeline for any 17-character ISO 3779 VIN (src/lib/vin.ts consumes the result):
//   1. ISO 3779 parse: WMI (1–3) → Marke / Region / Land, VDS (4–9), check digit (9),
//      model year (10, 30-year cycle; North-American position-7 rule), plant (11).
//   2. Lookups in parallel: NHTSA vPIC (always) and the commercial decoders whose
//      keys are set (VINCARIO_API_KEY + VINCARIO_SECRET_KEY, AUTODEV_API_KEY,
//      CARAPI_TOKEN). Then Claude with web search (ANTHROPIC_API_KEY) resolves
//      Marke, Modell, Generation, Jahr and, where the VIN settles it, the engine.
//   3. When the VIN doesn't encode the engine (most European / Asian VINs, e.g.
//      "ZZZ" filler in the VDS), the factory engine variants of that model and
//      year are returned as `varianten`, which the form offers as one-tap chips.
// Results are cached per pattern (VIN chars 1–8 + 10) in public.vin_cache.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) || undefined;
const MODEL = 'claude-opus-5-5';
/** Bump when the result shape or prompt changes: older cache rows are resolved again. */
const VERSION = 2;

type Antrieb = 'benzin' | 'diesel' | 'hybrid' | 'plugin' | 'elektro' | 'gas';
type Getriebe = 'manuell' | 'automat' | 'dsg' | 'cvt';
type Steuertrieb = 'zahnriemen' | 'kette';

interface Felder {
  marke?: string; modell?: string; antrieb?: Antrieb; getriebe?: Getriebe;
  motor?: string; motorcode?: string; steuertrieb?: Steuertrieb;
}
interface Variante {
  motor: string; motorcode: string; antrieb: Antrieb | ''; getriebe: Getriebe | ''; steuertrieb: Steuertrieb | ''; hinweis: string;
}
/** Mirrors VinServerErgebnis in src/lib/vin.ts. */
interface Ergebnis {
  version: number;
  felder: Felder;
  modelljahr?: number;
  generation?: string;
  region?: string;
  land?: string;
  pruefziffer: 'ok' | 'falsch';
  /** The VIN settles the engine; otherwise pick one of `varianten`. */
  motorEindeutig: boolean;
  varianten: Variante[];
  sicherheit?: 'hoch' | 'mittel' | 'niedrig';
  hinweis?: string;
  quellen: string[];
}

/* ── 1. ISO 3779 ── */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/** WMI → Marke. 3-character WMIs first, then 2-character prefixes. */
const WMI3: Record<string, string> = Object.fromEntries(`
WVW VW,WV1 VW,WV2 VW,WV3 VW,WVG VW,1VW VW,3VW VW,9BW VW,AAV VW,LSV VW,LFV VW,
WAU Audi,WA1 Audi,WUA Audi,TRU Audi,TMB Skoda,VSS Seat,VSE Seat,
WBA BMW,WBS BMW,WBY BMW,WBX BMW,5UX BMW,5YM BMW,4US BMW,WMW Mini,WMZ Mini,
WDB Mercedes,WDD Mercedes,WDC Mercedes,WDF Mercedes,W1K Mercedes,W1N Mercedes,W1V Mercedes,W1W Mercedes,W1T Mercedes,4JG Mercedes,55S Mercedes,WME Smart,
WP0 Porsche,WP1 Porsche,YV1 Volvo,YV4 Volvo,YV2 Volvo,LYV Volvo,7JR Volvo,LPS Polestar,YSM Polestar,
WF0 Ford,WF1 Ford,1FA Ford,1FT Ford,1FM Ford,1FD Ford,2FM Ford,3FA Ford,NM0 Ford,MAJ Ford,
VF3 Peugeot,VR3 Peugeot,VF7 Citroen,VR7 Citroen,VR1 DS,W0L Opel,W0V Opel,W0X Opel,VXK Opel,VXE Opel,
ZFA Fiat,ZFB Fiat,ZFC Fiat,ZAR Alfa Romeo,ZLA Lancia,ZAC Jeep,1C4 Jeep,1J4 Jeep,1J8 Jeep,3C4 Chrysler,2C3 Chrysler,1C3 Chrysler,2C4 Chrysler,1C6 Ram,3C6 Ram,1D7 Dodge,2B3 Dodge,
ZFF Ferrari,ZHW Lamborghini,ZAM Maserati,SCF Aston Martin,SCC Lotus,SBM McLaren,SCB Bentley,SCA Rolls-Royce,
VF1 Renault,VF2 Renault,VF6 Renault,UU1 Dacia,VGA Alpine,
JTD Toyota,JTE Toyota,JTH Lexus,JTJ Lexus,JTM Toyota,JTN Toyota,JTK Toyota,JT2 Toyota,JT3 Toyota,SB1 Toyota,NMT Toyota,VNK Toyota,4T1 Toyota,4T3 Toyota,5TD Toyota,5TF Toyota,2T1 Toyota,2T3 Toyota,
JHM Honda,JHL Honda,SHH Honda,SHS Honda,1HG Honda,2HG Honda,5FN Honda,5J6 Honda,19X Honda,JH4 Acura,19U Acura,
JMZ Mazda,JM1 Mazda,JM3 Mazda,1YV Mazda,
KMH Hyundai,KM8 Hyundai,TMA Hyundai,NLH Hyundai,5NP Hyundai,5NM Hyundai,MAL Hyundai,KMT Genesis,
KNA Kia,KND Kia,KNE Kia,U5Y Kia,U6Y Kia,5XY Kia,5XX Kia,
JN1 Nissan,JN8 Nissan,SJN Nissan,VSK Nissan,1N4 Nissan,1N6 Nissan,5N1 Nissan,3N1 Nissan,JNK Infiniti,
JF1 Subaru,JF2 Subaru,4S3 Subaru,4S4 Subaru,TSM Suzuki,JS2 Suzuki,JS3 Suzuki,JSA Suzuki,MA3 Suzuki,
JA3 Mitsubishi,JA4 Mitsubishi,JMB Mitsubishi,JMY Mitsubishi,MMB Mitsubishi,MMC Mitsubishi,
SAL Land Rover,SAJ Jaguar,SAD Jaguar,SAR Rover,
5YJ Tesla,7SA Tesla,LRW Tesla,XP7 Tesla,
1G1 Chevrolet,1GC Chevrolet,1GN Chevrolet,2G1 Chevrolet,3GN Chevrolet,KL1 Chevrolet,KLA Chevrolet,1G6 Cadillac,1GY Cadillac,1GT GMC,1GK GMC,1G4 Buick,LRB Buick,
LVS Ford,LVG Toyota,LFM Toyota,LHG Honda,LBV BMW,LE4 Mercedes,LJ1 JAC,LGX BYD,LC0 BYD,LGW Great Wall,LVV Chery,LB3 Geely,L6T Geely,LSJ MG,SDP MG,LNB Nio,LDP Voyah,LZW SAIC-GM-Wuling,
MA1 Mahindra,MAT Tata,SAT Tata,MBH Suzuki,MCA Fiat,
VSX Opel,VS6 Ford,VS7 Citroen,VWV VW,VSA Mercedes,
TMP Skoda,TNE Tatra,TK9 SOR,U5Z Kia,
XTA Lada,XW8 VW,X4X BMW,Z94 Hyundai,
WMA MAN,WMX Mercedes,WDA Mercedes,XLR DAF,YS2 Scania,YB1 Volvo Trucks,ZCF Iveco,
WKK Kässbohrer,WJM Iveco,NMB Mercedes,JAA Isuzu,JAL Isuzu,MPA Isuzu,
ZDM Ducati,ZD4 Aprilia,ZAP Piaggio,WB1 BMW Motorrad,JYA Yamaha,JKA Kawasaki,JH2 Honda Motorrad,JS1 Suzuki Motorrad,VBK KTM,SMT Triumph,1HD Harley-Davidson
`.trim().split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => [s.slice(0, s.indexOf(' ')), s.slice(s.indexOf(' ') + 1)]));
const WMI2: Record<string, string> = { JT: 'Toyota', JS: 'Suzuki', JH: 'Honda', JN: 'Nissan', KM: 'Hyundai', KN: 'Kia', SA: 'Land Rover / Jaguar', WD: 'Mercedes', WB: 'BMW', WV: 'VW', ZF: 'Fiat', VF: 'PSA / Renault' };

/** First VIN character → region; first two → country (ISO 3780 blocks, abridged). */
function herkunft(vin: string): { region: string; land?: string } {
  const c = vin[0], cc = vin.slice(0, 2);
  const LAND: [RegExp, string][] = [
    [/^W/, 'Deutschland'], [/^Z[A-R]/, 'Italien'], [/^V[F-R]/, 'Frankreich'], [/^V[S-W]/, 'Spanien'], [/^V[A-E]/, 'Österreich'],
    [/^S[A-M]/, 'Grossbritannien'], [/^S[N-T]/, 'Deutschland (DDR)'], [/^S[U-Z]/, 'Polen'], [/^T[A-H]/, 'Schweiz'], [/^T[J-P]/, 'Tschechien'],
    [/^T[R-V]/, 'Ungarn'], [/^T[W-Z1]/, 'Portugal'], [/^U[H-M]/, 'Dänemark'], [/^U[N-T]/, 'Irland'], [/^U[U-Z]/, 'Rumänien'], [/^U[5-7]/, 'Slowakei'],
    [/^V[X-Z1-2]/, 'Frankreich / Serbien'], [/^V[3-5]/, 'Kroatien'], [/^X[A-E]/, 'Bulgarien'], [/^X[L-R]/, 'Niederlande'], [/^X[S-W3-9]/, 'Russland'],
    [/^Y[A-E]/, 'Belgien'], [/^Y[F-K]/, 'Finnland'], [/^Y[S-W]/, 'Schweden'], [/^Y[3-5]/, 'Weissrussland'], [/^Z[X-Z1-2]/, 'Slowenien'],
    [/^J/, 'Japan'], [/^K[L-R]/, 'Südkorea'], [/^L/, 'China'], [/^M[A-E]/, 'Indien'], [/^M[F-K]/, 'Indonesien'], [/^M[L-R]/, 'Thailand'],
    [/^N[L-R]/, 'Türkei'], [/^P[A-E]/, 'Philippinen'], [/^P[L-R]/, 'Malaysia'], [/^R[F-K]/, 'Taiwan'], [/^A[A-H]/, 'Südafrika'],
    [/^[1457]/, 'USA'], [/^2/, 'Kanada'], [/^3[A-W]/, 'Mexiko'], [/^3[X-Z1-7]/, 'Costa Rica'], [/^6/, 'Australien'], [/^7[A-E]/, 'Neuseeland'],
    [/^8[A-E]/, 'Argentinien'], [/^9[A-E3-9]/, 'Brasilien'],
  ];
  const land = LAND.find(([re]) => re.test(cc))?.[1];
  const region = /[A-H]/.test(c) ? 'Afrika' : /[J-R]/.test(c) ? 'Asien' : /[S-Z]/.test(c) ? 'Europa'
    : /[1-5]/.test(c) ? 'Nordamerika' : /[67]/.test(c) ? 'Ozeanien' : 'Südamerika';
  return { region, land };
}

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const GEWICHT = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
/** ISO 3779 / 49 CFR 565 check digit (position 9). Mandatory in North America only. */
function pruefzifferOk(vin: string): boolean {
  const sum = [...vin].reduce((s, ch, i) => s + (/\d/.test(ch) ? +ch : TRANSLIT[ch] ?? 0) * GEWICHT[i], 0);
  const r = sum % 11;
  return vin[8] === (r === 10 ? 'X' : String(r));
}

const JAHR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
/** Model year (position 10). North American VINs: position 7 a letter → 2010–2039, a digit → 1980–2009.
    Elsewhere: the latest year of the 30-year cycle not after next year. */
function modelljahrAusVin(vin: string, jetzt = new Date().getFullYear()): number | undefined {
  const i = JAHR_CODES.indexOf(vin[9]);
  if (i < 0) return undefined;
  const basis = 1980 + i;
  if (/[1-5]/.test(vin[0])) return /[A-Z]/.test(vin[6]) ? basis + 30 : basis;
  let y = basis;
  while (y + 30 <= jetzt + 1) y += 30;
  return y;
}

/* ── 2. Lookups ── */

/** What a decoder returned, normalised. `roh` (non-empty fields only) goes to Claude as evidence. */
interface Fund { quelle: string; felder: Felder; jahr?: number; roh: Record<string, string> }

const titel = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
const leer = (v: unknown) => v === undefined || v === null || String(v).trim() === '' || /^(not applicable|null|n\/a)$/i.test(String(v).trim());
const sauber = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => !leer(v) && typeof v !== 'object').map(([k, v]) => [k, String(v).trim()]));

function antriebVon(text: string): Antrieb | undefined {
  const t = text.toLowerCase();
  if (/plug-?in|phev/.test(t)) return 'plugin';
  if (/\bbev\b|battery electric|^electric$|\belektro\b/.test(t.trim())) return 'elektro';
  if (/hybrid|hev/.test(t)) return 'hybrid';
  if (/diesel/.test(t)) return 'diesel';
  if (/natural gas|cng|lpg|erdgas/.test(t)) return 'gas';
  if (/gasoline|petrol|benzin|flexible/.test(t)) return 'benzin';
  if (/electric/.test(t)) return 'elektro';
  return undefined;
}
function getriebeVon(text: string): Getriebe | undefined {
  const t = text.toLowerCase();
  if (/dual.?clutch|dct|dsg|s.?tronic|pdk/.test(t)) return 'dsg';
  if (/continuously|cvt/.test(t)) return 'cvt';
  if (/manual|schalt/.test(t)) return 'manuell';
  if (/automat/.test(t)) return 'automat';
  return undefined;
}
function motorText(l?: number, kw?: number, zusatz?: string): string | undefined {
  const teile = [
    l && l > 0 ? `${l.toFixed(1)} l` : '',
    zusatz ?? '',
    kw && kw > 0 ? `${Math.round(kw)} kW (${Math.round(kw * 1.36)} PS)` : '',
  ].filter(Boolean);
  return teile.length ? teile.join(' · ') : undefined;
}
const codeArtig = (s?: string) => !!s && /^[A-Z0-9-]{3,10}$/.test(s.trim()) && /[A-Z]/.test(s) && /\d|^[A-Z]{4}$/.test(s);

async function holen(url: string, init?: RequestInit, ms = 12000): Promise<unknown> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
  return r.json();
}

async function nhtsa(vin: string, jahr?: number): Promise<Fund | null> {
  const j = await holen(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json${jahr ? `&modelyear=${jahr}` : ''}`) as { Results?: Record<string, string>[] };
  const r = j.Results?.[0];
  if (!r) return null;
  const roh = sauber(Object.fromEntries(Object.entries(r).filter(([k]) => !/^(ErrorCode|ErrorText|AdditionalErrorText|SuggestedVIN|PossibleValues|VIN)$/.test(k))));
  roh.Fehler = r.ErrorText ?? '';
  const felder: Felder = {};
  if (r.Make) felder.marke = titel(r.Make);
  if (r.Model) felder.modell = [r.Model, r.Series, r.Trim].filter((x) => !leer(x)).join(' ');
  const el = `${r.ElectrificationLevel ?? ''} ${r.FuelTypePrimary ?? ''} ${r.FuelTypeSecondary ?? ''}`;
  const a = antriebVon(el); if (a) felder.antrieb = a;
  const g = getriebeVon(r.TransmissionStyle ?? ''); if (g) felder.getriebe = g;
  const kw = parseFloat(r.EngineKW) || (parseFloat(r.EngineHP) ? parseFloat(r.EngineHP) * 0.7457 : undefined);
  const m = motorText(parseFloat(r.DisplacementL), kw); if (m) felder.motor = m;
  if (codeArtig(r.EngineModel)) felder.motorcode = r.EngineModel.trim();
  if (Object.keys(roh).length <= 1 && !felder.marke) return null;
  return { quelle: 'NHTSA vPIC', felder, jahr: parseInt(r.ModelYear, 10) || undefined, roh };
}

async function sha1(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vincario (vindecoder.eu), strong for European VINs. */
async function vincario(vin: string): Promise<Fund | null> {
  const key = env('VINCARIO_API_KEY'), secret = env('VINCARIO_SECRET_KEY');
  if (!key || !secret) return null;
  const ctrl = (await sha1(`${vin}|decode|${key}|${secret}`)).slice(0, 10);
  const j = await holen(`https://api.vindecoder.eu/3.2/${key}/${ctrl}/decode/${vin}.json`) as { decode?: { label: string; value: unknown }[] };
  const roh = sauber(Object.fromEntries((j.decode ?? []).map((d) => [d.label, d.value])));
  if (!Object.keys(roh).length) return null;
  const felder: Felder = {};
  if (roh.Make) felder.marke = titel(roh.Make);
  if (roh.Model) felder.modell = roh.Model;
  const a = antriebVon(roh['Fuel Type - Primary'] ?? ''); if (a) felder.antrieb = a;
  const g = getriebeVon(roh.Transmission ?? ''); if (g) felder.getriebe = g;
  const m = motorText(parseFloat(roh['Engine Displacement (ccm)']) / 1000, parseFloat(roh['Engine Power (kW)'])); if (m) felder.motor = m;
  if (codeArtig(roh['Engine Code'])) felder.motorcode = roh['Engine Code'];
  return { quelle: 'Vincario', felder, jahr: parseInt(roh['Model Year'], 10) || undefined, roh };
}

/** Auto.dev VIN decode. */
async function autodev(vin: string): Promise<Fund | null> {
  const key = env('AUTODEV_API_KEY');
  if (!key) return null;
  const j = await holen(`https://api.auto.dev/vin/${vin}`, { headers: { Authorization: `Bearer ${key}` } }) as Record<string, unknown>;
  const flach: Record<string, unknown> = { ...j };
  for (const k of ['engine', 'transmission', 'vehicle', 'make', 'model']) {
    const v = j[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [kk, vv] of Object.entries(v)) flach[`${k}.${kk}`] = vv;
  }
  const roh = sauber(flach);
  if (!Object.keys(roh).length) return null;
  const felder: Felder = {};
  const mk = roh.make ?? roh['make.name'] ?? roh['vehicle.make']; if (mk) felder.marke = titel(mk);
  const md = roh.model ?? roh['model.name'] ?? roh['vehicle.model']; if (md) felder.modell = [md, roh.trim].filter(Boolean).join(' ');
  const a = antriebVon(`${roh['engine.fuelType'] ?? ''} ${roh['engine.type'] ?? ''} ${roh.engine ?? ''}`); if (a) felder.antrieb = a;
  const g = getriebeVon(`${roh['transmission.transmissionType'] ?? ''} ${roh.transmission ?? ''}`); if (g) felder.getriebe = g;
  if (codeArtig(roh['engine.code'])) felder.motorcode = roh['engine.code'];
  return { quelle: 'Auto.dev', felder, jahr: parseInt(roh.year ?? roh['vehicle.year'], 10) || undefined, roh };
}

/** CarAPI (carapi.app) VIN endpoint; CARAPI_TOKEN is the JWT from /api/auth/login. */
async function carapi(vin: string): Promise<Fund | null> {
  const token = env('CARAPI_TOKEN');
  if (!token) return null;
  const j = await holen(`https://carapi.app/api/vin/${vin}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }) as Record<string, unknown>;
  const specs = (j.specs ?? {}) as Record<string, unknown>;
  const roh = sauber({ ...j, ...Object.fromEntries(Object.entries(specs).map(([k, v]) => [`specs.${k}`, v])) });
  if (!Object.keys(roh).length) return null;
  const felder: Felder = {};
  if (roh.make) felder.marke = titel(roh.make);
  if (roh.model) felder.modell = [roh.model, roh.trim].filter(Boolean).join(' ');
  const a = antriebVon(`${roh['specs.fuel_type_primary'] ?? ''} ${roh['specs.electrification_level'] ?? ''}`); if (a) felder.antrieb = a;
  const g = getriebeVon(roh['specs.transmission_style'] ?? ''); if (g) felder.getriebe = g;
  return { quelle: 'CarAPI', felder, jahr: parseInt(roh.year, 10) || undefined, roh };
}

/* ── 3. Claude with web search ── */

const ANTRIEB_ENUM = ['benzin', 'diesel', 'hybrid', 'plugin', 'elektro', 'gas', ''];
const GETRIEBE_ENUM = ['manuell', 'automat', 'dsg', 'cvt', ''];
const STEUERTRIEB_ENUM = ['zahnriemen', 'kette', ''];

const TOOL: Anthropic.Tool = {
  name: 'fahrzeug_melden',
  description: 'Meldet das aus der VIN ermittelte Fahrzeug. Genau einmal aufrufen, wenn die Recherche abgeschlossen ist.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['marke', 'modell', 'generation', 'modelljahr', 'antrieb', 'getriebe', 'motor', 'motorcode', 'steuertrieb', 'motorEindeutig', 'varianten', 'sicherheit', 'hinweis'],
    properties: {
      marke: { type: 'string', description: 'Marke wie im deutschsprachigen Handel, z.B. "VW", "Mercedes", "BMW", "Toyota", "Ford".' },
      modell: { type: 'string', description: 'Modell inkl. Generation/Typ wie in der Werkstatt üblich, z.B. "Golf VII (5G)", "C-Klasse (W205)", "3er (G20)", "Corolla (E21)".' },
      generation: { type: 'string', description: 'Generation/Plattform-Code mit Bauzeit, z.B. "5G, 2012–2020". Leer wenn unbekannt.' },
      modelljahr: { type: 'integer', description: 'Modelljahr; 0 wenn nicht bestimmbar.' },
      antrieb: { type: 'string', enum: ANTRIEB_ENUM, description: 'Nur wenn durch VIN/Daten belegt oder bei allen Varianten gleich, sonst "".' },
      getriebe: { type: 'string', enum: GETRIEBE_ENUM, description: 'Nur wenn belegt oder bei allen Varianten gleich, sonst "".' },
      motor: { type: 'string', description: 'Nur wenn motorEindeutig: z.B. "2.0 TDI · 110 kW (150 PS)". Sonst "".' },
      motorcode: { type: 'string', description: 'Motorkennbuchstabe / Motorcode nur wenn motorEindeutig, z.B. "CRLB", "B47D20", "OM654", "2ZR-FXE". Sonst "".' },
      steuertrieb: { type: 'string', enum: STEUERTRIEB_ENUM, description: 'Nur wenn motorEindeutig und für diesen Motor gesichert, sonst "".' },
      motorEindeutig: { type: 'boolean', description: 'true nur wenn die VIN (bzw. ein Decoder) den genauen Motor festlegt.' },
      varianten: {
        type: 'array',
        description: 'Wenn motorEindeutig false: alle ab Werk lieferbaren Motor-/Getriebe-Varianten genau dieses Modells, dieser Generation und dieses Modelljahrs (europäischer/Schweizer Markt bevorzugt), max. 14. Sonst [].',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['motor', 'motorcode', 'antrieb', 'getriebe', 'steuertrieb', 'hinweis'],
          properties: {
            motor: { type: 'string', description: 'z.B. "1.5 TSI · 110 kW (150 PS)"' },
            motorcode: { type: 'string', description: 'Motorkennbuchstabe(n) dieser Variante, mehrere mit "/" , z.B. "DPCA / DADA". "" wenn unbekannt.' },
            antrieb: { type: 'string', enum: ANTRIEB_ENUM },
            getriebe: { type: 'string', enum: GETRIEBE_ENUM, description: '"" wenn für diese Motorisierung mehrere Getriebe lieferbar waren.' },
            steuertrieb: { type: 'string', enum: STEUERTRIEB_ENUM, description: 'Zahnriemen oder Steuerkette dieses Motors, "" wenn nicht gesichert.' },
            hinweis: { type: 'string', description: 'Kurz, z.B. "nur 4MOTION" oder "ab 2017". Sonst "".' },
          },
        },
      },
      sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
      hinweis: { type: 'string', description: 'Ein kurzer Satz auf Deutsch zur Herleitung oder zu Unsicherheiten, sonst "".' },
    },
  },
};

const SYSTEM = `Du bist ein Fahrzeugdaten-Experte einer Schweizer Autowerkstatt. Du bestimmst aus einer Fahrgestellnummer (VIN, ISO 3779) das genaue Fahrzeug.

Vorgehen:
- Werte die mitgelieferte Struktur-Analyse (WMI, VDS, Modelljahr) und die Decoder-Antworten aus. Bei nordamerikanischen VINs ist NHTSA vPIC verlässlich: übernimm dessen Daten, ausser sie widersprechen sich offensichtlich.
- Recherchiere mit der Websuche gezielt das VIN-Muster: Hersteller-Schlüssel des VDS (z.B. VAG-Typschlüssel Stelle 7–8, Mercedes-Baureihe Stelle 4–6, BMW-Typschlüssel Stelle 4–7, Toyota-Modellcode Stelle 4–8, Hyundai/Kia-Modellcode), Modell, Generation, Bauzeit und die ab Werk lieferbaren Motoren mit Motorcode und Steuertrieb.
- Erfinde nichts. Ein Feld, das nicht belegt ist, bleibt "". Lieber Varianten als ein geratener Motor.
- Viele europäische und asiatische Hersteller codieren den Motor nicht in der VIN (z.B. "ZZZ"-Füllzeichen bei VW/Audi/Skoda/Seat). Dann motorEindeutig = false, motor/motorcode/steuertrieb = "" und alle Werks-Motorisierungen dieses Modells und Modelljahrs als varianten. Antrieb und Getriebe auf oberster Ebene nur setzen, wenn alle Varianten übereinstimmen.
- Steuertrieb (Zahnriemen / Steuerkette) pro Motor nur angeben, wenn für diesen Motor dokumentiert.
- Elektroautos: motorcode und steuertrieb "".
- Melde das Ergebnis am Ende mit dem Werkzeug fahrzeug_melden.`;

interface KiAntwort {
  marke: string; modell: string; generation: string; modelljahr: number; antrieb: Antrieb | ''; getriebe: Getriebe | '';
  motor: string; motorcode: string; steuertrieb: Steuertrieb | ''; motorEindeutig: boolean; varianten: Variante[];
  sicherheit: 'hoch' | 'mittel' | 'niedrig'; hinweis: string;
}

async function kiRecherche(vin: string, analyse: Record<string, unknown>, funde: Fund[]): Promise<KiAntwort | null> {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return null;
  const client = new Anthropic({ apiKey: key, timeout: 110_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: `VIN: ${vin}\n\nStruktur-Analyse:\n${JSON.stringify(analyse, null, 1)}\n\nDecoder-Antworten:\n${
      funde.length ? funde.map((f) => `## ${f.quelle}\n${JSON.stringify(f.roh)}`).join('\n\n') : '(keine)'}`,
  }];
  // Server-side web search can pause a long turn (pause_turn): continue it, at most a few times.
  for (let runde = 0; runde < 4; runde++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, TOOL],
      tool_choice: { type: 'auto' },
      messages,
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    const call = res.content.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
    if (call && call.type === 'tool_use') return call.input as KiAntwort;
    if (res.stop_reason !== 'pause_turn') {
      if (res.stop_reason === 'refusal') return null;
      // Ended without reporting: ask once for the report.
      messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: 'Melde jetzt das Ergebnis mit fahrzeug_melden.' });
      continue;
    }
    messages.push({ role: 'assistant', content: res.content });
  }
  return null;
}

/* ── Merge ── */

function zusammenfuehren(vin: string, funde: Fund[], ki: KiAntwort | null): Ergebnis {
  const { region, land } = herkunft(vin);
  const wmiMarke = WMI3[vin.slice(0, 3)] ?? WMI2[vin.slice(0, 2)];
  const nordamerika = /[1-5]/.test(vin[0]);
  const felder: Felder = {};
  // Decoders in order of trust; a later one only fills what is still empty.
  for (const f of funde) for (const [k, v] of Object.entries(f.felder) as [keyof Felder, string][]) if (v && !felder[k]) (felder as Record<string, string>)[k] = v;
  if (!felder.marke && wmiMarke && !wmiMarke.includes('/')) felder.marke = wmiMarke;

  let varianten: Variante[] = [];
  let motorEindeutig = !!(felder.motorcode || (nordamerika && felder.motor));
  if (ki) {
    if (ki.marke) felder.marke = ki.marke;
    if (ki.modell) felder.modell = ki.modell;
    if (ki.antrieb) felder.antrieb = ki.antrieb;
    if (ki.getriebe) felder.getriebe = ki.getriebe;
    if (ki.motorEindeutig) {
      motorEindeutig = true;
      if (ki.motor) felder.motor = ki.motor;
      if (ki.motorcode && !felder.motorcode) felder.motorcode = ki.motorcode;
      if (ki.steuertrieb) felder.steuertrieb = ki.steuertrieb;
    } else if (!motorEindeutig) {
      varianten = (ki.varianten ?? []).filter((v) => v.motor).slice(0, 14);
      if (varianten.length === 1) {
        const [v] = varianten;
        motorEindeutig = true;
        varianten = [];
        felder.motor = v.motor;
        if (v.motorcode && !v.motorcode.includes('/')) felder.motorcode = v.motorcode;
        if (v.antrieb) felder.antrieb = v.antrieb;
        if (v.getriebe) felder.getriebe = v.getriebe;
        if (v.steuertrieb) felder.steuertrieb = v.steuertrieb;
      }
    }
  }
  if (felder.antrieb === 'elektro') { delete felder.motorcode; delete felder.steuertrieb; }
  const jahrVin = modelljahrAusVin(vin);
  const modelljahr = (ki?.modelljahr || undefined) ?? funde.find((f) => f.jahr)?.jahr ?? jahrVin;
  return {
    version: VERSION, felder, modelljahr, generation: ki?.generation || undefined, region, land,
    pruefziffer: pruefzifferOk(vin) ? 'ok' : 'falsch', motorEindeutig, varianten,
    sicherheit: ki?.sicherheit, hinweis: ki?.hinweis || undefined,
    quellen: ['ISO 3779', ...funde.map((f) => f.quelle), ...(ki ? ['KI-Recherche (Web)'] : [])],
  };
}

/* ── Handler ── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST erwartet' }, 405);

  const supa = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: user } = await supa.auth.getUser(jwt);
  if (!user?.user) return json({ ok: false, error: 'Nicht angemeldet' }, 401);

  let body: { vin?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Ungültige Anfrage' }, 400); }
  const vin = (body.vin ?? '').replace(/\s/g, '').toUpperCase();
  if (!VIN_RE.test(vin)) return json({ ok: false, error: 'Ungültige VIN (17 Zeichen, ohne I, O, Q)' }, 400);

  // Pattern: WMI + VDS without check digit + model year.
  const muster = vin.slice(0, 8) + vin[9];
  const kiMoeglich = !!env('ANTHROPIC_API_KEY');
  const { data: cache } = await supa.from('vin_cache').select('data').eq('muster', muster).maybeSingle();
  const alt = cache?.data as Ergebnis | undefined;
  // A cached result without the AI step is resolved again once the key is configured.
  if (alt && alt.version === VERSION && (!kiMoeglich || alt.quellen.includes('KI-Recherche (Web)'))) {
    return json({ ok: true, quelle: 'cache', ergebnis: { ...alt, pruefziffer: pruefzifferOk(vin) ? 'ok' : 'falsch' } });
  }

  const jahr = modelljahrAusVin(vin);
  const { region, land } = herkunft(vin);
  const analyse = {
    wmi: vin.slice(0, 3), markeLautWmi: WMI3[vin.slice(0, 3)] ?? WMI2[vin.slice(0, 2)] ?? 'unbekannt', region, land,
    vds: vin.slice(3, 9), pruefziffer: pruefzifferOk(vin) ? 'gültig' : 'ungültig (ausserhalb Nordamerikas oft nicht verwendet)',
    modelljahrZeichen10: vin[9], modelljahrLautVin: jahr ?? 'unbekannt', werkZeichen11: vin[10], seriennummer: vin.slice(11),
  };

  const fehler: string[] = [];
  const quellen = [nhtsa(vin, /[1-5]/.test(vin[0]) ? undefined : jahr), vincario(vin), autodev(vin), carapi(vin)];
  const funde = (await Promise.allSettled(quellen)).flatMap((r) => {
    if (r.status === 'rejected') { fehler.push(String((r.reason as Error)?.message ?? r.reason)); return []; }
    return r.value ? [r.value] : [];
  });
  // vPIC returns a bare Make for most non-US VINs: commercial decoders first when they answered.
  funde.sort((a, b) => (a.quelle === 'NHTSA vPIC' && !/[1-5]/.test(vin[0]) ? 1 : 0) - (b.quelle === 'NHTSA vPIC' && !/[1-5]/.test(vin[0]) ? 1 : 0));

  let ki: KiAntwort | null = null;
  try { ki = await kiRecherche(vin, analyse, funde); } catch (e) { fehler.push(`KI: ${(e as Error).message}`); }

  const ergebnis = zusammenfuehren(vin, funde, ki);
  if (!kiMoeglich) ergebnis.hinweis = [ergebnis.hinweis, 'KI-Recherche nicht konfiguriert (ANTHROPIC_API_KEY fehlt).'].filter(Boolean).join(' ');
  // Only cache a result that resolved something beyond the WMI.
  if (ergebnis.felder.modell || ki) {
    await supa.from('vin_cache').upsert({ muster, vin, data: ergebnis, quellen: ergebnis.quellen, updated_at: new Date().toISOString() });
  }
  if (fehler.length) console.warn('vin-decode', vin, fehler);
  return json({ ok: true, quelle: 'neu', ergebnis });
});
