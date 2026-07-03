import type { ArbeitPosition, Position } from '../types';

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export const KLEINTEIL_ZE_SCHWELLE = 100;
export const KLEINTEIL_BETRAG = 10;
export const KLEINTEIL_LABEL = 'Kleinteil-Pauschale';

export interface RechnungTotals {
  totalMaterial: number;
  totalArbeit: number;
  totalZE: number;
  zwischensumme: number;
  rechnungstotal: number;
  kleinteilApplied: boolean;
}

/** Swiss rounding to nearest 0.05 CHF (Rappenrundung). */
const roundToRappen = (n: number) => Math.round(n * 20) / 20;

/**
 * Above KLEINTEIL_ZE_SCHWELLE total ZE, a flat Kleinteil-Pauschale is billed
 * on top of the ZE-based labor total.
 */
export function computeRechnungTotals(positionen: Position[]): RechnungTotals {
  const totalMaterial = positionen
    .filter((p) => p.typ === 'material')
    .reduce((s, p) => s + fN(p.preis), 0);

  const arbeitPositionen = positionen.filter((p): p is ArbeitPosition => p.typ === 'arbeit');
  const totalZE = arbeitPositionen.reduce((s, p) => s + fN(p.ze), 0);
  const totalArbeitBase = arbeitPositionen.reduce((s, p) => s + fN(p.preis), 0);

  const kleinteilApplied = totalZE > KLEINTEIL_ZE_SCHWELLE;
  const totalArbeit = totalArbeitBase + (kleinteilApplied ? KLEINTEIL_BETRAG : 0);

  const zwischensumme = totalMaterial + totalArbeit;
  const rechnungstotal = roundToRappen(zwischensumme);

  return { totalMaterial, totalArbeit, totalZE, zwischensumme, rechnungstotal, kleinteilApplied };
}
