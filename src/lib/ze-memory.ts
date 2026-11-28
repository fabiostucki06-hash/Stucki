import { normMotorcode } from './wartung';
import { zeBetrag } from './ze';
import type { Position, Vehicle, ZeEintrag, ZeFahrzeug } from '../types';

/* ZE learned from what the workshop entered (table `ze_memory`).

   Every ZE typed or confirmed on an Arbeit or material line of an Offerte or
   Rechnung, an Inspektion's ZE set in the Wartungsplan, and the ZE of material
   entered on a vehicle are stored with the vehicle they were entered for (Marke,
   Modell, Motorkennbuchstabe, year of the 1. Inverkehrsetzung, Getriebe,
   Antrieb, Antriebsart, VIN) and the normalized task. The next line with the
   same task on a matching vehicle gets exactly that ZE.

   Nothing is guessed: only values a person entered are stored (no KI
   estimate), only explicitly entered vehicle data count (nothing inferred from
   free text), and without a stored match the ZE stays empty. */

const INTERVALL_ZUSATZ = /\s*\(Intervall [^)]*\)\s*$/;

const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** "Bremsflüssigkeit wechseln (Intervall 2 Jahre)" → "bremsfluessigkeit wechseln". */
export function normTask(s: string): string {
  return s.replace(INTERVALL_ZUSATZ, '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const zahl = (v?: string) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The vehicle as the memory compares it; null without Marke and Modell (nothing to match on). */
export function zeFahrzeug(v?: Partial<Vehicle>): ZeFahrzeug | null {
  const marke = norm(v?.marke), modell = norm(v?.modell);
  if (!v || !marke || !modell) return null;
  const jahr = /^\d{4}/.test(v.erstzulassung ?? '') ? parseInt(v.erstzulassung!.slice(0, 4), 10) : undefined;
  const vin = (v.chassisnummer ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return {
    marke, modell,
    motorcode: normMotorcode(v.motorcode) || undefined,
    jahr,
    getriebe: v.getriebe, antrieb: v.antrieb, achsantrieb: v.achsantrieb,
    vin: vin.length === 17 ? vin : undefined,
  };
}

/** One entry per task and vehicle configuration: identical vehicles share it. */
export const zeId = (typ: ZeEintrag['typ'], task: string, f: ZeFahrzeug) =>
  ['ze', typ, task, f.marke, f.modell, f.motorcode ?? '', f.jahr ?? '', f.getriebe ?? '', f.antrieb ?? '', f.achsantrieb ?? ''].join('|');

/** Attributes that change the work: a stored ZE for another engine, gearbox or drivetrain never applies. */
const HART = ['motorcode', 'getriebe', 'antrieb', 'achsantrieb'] as const;

export interface ZeTreffer {
  ze: string;
  eintrag: ZeEintrag;
  /** Every known attribute is equal (or the same VIN). */
  exakt: boolean;
  /** "Gespeichert: VW Golf CFFB 2015 (Offerte #12)". */
  hinweis: string;
}

const fzText = (f: ZeFahrzeug) =>
  [f.marke.toUpperCase().length <= 3 ? f.marke.toUpperCase() : f.marke.replace(/^./, (c) => c.toUpperCase()), f.modell.replace(/^./, (c) => c.toUpperCase()), f.motorcode, f.jahr].filter(Boolean).join(' ');

/**
 * The stored ZE for a line, or null. A candidate has the same task and type,
 * the same Marke and Modell, and no conflicting engine code, gearbox, fuel or
 * drivetrain. A different year only counts when both engine codes are known
 * and equal. The closest one wins: same VIN, then the most matching
 * attributes, then the most recently confirmed value.
 */
export function zeFuer(alle: ZeEintrag[], typ: ZeEintrag['typ'], beschreibung: string, v?: Partial<Vehicle>): ZeTreffer | null {
  const task = normTask(beschreibung);
  const f = zeFahrzeug(v);
  if (task.length < 3 || !f) return null;
  let best: { e: ZeEintrag; score: number; exakt: boolean } | null = null;
  for (const e of alle) {
    if (e.typ !== typ || e.task !== task || e.fz.marke !== f.marke || e.fz.modell !== f.modell || !zahl(e.ze)) continue;
    let score = 0, exakt = true, konflikt = false;
    for (const k of HART) {
      const a = e.fz[k], b = f[k];
      if (a && b) { if (a !== b) konflikt = true; else score += 4; }
      else if (a || b) exakt = false;
    }
    if (konflikt) continue;
    if (e.fz.jahr && f.jahr) {
      if (e.fz.jahr === f.jahr) score += 2;
      else if (e.fz.motorcode && f.motorcode) exakt = false;
      else continue;
    } else if (e.fz.jahr || f.jahr) exakt = false;
    const gleicheVin = !!e.fz.vin && e.fz.vin === f.vin;
    if (gleicheVin) { score += 16; exakt = true; }
    if (!best || score > best.score || (score === best.score && (e.updatedAt > best.e.updatedAt || (e.updatedAt === best.e.updatedAt && e.id < best.e.id)))) {
      best = { e, score, exakt };
    }
  }
  if (!best) return null;
  const q = best.e.quelle;
  return {
    ze: String(zahl(best.e.ze)),
    eintrag: best.e,
    exakt: best.exakt,
    hinweis: `Gespeichert: ${best.e.ze} ZE für ${fzText(best.e.fz)}${q?.nr ? ` (${q.nr})` : ''}${best.exakt ? '' : ' – nächste Übereinstimmung'}`,
  };
}

export interface ZeQuelle { art: 'offerte' | 'rechnung' | 'wartungsplan'; id?: string; nr?: string }

/** A line that carries a ZE a person entered: Arbeit (no KI estimate) or a part (no Versand / Pauschale). */
function gelernteZeile(p: Position): { typ: ZeEintrag['typ']; beschreibung: string; ze: string } | null {
  const ze = zahl(p.ze);
  const beschreibung = p.beschreibung?.trim() ?? '';
  if (!ze || !beschreibung) return null;
  if (p.typ === 'arbeit') return p.zeKI ? null : { typ: 'arbeit', beschreibung: beschreibung.replace(INTERVALL_ZUSATZ, ''), ze: String(ze) };
  return p.art ? null : { typ: 'material', beschreibung, ze: String(ze) };
}

/**
 * Entries to store after lines were saved for a vehicle: new tasks, and tasks
 * whose ZE changed. A task listed twice with different ZE in the same document
 * is ambiguous and not stored.
 */
export function zeLernen(positionen: Position[], v: Partial<Vehicle> | undefined, alle: ZeEintrag[], quelle: ZeQuelle, von?: string): ZeEintrag[] {
  const f = zeFahrzeug(v);
  if (!f) return [];
  const proId = new Map<string, ZeEintrag | null>();
  const jetzt = new Date().toISOString();
  for (const p of positionen) {
    const z = gelernteZeile(p);
    if (!z) continue;
    const task = normTask(z.beschreibung);
    if (task.length < 3) continue;
    const id = zeId(z.typ, task, f);
    if (proId.has(id)) {
      const da = proId.get(id);
      if (da && da.ze !== z.ze) proId.set(id, null);
      continue;
    }
    proId.set(id, { id, typ: z.typ, task, beschreibung: z.beschreibung, ze: z.ze, fz: f, vehicleId: v?.id, quelle, updatedAt: jetzt, von });
  }
  const neu: ZeEintrag[] = [];
  for (const e of proId.values()) {
    if (!e) continue;
    const alt = alle.find((x) => x.id === e.id);
    if (alt && zahl(alt.ze) === zahl(e.ze)) continue;
    neu.push(e);
  }
  return neu;
}

type AutoZeile = { beschreibung: string; ze?: string; zeAuto?: boolean; zeHint?: string; zeKI?: boolean };

/**
 * A form row after its description (or vehicle) changed: a ZE typed by hand
 * stays as it is; otherwise the stored ZE for the task and vehicle is filled
 * in (`zeAuto`), and a ZE filled in that way is cleared again when nothing
 * matches any more. Never invents a value.
 */
export function zeAutomatisch<R extends AutoZeile>(r: R, typ: ZeEintrag['typ'], alle: ZeEintrag[], v?: Partial<Vehicle>): R {
  if (zahl(r.ze) && !r.zeAuto && !r.zeKI) return r;
  const t = zeFuer(alle, typ, r.beschreibung, v);
  if (t) {
    if (r.zeAuto && r.ze === t.ze && r.zeHint === t.hinweis) return r;
    return { ...r, ze: t.ze, zeAuto: true, zeHint: t.hinweis, ...(typ === 'arbeit' && { zeKI: false }) };
  }
  return r.zeAuto ? { ...r, ze: '', zeAuto: false, zeHint: '' } : r;
}

/**
 * Offerte from the Wartungsplan: Arbeit lines still without ZE get the ZE
 * stored for the task and vehicle. Lines of an item whose material already
 * carries ZE stay as they are (the work is billed with the part, never twice);
 * nothing is added, and without a match the ZE stays empty.
 */
export function mitGelernterArbeitZe(positionen: Position[], alle: ZeEintrag[], v?: Partial<Vehicle>): { positionen: Position[]; gefuellt: number } {
  const zeImMaterial = new Set(positionen.filter((p) => p.typ === 'material' && p.wartung && zahl(p.ze)).map((p) => p.wartung!));
  let gefuellt = 0;
  const neu = positionen.map((p): Position => {
    if (p.typ !== 'arbeit' || zahl(p.ze) || (p.wartung && zeImMaterial.has(p.wartung))) return p;
    const t = zeFuer(alle, 'arbeit', p.beschreibung, v);
    if (!t) return p;
    gefuellt++;
    return { ...p, ze: t.ze, zeKI: false, zeHint: t.hinweis, preis: zeBetrag(zahl(t.ze)).toFixed(2) };
  });
  return { positionen: neu, gefuellt };
}
