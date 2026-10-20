import type { MaterialPosition, Position } from '../types';
import { STD_SATZ } from './company';

/** 100 ZE = 60 minutes, billed at the hourly rate (CHF per 100 ZE). */
export const ZE_PRO_STUNDE = 100;

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export const zeMinuten = (ze: number) => (ze * 60) / ZE_PRO_STUNDE;

/** Rate for every ZE in a document: the Werkstatt Std.Satz (CHF per 100 ZE). */
export const zeSatz = () => fN(STD_SATZ);

/** Rate for a material position's ZE: the Std.Satz like every other ZE. */
export const materialSatz = (_p?: Pick<MaterialPosition, 'stundenansatz'>) => zeSatz();

/** CHF for a number of ZE at the Std.Satz (100 ZE = CHF 80.00, i.e. CHF 0.80 per ZE). */
export const zeBetrag = (ze: number) => Math.round((ze / ZE_PRO_STUNDE) * zeSatz() * 100) / 100;

/** CHF for the ZE of a material position; billed under Arbeit, never in its `preis`. */
export const materialZeBetrag = (p: Pick<MaterialPosition, 'ze' | 'stundenansatz'>) => zeBetrag(fN(p.ze));

/** Position price: Menge × Stückpreis only, as "0.00". The ZE count as Arbeit (see positionTotals). */
export function materialPreis(p: Pick<MaterialPosition, 'menge' | 'stueckpreis'>): string {
  return ((fN(p.menge) || 1) * fN(p.stueckpreis)).toFixed(2);
}

/** "30 ZE = 18 Min. = CHF 24.00" */
export function zeText(ze: number, satz: number): string {
  const min = zeMinuten(ze);
  return `${ze} ZE = ${Number.isInteger(min) ? min : min.toFixed(1)} Min. = CHF ${((ze / ZE_PRO_STUNDE) * satz).toFixed(2)}`;
}

/** Sum of the ZE and their CHF over all material positions. */
export function materialZeSumme(positionen: { typ: string }[]): { ze: number; betrag: number } {
  const mp = positionen.filter((p): p is MaterialPosition => p.typ === 'material');
  return {
    ze: mp.reduce((s, p) => s + fN(p.ze), 0),
    betrag: mp.reduce((s, p) => s + materialZeBetrag(p), 0),
  };
}

/**
 * Material Total = Menge × Stückpreis of the material positions only.
 * Arbeit Total = the sum of every ZE in the document — Arbeit positions and the
 * time billed with a material position — at the Std.Satz: ZE × 80 / 100, i.e.
 * CHF 0.80 per ZE (1'420 ZE = CHF 1'136.00). Arbeit positions carry no own price.
 */
export function positionTotals(positionen: Position[]) {
  let totalMaterial = 0, totalZE = 0;
  for (const p of positionen) {
    totalZE += fN(p.ze);
    if (p.typ === 'material') totalMaterial += fN(p.preis);
  }
  const totalArbeit = zeBetrag(totalZE);
  return { totalMaterial, totalArbeit, totalZE, total: totalMaterial + totalArbeit };
}

/** Material positions saved before the split carried their ZE share in `preis`;
    returns the position with the pure material price (unchanged otherwise). */
export function ohneZeAnteil<P extends Position>(p: P): P {
  if (p.typ !== 'material' || !fN(p.ze)) return p;
  const preis = materialPreis(p);
  return preis === p.preis ? p : { ...p, preis };
}

/** A stored document with its positions and Material / Arbeit totals moved to the
    split above. The grand total stays the same: the ZE share only moves from
    Material to Arbeit. */
export function mitGetrenntenTotals<D extends { positionen?: Position[]; totalMaterial?: string; totalArbeit?: string; totalZE?: number }>(d: D): D {
  if (!d.positionen?.length) return d;
  let verschoben = 0;
  const positionen = d.positionen.map((p) => {
    const q = ohneZeAnteil(p);
    if (q !== p) verschoben += fN(p.preis) - fN(q.preis);
    return q;
  });
  if (!positionen.some((q, i) => q !== d.positionen![i])) return d;
  const r = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
  return {
    ...d,
    positionen,
    ...(d.totalZE != null && { totalZE: positionTotals(positionen).totalZE }),
    ...(d.totalMaterial != null && { totalMaterial: r(fN(d.totalMaterial) - verschoben) }),
    ...(d.totalArbeit != null && { totalArbeit: r(fN(d.totalArbeit) + verschoben) }),
  };
}

/** Materialofferte: material prices only. The ZE of a part are dropped, so they
    are neither priced nor added to the Offertentotal (the work is offered separately). */
export function ohneMaterialZe<P extends Position>(p: P): P {
  if (p.typ !== 'material' || (p.ze == null && p.stundenansatz == null)) return p;
  const { ze, stundenansatz, ...rest } = ohneZeAnteil(p) as MaterialPosition;
  return rest as P;
}

/** A Materialofferte with ZE-free positions and totals from them (Arbeit 0). */
export function alsReineMaterialofferte<D extends { positionen?: Position[]; totalMaterial?: string; totalArbeit?: string; totalBetrag?: string; totalZE?: number }>(d: D): D {
  if (!d.positionen?.some((p) => p.typ === 'material' && (p.ze != null || p.stundenansatz != null))) return d;
  const positionen = d.positionen.map(ohneMaterialZe);
  const t = positionTotals(positionen);
  return {
    ...d,
    positionen,
    totalMaterial: t.totalMaterial.toFixed(2),
    totalArbeit: t.totalArbeit.toFixed(2),
    totalBetrag: t.total.toFixed(2),
    totalZE: t.totalZE,
  };
}
