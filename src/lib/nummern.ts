/** Numeric part of a document number: 10, "OFF-10", "RE-2026-010" → 10. A version
    suffix ("12_2") is ignored. Same rule as `_doc_nummer` in the database. */
export function nummerWert(v: unknown): number {
  const m = String(v ?? '').replace(/_\d+$/, '').match(/(\d{1,9})\D*$/);
  return m ? Number(m[1]) : 0;
}

/** Next number of a sequence: highest existing one + 1. */
export function naechsteNr(nummern: unknown[]): number {
  return nummern.reduce<number>((max, n) => Math.max(max, nummerWert(n)), 0) + 1;
}

/** Smallest free number of a sequence, counting from the lowest number in use:
    gaps are filled first (10, 11, 13 → 12), otherwise highest + 1 (10–16 → 17);
    numbers below the lowest one are never handed out. Empty sequence → 1.
    Versions ("12_2") count as their base number, so a number in use by any
    version stays taken. Same rule as `next_document_number` for Offerten in the
    database. */
export function kleinsteFreieNr(nummern: unknown[]): number {
  const belegt = new Set(nummern.map(nummerWert).filter((n) => n > 0));
  if (belegt.size === 0) return 1;
  let n = Math.min(...belegt);
  while (belegt.has(n)) n++;
  return n;
}

/** Row id that stays unique for documents created within the same millisecond. */
export const neueDokId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
