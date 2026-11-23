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

/** Row id that stays unique for documents created within the same millisecond. */
export const neueDokId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
