import type { ArbeitPosition, Offerte, Position, Rechnung, RechnungKategorie } from '../types';
import { ANZAHLUNG_PROZENT, offerteNr } from './offerte-docs';

/** Document name printed on PDFs, titles and file names. */
export function rechnungDocName(r: Pick<Rechnung, 'art'>): string {
  return r.art === 'anzahlung' ? 'Anzahlungsrechnung' : r.art === 'schluss' ? 'Schlussrechnung' : 'Rechnung';
}

/** Schlussrechnung reference line: "Schlussrechnung zu Offerte #1 / Anzahlungsrechnung #7". */
export function schlussReferenz(r: Rechnung): string {
  const parts = [
    r.offertNr ? `Offerte #${r.offertNr}` : '',
    r.anzahlungRechnungNumber != null ? `Anzahlungsrechnung #${r.anzahlungRechnungNumber}` : '',
  ].filter(Boolean);
  return parts.length ? `Schlussrechnung zu ${parts.join(' / ')}` : 'Schlussrechnung';
}

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
  /** Bei einer Schlussrechnung: die bereits bezahlte Anzahlung (sonst 0). */
  abzugAnzahlung: number;
  kleinteilApplied: boolean;
}

/**
 * Older Anzahlungsrechnungen carry a single line "Anzahlung 50% gemäss Offerte Nr. X".
 * Shows them with every position of the Offerte instead, as current ones are
 * created — but only when the Offerte still yields the billed amount, so the
 * invoice total never changes.
 */
export function withOffertePositionen(r: Rechnung, offerten: Offerte[]): Rechnung {
  if (r.art !== 'anzahlung' || r.anzahlungProzent) return r;
  const positionen = offerten.find((o) => o.id === r.offertId)?.positionen;
  if (!positionen?.length) return r;
  const pos = positionen.map((p) => (p.typ === 'material' ? (({ bestellt, ...m }) => m)(p) : p));
  const t = computeRechnungTotals(pos, undefined, false, ANZAHLUNG_PROZENT);
  if (t.rechnungstotal.toFixed(2) !== (parseFloat(r.totalBetrag ?? '') || 0).toFixed(2)) return r;
  return {
    ...r,
    positionen: pos,
    anzahlungProzent: ANZAHLUNG_PROZENT,
    kleinteilManuell: false,
    totalArbeit: t.totalArbeit.toFixed(2),
    totalMaterial: t.totalMaterial.toFixed(2),
    totalZE: t.totalZE,
  };
}

/**
 * Old single-line Anzahlungsrechnung still in Entwurf: rebuilt with every
 * position of its Offerte at 100% prices and ANZAHLUNG_PROZENT on document
 * level, amount recalculated. Returns null when nothing is to be migrated —
 * sent or paid invoices keep their billed amount (see withOffertePositionen).
 */
export function migrateAnzahlungEntwurf(r: Rechnung, offerten: Offerte[]): Rechnung | null {
  if (r.art !== 'anzahlung' || r.anzahlungProzent || r.status !== 'entwurf') return null;
  const offerte = offerten.find((o) => o.id === r.offertId);
  const positionen = offerte?.positionen;
  if (!offerte || !positionen?.length) return null;
  const pos = positionen.map((p) => (p.typ === 'material' ? (({ bestellt, ...m }) => m)(p) : p));
  const t = computeRechnungTotals(pos, undefined, false, ANZAHLUNG_PROZENT);
  return {
    ...r,
    positionen: pos,
    anzahlungProzent: ANZAHLUNG_PROZENT,
    // The old note quoted the amounts; they are now in the totals section.
    notizen: `Positionen gemäss Offerte / Auftragsbestätigung Nr. ${offerteNr(offerte)}.`,
    kleinteilManuell: false,
    totalBetrag: t.rechnungstotal.toFixed(2),
    totalArbeit: t.totalArbeit.toFixed(2),
    totalMaterial: t.totalMaterial.toFixed(2),
    totalZE: t.totalZE,
  };
}

/** Swiss rounding to nearest 0.05 CHF (Rappenrundung). */
const roundToRappen = (n: number) => Math.round(n * 20) / 20;

/**
 * Die Kleinteilepauschale wird automatisch verrechnet, wenn die Kategorie
 * "Reparatur" oder "Karosserie" ist (bei Inspektion/Service nie automatisch).
 * `kleinteilManuell` überschreibt die Automatik in beide Richtungen.
 * `anzahlungProzent` (Anzahlungsrechnung mit vollständiger Positionsliste):
 * das Rechnungstotal ist dieser Anteil des Gesamtbetrags.
 * `anzahlungBetrag` (Schlussrechnung): die bereits bezahlte Anzahlung wird vom
 * Gesamtbetrag abgezogen; das Rechnungstotal ist der verbleibende Restbetrag.
 */
export function computeRechnungTotals(
  positionen: Position[],
  kategorie?: RechnungKategorie,
  kleinteilManuell?: boolean | null,
  anzahlungProzent?: number,
  anzahlungBetrag?: number,
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
  const abzugAnzahlung = anzahlungBetrag ? roundToRappen(anzahlungBetrag) : 0;
  const rechnungstotal = anzahlungProzent ? roundToRappen(zwischensumme * anzahlungProzent / 100)
    : abzugAnzahlung ? roundToRappen(gesamttotal - abzugAnzahlung)
    : gesamttotal;

  const restbetrag = anzahlungProzent ? roundToRappen(gesamttotal - rechnungstotal) : 0;

  return { totalMaterial, totalArbeit, totalZE, zwischensumme, gesamttotal, rechnungstotal, restbetrag, abzugAnzahlung, kleinteilApplied };
}
