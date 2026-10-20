import type { Order, Customer, Position } from '../types';

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

/** Validates a user-entered shop link for use as an href: http(s) only (so a
    pasted "javascript:…" can never become clickable), scheme added if missing.
    Returns the short host for display, or null when it isn't a usable URL. */
export function parsePartLink(raw?: string): { href: string; host: string } | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return { href: u.toString(), host: u.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

// Only a complete URL counts as a link: with scheme, or "www." plus a path.
// A bare domain ("auto-doc.ch", "Teil von auto-doc.ch") stays plain text.
const LINK_TOKEN_RE = /^https?:\/\/\S+$|^www\.[^\s/]+\.[a-z]{2,}\/\S+$/i;

/** Finds a shop link in a material description ("https://www.autodoc.ch/…",
    "www.autodoc.ch/de/…"). `rest` is the text around it. Null when the text
    is an ordinary description. */
export function findPartLink(text: string): { href: string; host: string; rest: string } | null {
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const link = LINK_TOKEN_RE.test(tokens[i]) ? parsePartLink(tokens[i]) : null;
    if (link) return { ...link, rest: tokens.filter((_, j) => j !== i).join(' ') };
  }
  return null;
}

export const daysSince =(d?: string): number =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;

export const hoursSince = (d?: string): number =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000) : 0;

export const isOverdue = (o: Order): boolean => {
  if (o.status === 'offerte_versendet' && hoursSince(o.statusChangedAt) > 48) return true;
  if (o.status === 'zahlung_versendet') {
    const f = o.zahlungsFrist ? parseInt(o.zahlungsFrist) : 10;
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

/** Undoes accidental double-encoding (seen from some iOS Shortcuts "URL öffnen"
    actions, which can re-encode a value that's already URL-encoded) by decoding
    repeatedly while the string still looks percent-encoded, up to a small cap so
    a malformed "%" sequence can't throw or loop forever. `URLSearchParams.get()`
    already strips one layer, so this only ever fires on genuine double-encoding. */
export function decodeMaybeDouble(v: string): string {
  let out = v;
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

/** Material positions before Arbeit; the order within each group is kept.
    Documents saved before the Material-first order are listed the same way. */
export const materialZuerst = <P extends Position>(pos: P[]): P[] =>
  [...pos.filter((p) => p.typ === 'material'), ...pos.filter((p) => p.typ !== 'material')];

export const sortCustomers = (a: Customer, b: Customer): number => {
  const na = `${a.nachname} ${a.vorname}`.toLowerCase();
  const nb = `${b.nachname} ${b.vorname}`.toLowerCase();
  return na < nb ? -1 : na > nb ? 1 : 0;
};
