import type { Order, Customer } from '../types';

/** Formats any date as DD.MM.YYYY (de-CH), always zero-padded — de-CH's default toLocaleDateString does not pad. */
export const formatDateCH = (d: string | Date): string =>
  new Date(d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Builds the standard export filename "Vorname Nachname DocType_Nummer", stripped of characters invalid in filenames. */
export function buildDocumentFilename(customer: Customer | undefined, docType: string, number: number | string): string {
  const name = customer ? `${customer.vorname} ${customer.nachname}`.trim() : 'Kunde';
  return `${name} ${docType}_${number}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/** Prints with document.title temporarily set so the browser's print/"Save as PDF" dialog suggests the right filename. */
export function printWithFilename(filename: string): void {
  const prevTitle = document.title;
  document.title = filename;
  const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

export const daysSince = (d?: string): number =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;

export const hoursSince = (d?: string): number =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000) : 0;

export const isOverdue = (o: Order): boolean => {
  if (o.status === 'offerte_versendet' && hoursSince(o.statusChangedAt) > 48) return true;
  if (o.status === 'zahlung_versendet') {
    const f = o.zahlungsFrist ? parseInt(o.zahlungsFrist) : 30;
    if (daysSince(o.statusChangedAt) > f) return true;
  }
  return false;
};

export const needsAttention = (o: Order): boolean =>
  o.status !== 'abgeschlossen' && isOverdue(o);

export const getActiveStatus = (orders: Order[], cid: string): string | null => {
  const active = orders.filter((o) => o.customerId === cid && o.status !== 'abgeschlossen');
  if (!active.length) return null;
  return active.sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  )[0].status;
};

export const sortCustomers = (a: Customer, b: Customer): number => {
  const na = `${a.nachname} ${a.vorname}`.toLowerCase();
  const nb = `${b.nachname} ${b.vorname}`.toLowerCase();
  return na < nb ? -1 : na > nb ? 1 : 0;
};
