import type { Offerte, Position } from '../types';

export const VORKASSE_BEDINGUNG = 'Zahlungsbedingung: 50% Vorkasse (Anzahlung in Bar, TWINT, E-Banking)';
export const SCHLUSSRECHNUNG_NOTIZ = 'Zusatznotiz: Schlussrechnung (50%) Zahlungsbedingung 10 Tage netto';
export const ANZAHLUNG_BEDINGUNG = 'Vorkasse – zahlbar vor Arbeitsbeginn (Bar, TWINT, E-Banking)';
export const ANZAHLUNG_PROZENT = 50;
export const MATERIAL_BESTELL_HINWEIS = 'Material wird erst bestellt, sofern Zahlung vorliegt, Zeitverzug ist daher Sache des Käufers. Es gelten die Bestimmungen des Schweizerischen Obligationenrechts (OR), insbesondere Art. 82 und Art. 102 OR.';
/** Earlier wording, still stored in some notes; replaced by MATERIAL_BESTELL_HINWEIS. */
const MATERIAL_BESTELL_HINWEIS_ALT = 'Material wird erst bestellt wenn die Zahlung durchgeführt wurde';

/** Offerte-Notizen carried over to an Auftrag or a regular Rechnung, without the hint. */
export function ohneMaterialHinweis(notizen?: string): string | undefined {
  const n = notizen
    ?.replace(MATERIAL_BESTELL_HINWEIS, '')
    .replace(MATERIAL_BESTELL_HINWEIS_ALT, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return n || undefined;
}

/** Notizen of Offerten, Materialofferten and Anzahlungsrechnungen always carry the
    MATERIAL_BESTELL_HINWEIS on its own last line; the earlier wording is replaced. */
export function mitMaterialHinweis(notizen?: string): string {
  const n = notizen?.trim() ?? '';
  if (n.includes(MATERIAL_BESTELL_HINWEIS)) return n;
  const rest = ohneMaterialHinweis(n);
  return rest ? `${rest}\n${MATERIAL_BESTELL_HINWEIS}` : MATERIAL_BESTELL_HINWEIS;
}

/** Whether the Offerte asks for the 50% Anzahlung; older ones without the flag
    count as such when they carry the Vorkasse terms. */
export function anzahlungErforderlich(o: Pick<Offerte, 'anzahlungErforderlich' | 'zahlungsbedingung'>): boolean {
  return o.anzahlungErforderlich ?? o.zahlungsbedingung?.trim() === VORKASSE_BEDINGUNG;
}

/** Anzahlung (ANZAHLUNG_PROZENT of the total) and remainder, both rounded to 5 Rappen. */
export function anzahlungAufteilung(total: number): { anzahlung: number; rest: number } {
  const anzahlung = roundToRappen(total * ANZAHLUNG_PROZENT / 100);
  return { anzahlung, rest: roundToRappen(roundToRappen(total) - anzahlung) };
}

/** Number references in generated titles and notes ("Offerte #12", "Auftragsbestätigung Nr. 12_2"). */
export const OFFERTE_REF = '(?:Offerte|Auftragsbestätigung) (?:#|Nr\\. )';
export const ANZAHLUNG_REF = 'Anzahlungsrechnung #';

/** Replaces a changed document number after `ref`; "12" doesn't touch "120" or "12_2". */
export function ersetzeNummer(text: string | undefined, ref: string, alt: string, neu: string): string | undefined {
  if (!text) return text;
  const esc = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${ref})${esc}(?![\\d_])`, 'g'), `$1${neu}`);
}

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
  if (anzahlungErforderlich(o)) return [VORKASSE_BEDINGUNG];
  return [`${o.zahlungsziel ?? '10'} Tage netto`];
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
