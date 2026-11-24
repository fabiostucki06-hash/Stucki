import { wartungsPositionen } from './vehicles';
import { ACHSANTRIEBE, GETRIEBE, labelVon, vorlageVon } from './wartung';
import { materialZuerst } from './utils';
import type { ArbeitPosition, MaterialPosition, Offerte, OfferteWartung, Position, ServiceItem, Vehicle, WartungTeile } from '../types';

/* Parts per Wartungsplan item: the positions entered in an Offerte made from
   the Wartungsplan are remembered per item and vehicle (table
   `maintenance_parts`) and pre-filled into the next such Offerte. Only lines
   that were actually entered are stored and reused: without a stored entry
   the item gets its plain Arbeit line, never an assumed part or price.
   Nothing here touches the Wartungsplan itself (intervals only advance via
   "Gemacht"). */

type TeilPosition = WartungTeile['positionen'][number];

/** Key of a plan item: its Vorlage ("oel", "luftfilter", …), else its name. */
export function teilKey(i: ServiceItem): string {
  return vorlageVon(i) ?? `eigen:${i.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normCode = (s?: string) => (s ?? '').replace(/[\s-]+/g, '').toUpperCase();

/** Configuration the parts of one vehicle also fit: Marke, Modell and
    Motorcode as entered on the vehicle (never inferred), plus Getriebe and
    Antrieb when entered. Without all three, parts stay with the vehicle. */
export function teileKonfig(v: Vehicle): string | undefined {
  const marke = norm(v.marke), modell = norm(v.modell), code = normCode(v.motorcode);
  if (!marke || !modell || !code) return undefined;
  return [marke, modell, code, v.getriebe ?? '', v.achsantrieb ?? ''].join('|');
}

/** "VW Golf · Motor CFFB · DSG" */
export function konfigText(v: Vehicle): string {
  return [
    [v.marke, v.modell].filter(Boolean).join(' '),
    v.motorcode && `Motor ${normCode(v.motorcode)}`,
    labelVon(GETRIEBE, v.getriebe),
    labelVon(ACHSANTRIEBE, v.achsantrieb),
  ].filter(Boolean).join(' · ');
}

export const fzId = (vehicleId: string, key: string) => `fz:${vehicleId}:${key}`;
export const konfigId = (konfig: string, key: string) => `konfig:${konfig}:${key}`;

/** Stored parts for an item: the vehicle's own first, else those of the same
    configuration (entered on another vehicle). */
export function gespeicherteTeile(v: Vehicle, key: string, alle: WartungTeile[]): { teile: WartungTeile; konfig: boolean } | undefined {
  const eigen = alle.find((t) => t.id === fzId(v.id, key));
  if (eigen) return { teile: eigen, konfig: false };
  const k = teileKonfig(v);
  const fremd = k ? alle.find((t) => t.id === konfigId(k, key)) : undefined;
  return fremd ? { teile: fremd, konfig: true } : undefined;
}

/** Positions of an Offerte from the Wartungsplan: per item the stored lines
    (`uebernehmen` decides per item), else the generated Arbeit line. Every
    line carries its item's key, so what is entered can be stored again. */
export function wartungsOfferte(
  v: Vehicle, items: ServiceItem[], alle: WartungTeile[], uebernehmen: (key: string, konfig: boolean) => boolean,
): { positionen: Position[]; wartung: OfferteWartung; uebernommen: string[] } {
  const texte = wartungsPositionen(items);
  const uebernommen: string[] = [];
  const positionen: Position[] = items.flatMap((it, i) => {
    const key = teilKey(it);
    const text = texte[i].beschreibung;
    const g = gespeicherteTeile(v, key, alle);
    if (g && g.teile.positionen.length && uebernehmen(key, g.konfig)) {
      uebernommen.push(it.name);
      return g.teile.positionen.map(({ autoText, ...p }): Position =>
        p.typ === 'arbeit' ? { ...p, beschreibung: autoText ? text : p.beschreibung, wartung: key } : { ...p, wartung: key });
    }
    return [{ ...texte[i], wartung: key }];
  });
  return {
    positionen: materialZuerst(positionen),
    wartung: { vehicleId: v.id, items: items.map((it, i) => ({ key: teilKey(it), name: it.name, text: texte[i].beschreibung })) },
    uebernommen,
  };
}

/** A line as stored: without per-Offerte state; the generated Arbeit text is
    flagged instead of stored, so the next Offerte shows the current interval. */
function alsTeil(p: Position, text: string): TeilPosition {
  if (p.typ === 'material') {
    const { bestellt, wartung, ...m } = p as MaterialPosition;
    return m;
  }
  const { wartung, zeLoading, ...a } = p as ArbeitPosition;
  return a.beschreibung.trim() === text.trim() ? { ...a, beschreibung: '', autoText: true } : a;
}

/** Something was entered for the item: a part, or a line other than the bare generated one. */
const erfasst = (p: TeilPosition) =>
  p.typ === 'material' ? !!p.beschreibung.trim() || !!p.art : parseFloat(p.ze) > 0 || !p.autoText;

/** Rows to store after an Offerte from the Wartungsplan was saved: per item
    with entered lines, one for the vehicle and one for its configuration.
    Only rows that differ from the stored ones are returned. A Materialofferte
    (parts without their working time) or an Offerte moved to another vehicle
    stores nothing. */
export function teileAusOfferte(o: Offerte, v: Vehicle | undefined, alle: WartungTeile[], von?: string): WartungTeile[] {
  const w = o.wartung;
  if (!w || !v || o.art === 'material' || v.id !== w.vehicleId || (o.vehicleId && o.vehicleId !== v.id)) return [];
  const konfig = teileKonfig(v);
  const out: WartungTeile[] = [];
  for (const it of w.items) {
    const positionen = (o.positionen ?? []).filter((p) => p.wartung === it.key).map((p) => alsTeil(p, it.text));
    if (!positionen.some(erfasst)) continue;
    const basis = {
      key: it.key, name: it.name, vehicleId: v.id, fahrzeug: [v.marke, v.modell, v.kennzeichen].filter(Boolean).join(' ') || undefined,
      positionen, offertId: o.id, updatedAt: new Date().toISOString(), von,
    };
    const rows: WartungTeile[] = [{ ...basis, id: fzId(v.id, it.key) }];
    if (konfig) rows.push({ ...basis, id: konfigId(konfig, it.key), konfig });
    for (const r of rows) {
      const alt = alle.find((t) => t.id === r.id);
      if (!alt || JSON.stringify(alt.positionen) !== JSON.stringify(r.positionen) || alt.name !== r.name) out.push(r);
    }
  }
  return out;
}
