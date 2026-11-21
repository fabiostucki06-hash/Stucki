import type { Position, Rechnung } from '../types';
import { computeRechnungTotals } from './rechnung-totals';
import { ohneZeAnteil } from './ze';

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export interface GewinnTeile {
  arbeit: number;
  /** Pauschalen incl. Kleinteil-Pauschale: no cost, 100% profit. */
  pauschalen: number;
  /** Parts and Versandkosten: revenue, but not profit. */
  material: number;
  gewinn: number;
  umsatz: number;
}

const LEER: GewinnTeile = { arbeit: 0, pauschalen: 0, material: 0, gewinn: 0, umsatz: 0 };

/** A flat-rate line: marked as Pauschale or named so (older "Kleinteil Pauschale" rows).
    Versandkosten are passed on at cost and never count. */
export function istPauschalPosition(p: Position): boolean {
  if (p.typ !== 'material' || p.art === 'versand') return false;
  return p.art === 'pauschale' || /pauschal/i.test(p.beschreibung);
}

/** Paid invoices only. An Anzahlungsrechnung lists the same positions as its
    Schlussrechnung, so the job is counted once, when the Schlussrechnung is paid. */
export const zaehltFuerGewinn = (r: Rechnung): boolean =>
  r.status === 'bezahlt' && r.art !== 'anzahlung';

export function gewinnTeile(r: Rechnung): GewinnTeile {
  if (!zaehltFuerGewinn(r)) return LEER;
  const positionen = r.positionen ?? [];
  const pauschalPositionen = positionen
    .filter(istPauschalPosition)
    .reduce((s, p) => s + fN(ohneZeAnteil(p).preis), 0);
  // The Kleinteil-Pauschale is charged on top and is in neither stored total.
  const { kleinteil } = computeRechnungTotals(positionen, r.kategorie, r.kleinteilManuell);
  const arbeit = fN(r.totalArbeit);
  const pauschalen = pauschalPositionen + kleinteil;
  const material = Math.max(0, fN(r.totalMaterial) - pauschalPositionen);
  return { arbeit, pauschalen, material, gewinn: arbeit + pauschalen, umsatz: arbeit + pauschalen + material };
}

export function summeGewinn(rechnungen: Rechnung[]): GewinnTeile {
  return rechnungen.reduce<GewinnTeile>((s, r) => {
    const t = gewinnTeile(r);
    return {
      arbeit: s.arbeit + t.arbeit,
      pauschalen: s.pauschalen + t.pauschalen,
      material: s.material + t.material,
      gewinn: s.gewinn + t.gewinn,
      umsatz: s.umsatz + t.umsatz,
    };
  }, LEER);
}
