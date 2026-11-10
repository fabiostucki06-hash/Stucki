import type { MaterialPosition, Pauschale, Position } from '../types';

/* Special material positions with a fixed price:
   - Versandkosten ('versand'): passed on 1:1 at cost — never a Marge, no EK, no ZE.
   - Pauschalen ('pauschale'): flat-rate packages (Radwechsel, Reifenwechsel …)
     from the settings — no Stundensatz / ZE calculation, no Marge.
   Both stay `typ: 'material'` so every stored total keeps working; the
   documents show them in their own subtotal lines instead of Material Total. */

export const VERSAND_LABEL = 'Versandkosten';

export const DEFAULT_PAUSCHALEN: Pauschale[] = [
  { id: 'radwechsel', name: 'Radwechsel', preis: '60.00' },
  { id: 'reifenwechsel', name: 'Reifenwechsel', preis: '120.00' },
];

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

export const istVersand = (p: Position): boolean => p.typ === 'material' && p.art === 'versand';
export const istPauschale = (p: Position): boolean => p.typ === 'material' && p.art === 'pauschale';
/** Versandkosten or Pauschale: fixed price, no Marge, no ZE. */
export const istFestpreis = (p: Position): boolean => p.typ === 'material' && !!p.art;

/** Text printed in the position list: Versandkosten are always labelled as such. */
export function positionsText(p: Position): string {
  if (!istVersand(p)) return p.beschreibung;
  const d = p.beschreibung.trim();
  return !d || d.toLowerCase() === VERSAND_LABEL.toLowerCase() ? VERSAND_LABEL : `${VERSAND_LABEL} – ${d}`;
}

/** Short type label for lists and detail views. */
export function positionsArt(p: Position): string {
  return p.typ === 'arbeit' ? 'Arbeit' : p.art === 'versand' ? 'Versandkosten' : p.art === 'pauschale' ? 'Pauschale' : 'Material';
}

/** CHF of the Versandkosten and Pauschalen; both are part of `totalMaterial`
    (positionTotals) and are taken out of it for display. */
export function festpreisSummen(positionen: Position[]): { versand: number; pauschalen: number } {
  let versand = 0, pauschalen = 0;
  for (const p of positionen) {
    if (istVersand(p)) versand += fN(p.preis);
    else if (istPauschale(p)) pauschalen += fN(p.preis);
  }
  return { versand, pauschalen };
}

export const neueVersandPosition = (): MaterialPosition => ({
  typ: 'material', art: 'versand', beschreibung: VERSAND_LABEL, menge: '1', stueckpreis: '', preis: '',
});

export function pauschalePosition(b: Pauschale): MaterialPosition {
  const preis = fN(b.preis).toFixed(2);
  return { typ: 'material', art: 'pauschale', beschreibung: b.name, menge: '1', stueckpreis: preis, preis };
}

/** Keeps only well-formed bundles (data from storage / another device). */
export function sanitizePauschalen(v: unknown): Pauschale[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .filter((b): b is Pauschale => !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.name === 'string')
    .map((b) => ({ id: b.id, name: b.name, preis: String(b.preis ?? '') }));
}
