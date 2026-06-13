import type { Order, Customer } from '../types';

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
