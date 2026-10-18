import type { Offerte, Position } from '../types';

export const VORKASSE_BEDINGUNG = 'Zahlungsbedingung: 50% Vorkasse (Anzahlung in Bar, TWINT, E-Banking)';
export const SCHLUSSRECHNUNG_NOTIZ = 'Zusatznotiz: Schlussrechnung (50%) Zahlungsbedingung 10 Tage netto';
export const ANZAHLUNG_BEDINGUNG = 'Vorkasse – zahlbar vor Arbeitsbeginn (Bar, TWINT, E-Banking)';
export const ANZAHLUNG_PROZENT = 50;

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

/** "12" for the original, "12_2" for later versions (underscore + version number). */
export function offerteNr(o: Pick<Offerte, 'offertNumber' | 'version'>): string {
  const n = String(o.offertNumber ?? '');
  return o.version && o.version > 1 ? `${n}_${o.version}` : n;
}

/** Next free version for the offertNumber of `base` (the original counts as v1). */
export function nextVersion(base: Offerte, all: Offerte[]): number {
  const versions = all
    .filter((o) => o.offertNumber === base.offertNumber)
    .map((o) => o.version ?? 1);
  return Math.max(1, ...versions) + 1;
}

export function sumPositions(positionen: Position[]) {
  const totalArbeit = positionen.filter((p) => p.typ === 'arbeit').reduce((s, p) => s + fN(p.preis), 0);
  const totalMaterial = positionen.filter((p) => p.typ === 'material').reduce((s, p) => s + fN(p.preis), 0);
  const totalZE = positionen.reduce((s, p) => s + (p.typ === 'arbeit' ? fN(p.ze) : 0), 0);
  return { totalArbeit, totalMaterial, totalZE, total: totalArbeit + totalMaterial };
}

/** Swiss rounding to 5 Rappen. */
export const roundToRappen = (n: number) => Math.round(n * 20) / 20;

/** Payment terms as printed on Offerte / AB: the free-text conditions when set,
    otherwise the classic "<n> Tage netto". */
export function offerteZahlungszeilen(o: Offerte): string[] {
  if (o.zahlungsbedingung?.trim() || o.zusatznotiz?.trim()) {
    return [o.zahlungsbedingung, o.zusatznotiz].map((s) => s?.trim() ?? '').filter(Boolean);
  }
  return [`${o.zahlungsziel ?? '10'} Tage netto`];
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
