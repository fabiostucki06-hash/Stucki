import type { MaterialPosition } from '../types';
import { STD_SATZ } from './company';

/** 100 ZE = 60 minutes, billed at the hourly rate (CHF per 100 ZE). */
export const ZE_PRO_STUNDE = 100;

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export const zeMinuten = (ze: number) => (ze * 60) / ZE_PRO_STUNDE;

/** Rate for a material position's ZE: its own, else the Werkstatt rate. */
export const materialSatz = (p: Pick<MaterialPosition, 'stundenansatz'>) => fN(p.stundenansatz) || fN(STD_SATZ);

/** CHF for the ZE of a material position. */
export const materialZeBetrag = (p: Pick<MaterialPosition, 'ze' | 'stundenansatz'>) => (fN(p.ze) / ZE_PRO_STUNDE) * materialSatz(p);

/** Position price: Menge × Stückpreis plus the ZE share, as "0.00". */
export function materialPreis(p: Pick<MaterialPosition, 'menge' | 'stueckpreis' | 'ze' | 'stundenansatz'>): string {
  return ((fN(p.menge) || 1) * fN(p.stueckpreis) + materialZeBetrag(p)).toFixed(2);
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
