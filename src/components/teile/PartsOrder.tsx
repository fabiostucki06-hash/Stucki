import { useState } from 'react';
import { createPortal } from 'react-dom';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { buildOrderList, groupPartsBySupplier, materialProgress, type SupplierGroup } from '../../lib/suppliers';
import type { MaterialStatus, Position } from '../../types';

interface PartsOrderProps {
  /** e.g. "Auftrag #12" */
  docLabel: string;
  positionen: Position[];
  /** Persists the positions with their updated `bestellt` flags. Throws on failure. */
  onSave: (positionen: Position[], status: MaterialStatus) => Promise<void>;
}

/** "Teile bestellen" entry for an Auftrag / accepted Offerte: a button with
    the order progress that opens the ordering hub. Renders nothing when the
    document has no material positions. */
export default function PartsOrder({ docLabel, positionen, onSave }: PartsOrderProps) {
  const [open, setOpen] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const { total, ordered, status } = materialProgress(positionen);
  if (!total) return null;
  const done = status === 'bestellt';

  async function toggle(index: number) {
    if (savingIdx !== null) return;
    const next = positionen.map((p, i) => (i === index && p.typ === 'material' ? { ...p, bestellt: !p.bestellt } : p));
    const nextStatus = materialProgress(next).status;
    setSavingIdx(index);
    try {
      await onSave(next, nextStatus);
      if (nextStatus === 'bestellt' && !done) showToast('Alle Teile bestellt', 'success');
    } catch {
      // onSave already toasted the reason; the checkbox stays as it was.
    } finally {
      setSavingIdx(null);
    }
  }

  // Copies the supplier's open parts as an order list and opens the shop.
  // Neither Autodoc nor ATP offers a way to fill the cart from outside.
  function prepareCart(group: SupplierGroup) {
    const pending = group.parts.filter((p) => !p.pos.bestellt);
    const parts = pending.length ? pending : group.parts;
    const first = parts.find((p) => p.link)?.link;
    navigator.clipboard?.writeText(buildOrderList(parts)).then(
      () => showToast(`Bestellliste kopiert – ${parts.length} ${group.supplier.name}-Teil${parts.length === 1 ? '' : 'e'}`, 'success'),
      () => showToast('Bestellliste konnte nicht kopiert werden', 'error'),
    );
    if (first) window.open(new URL(first.href).origin, '_blank', 'noopener');
  }

  const groups = open ? groupPartsBySupplier(positionen) : [];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="po-entry no-print">
        <span aria-hidden="true">🛒</span>
        <span className="po-entry-txt">Teile bestellen</span>
        <span className={`po-chip${done ? ' done' : ''}`}>{done ? 'Alle Teile bestellt' : `${ordered} von ${total} bestellt`}</span>
      </button>

      {/* Portalled: this sits inside another sheet, whose transform would
          otherwise become the containing block for the fixed-position layers. */}
      {open && createPortal(
        <Sheet title={`Teile bestellen · ${docLabel}`} onClose={() => setOpen(false)} full>
          <div className="po-progress">
            <div className="po-progress-hdr">
              <span>{ordered} von {total} Teil{total === 1 ? '' : 'en'} bestellt</span>
              {done && <span className="po-chip done">Alle Teile bestellt</span>}
            </div>
            <div className="po-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ordered}>
              <div className="po-bar-fill" style={{ width: `${(ordered / total) * 100}%` }} />
            </div>
          </div>

          {groups.map((group) => {
            const groupOrdered = group.parts.filter((p) => p.pos.bestellt).length;
            const shopHost = group.parts.find((p) => p.link)?.link?.host;
            return (
              <section key={group.supplier.id} className="po-group">
                <div className="po-group-hdr">
                  <span className="po-group-name">{group.supplier.name}</span>
                  <span className="po-group-count">{groupOrdered}/{group.parts.length} bestellt</span>
                </div>

                {group.supplier.cart && (
                  <>
                    <button type="button" className="btn-system" onClick={() => prepareCart(group)}>
                      🛒 Alle {group.supplier.name}-Teile in den Warenkorb
                    </button>
                    <p className="po-hint">Kopiert die Bestellliste (Menge, Artikelnummer, Link) und öffnet {shopHost}.</p>
                  </>
                )}

                {group.parts.map(({ index, pos, link }) => (
                  <div key={index} className={`po-item${pos.bestellt ? ' ordered' : ''}`}>
                    <label className="po-check">
                      {savingIdx === index
                        ? <Spinner size={16} />
                        : <input type="checkbox" checked={!!pos.bestellt} disabled={savingIdx !== null} onChange={() => toggle(index)} />}
                      <span>Bestellt</span>
                    </label>
                    <div className="po-item-body">
                      <div className="po-item-title">{pos.beschreibung}</div>
                      <div className="po-item-meta">
                        {[`${pos.menge || '1'}×`, pos.artikelnummer && `Art.-Nr. ${pos.artikelnummer}`, pos.ek && `EK CHF ${pos.ek}`, group.supplier.id === 'other' && link?.host]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {link && <a className="po-link" href={link.href} target="_blank" rel="noopener noreferrer">Link öffnen ↗</a>}
                  </div>
                ))}
              </section>
            );
          })}
        </Sheet>,
        document.body,
      )}
    </>
  );
}
