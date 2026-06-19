import { useState } from 'react';
import Badge from '../ui/Badge';
import { SFChevron, SFXmark } from '../Icons';
import { isOverdue, daysSince } from '../../lib/utils';
import { SC, SO } from '../../constants/statuses';
import { exportOrderPDF } from '../../lib/pdf-auftrag';
import type { Customer, Order } from '../../types';

interface OrderListProps {
  orders: Order[];
  customers: Customer[];
  onOrderClick: (o: Order) => void;
  onEditClick: (o: Order) => void;
}

export default function OrderList({ orders, customers, onOrderClick, onEditClick }: OrderListProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? orders.filter((o) => {
        const c = customers.find((x) => x.id === o.customerId);
        const q = search.toLowerCase();
        return [c?.vorname, c?.nachname, c?.kennzeichen, c?.marke, c?.modell, `#${o.orderNumber}`]
          .some((v) => v?.toLowerCase().includes(q));
      })
    : orders;

  const sortByName = (a: Order, b: Order) => {
    const ca = customers.find((x) => x.id === a.customerId);
    const cb = customers.find((x) => x.id === b.customerId);
    const na = ca ? `${ca.nachname} ${ca.vorname}`.toLowerCase() : 'zzz';
    const nb = cb ? `${cb.nachname} ${cb.vorname}`.toLowerCase() : 'zzz';
    return na < nb ? -1 : na > nb ? 1 : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const done = filtered.filter((o) => o.status === 'abgeschlossen').sort(sortByName);

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <h1 className="sf-title1" style={{ marginBottom: 8, paddingTop: 8 }}>Aufträge</h1>

      <div className="search-bar-wrap" style={{ padding: '8px 0 12px' }}>
        <div className="search-bar">
          <span className="search-icon">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Kennzeichen, Modell…"
            autoComplete="off"
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label3)', padding: 0 }}>
              <SFXmark />
            </button>
          )}
        </div>
      </div>

      {SO.filter((s) => s !== 'abgeschlossen').map((s) => {
        const grp = filtered.filter((o) => o.status === s).sort(sortByName);
        if (!grp.length) return null;
        return (
          <div key={s}>
            <p className="section-header" style={{ paddingLeft: 0 }}>{SC[s].label} ({grp.length})</p>
            <div className="inset-grouped-list" style={{ marginBottom: 4 }}>
              {grp.map((o) => {
                const c = customers.find((x) => x.id === o.customerId);
                const ov = isOverdue(o); const dv = daysSince(o.statusChangedAt);
                return (
                  <div key={o.id} className="list-row" onClick={() => onOrderClick(o)} style={{ background: ov ? 'rgba(255,59,48,0.06)' : 'transparent' }}>
                    <div style={{ flex: 1 }}>
                      {ov && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 2 }}>Frist überschritten</div>}
                      <div style={{ fontWeight: 600, fontSize: 16 }}>#{o.orderNumber} – {c?.vorname ?? ''} {c?.nachname ?? ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--label3)', marginTop: 1 }}>{c?.kennzeichen ?? ''} · {dv < 1 ? 'heute' : `${dv}T`}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); exportOrderPDF(o, c); }} className="excel-btn" title="PDF herunterladen">PDF</button>
                    <button onClick={(e) => { e.stopPropagation(); onEditClick(o); }} className="excel-btn" style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--blue)', border: '1px solid rgba(0,122,255,0.25)' }} title="Bearbeiten">✎</button>
                    <span style={{ color: 'var(--label3)', marginLeft: 4 }}><SFChevron /></span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ padding: '8px 0', cursor: 'pointer', color: 'var(--label2)', fontWeight: 600, fontSize: 15, listStyle: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            ▶ Abgeschlossen ({done.length})
          </summary>
          <div className="inset-grouped-list" style={{ marginTop: 8 }}>
            {done.map((o) => {
              const c = customers.find((x) => x.id === o.customerId);
              return (
                <div key={o.id} className="list-row" onClick={() => onOrderClick(o)} style={{ opacity: 0.65 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>#{o.orderNumber} – {c?.vorname ?? ''} {c?.nachname ?? ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--label3)' }}>{new Date(o.createdAt).toLocaleDateString('de-CH')}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); exportOrderPDF(o, c); }} className="excel-btn" title="PDF herunterladen">PDF</button>
                  <button onClick={(e) => { e.stopPropagation(); onEditClick(o); }} className="excel-btn" style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--blue)', border: '1px solid rgba(0,122,255,0.25)' }} title="Bearbeiten">✎</button>
                  <span style={{ color: 'var(--label3)' }}><SFChevron /></span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {orders.length > 0 && filtered.length === 0 && (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--label3)' }}>Keine Aufträge gefunden.</div>
      )}
      {!orders.length && <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--label3)' }}>Noch keine Aufträge.</div>}
    </div>
  );
}
