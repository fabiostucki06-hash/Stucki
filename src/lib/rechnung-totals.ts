import type { ArbeitPosition, Position, RechnungKategorie } from '../types';

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export const KLEINTEIL_BETRAG = 10;
export const KLEINTEIL_LABEL = 'Kleinteil-Pauschale';

/** Auftragsarten, für die die Kleinteilepauschale automatisch anfällt. */
const KLEINTEIL_AUTO_KATEGORIEN: RechnungKategorie[] = ['reparatur', 'karosserie'];

export interface RechnungTotals {
  totalMaterial: number;
  totalArbeit: number;
  totalZE: number;
  zwischensumme: number;
  /** Gesamtbetrag aller Positionen, gerundet auf 5 Rp. */
  gesamttotal: number;
  /** Zu zahlender Betrag: gleich gesamttotal, bei einer Anzahlungsrechnung der Anzahlungsanteil. */
  rechnungstotal: number;
  /** Bei einer Anzahlungsrechnung: der mit der Schlussrechnung verrechnete Rest (sonst 0). */
  restbetrag: number;
  kleinteilApplied: boolean;
}

/** Swiss rounding to nearest 0.05 CHF (Rappenrundung). */
const roundToRappen = (n: number) => Math.round(n * 20) / 20;

/**
 * Die Kleinteilepauschale wird automatisch verrechnet, wenn die Kategorie
 * "Reparatur" oder "Karosserie" ist (bei Inspektion/Service nie automatisch).
 * `kleinteilManuell` überschreibt die Automatik in beide Richtungen.
 * `anzahlungProzent` (Anzahlungsrechnung mit vollständiger Positionsliste):
 * das Rechnungstotal ist dieser Anteil des Gesamtbetrags.
 */
export function computeRechnungTotals(
  positionen: Position[],
  kategorie?: RechnungKategorie,
  kleinteilManuell?: boolean | null,
  anzahlungProzent?: number,
): RechnungTotals {
  const totalMaterial = positionen
    .filter((p) => p.typ === 'material')
    .reduce((s, p) => s + fN(p.preis), 0);

  const arbeitPositionen = positionen.filter((p): p is ArbeitPosition => p.typ === 'arbeit');
  const totalZE = arbeitPositionen.reduce((s, p) => s + fN(p.ze), 0);
  const totalArbeitBase = arbeitPositionen.reduce((s, p) => s + fN(p.preis), 0);

  const autoApplies = !!kategorie && KLEINTEIL_AUTO_KATEGORIEN.includes(kategorie);
  const kleinteilApplied = kleinteilManuell != null ? kleinteilManuell : autoApplies;
  const totalArbeit = totalArbeitBase + (kleinteilApplied ? KLEINTEIL_BETRAG : 0);

  const zwischensumme = totalMaterial + totalArbeit;
  const gesamttotal = roundToRappen(zwischensumme);
  const rechnungstotal = anzahlungProzent ? roundToRappen(zwischensumme * anzahlungProzent / 100) : gesamttotal;

  const restbetrag = anzahlungProzent ? roundToRappen(gesamttotal - rechnungstotal) : 0;

  return { totalMaterial, totalArbeit, totalZE, zwischensumme, gesamttotal, rechnungstotal, restbetrag, kleinteilApplied };
}
