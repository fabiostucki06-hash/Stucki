import { findPartLink, parsePartLink } from './utils';
import type { MaterialPosition, MaterialStatus, Position } from '../types';

export interface Supplier {
  id: string;
  name: string;
  /** Whole order can be prepared in one go (see buildOrderList). */
  cart: boolean;
}

const KNOWN: (Supplier & { host: RegExp })[] = [
  { id: 'autodoc', name: 'Autodoc',       cart: true,  host: /(^|\.)auto-?doc\.[a-z.]+$/i },
  { id: 'atp',     name: 'ATP Autoteile', cart: true,  host: /(^|\.)atp-autoteile\.[a-z.]+$/i },
  { id: 'ebay',    name: 'eBay',          cart: false, host: /(^|\.)ebay\.[a-z.]+$/i },
  { id: 'amazon',  name: 'Amazon',        cart: false, host: /(^|\.)(amazon\.[a-z.]+|amzn\.[a-z]+)$/i },
];
/** Parts without a shop link, or from a shop that isn't listed above. */
const OTHER: Supplier = { id: 'other', name: 'Manuell / Sonstige', cart: false };

export interface PartToOrder {
  /** Index into the document's full `positionen` array. */
  index: number;
  pos: MaterialPosition;
  link: { href: string; host: string } | null;
}

export interface SupplierGroup {
  supplier: Supplier;
  parts: PartToOrder[];
}

/** Material positions grouped by the shop their link points to, known
    suppliers first, "Manuell / Sonstige" last. */
export function groupPartsBySupplier(positionen: Position[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  positionen.forEach((pos, index) => {
    if (pos.typ !== 'material') return;
    const link = parsePartLink(pos.link) ?? findPartLink(pos.beschreibung);
    const supplier = (link && KNOWN.find((s) => s.host.test(link.host))) || OTHER;
    const group = groups.get(supplier.id) ?? { supplier, parts: [] };
    group.parts.push({ index, pos, link: link && { href: link.href, host: link.host } });
    groups.set(supplier.id, group);
  });
  const order = [...KNOWN.map((s) => s.id), OTHER.id];
  return [...groups.values()].sort((a, b) => order.indexOf(a.supplier.id) - order.indexOf(b.supplier.id));
}

export function materialProgress(positionen: Position[]): { total: number; ordered: number; status: MaterialStatus } {
  const parts = positionen.filter((p): p is MaterialPosition => p.typ === 'material');
  const ordered = parts.filter((p) => p.bestellt).length;
  const status: MaterialStatus = !ordered ? 'offen' : ordered < parts.length ? 'teilweise' : 'bestellt';
  return { total: parts.length, ordered, status };
}

/** Plain-text order list for one supplier: quantity, article number and
    product page per part still to order. */
export function buildOrderList(parts: PartToOrder[]): string {
  return parts
    .map(({ pos, link }) => {
      const head = [`${pos.menge || '1'}×`, pos.artikelnummer, pos.beschreibung].filter(Boolean).join(' ');
      return link ? `${head}\n${link.href}` : head;
    })
    .join('\n\n');
}
