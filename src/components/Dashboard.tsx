import Badge from './ui/Badge';
import { SFChevron } from './Icons';
import { daysSince, hoursSince, isOverdue, needsAttention } from '../lib/utils';
import type { Customer, Order } from '../types';

interface DashboardProps {
  customers: Customer[];
  orders: Order[];
  onOrderClick: (o: Order) => void;
}

export default function Dashboard({ customers, orders, onOrderClick }: DashboardProps) {
  const activeOrders = orders.filter((o) => o.status !== 'abgeschlossen');
  const todos = orders.filter(needsAttention);

  return (
    <div>
      <div className="page-head page-head-pad">
        <h1 className="sf-title1">Übersicht</h1>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        <div className="stat-grid">
          {[
            { label: 'Kunden',          v: customers.length },
            { label: 'Aktive Aufträge', v: activeOrders.length },
            { label: 'Nachzuhaken',     v: todos.length, warn: todos.length > 0 },
            { label: 'Abgeschlossen',   v: orders.filter((o) => o.status === 'abgeschlossen').length },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-label" style={{ marginTop: 0, marginBottom: 6 }}>{s.label}</div>
              <div className="stat-number" style={s.warn ? { color: 'var(--red)' } : undefined}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Desktop: Nachzuhaken and Aktive Aufträge side by side. */}
        <div className="dash-cols">
        {todos.length > 0 && (
          <section>
            <p className="section-header" style={{ paddingLeft: 0 }}>Nachzuhaken</p>
            <div className="inset-grouped-list">
              {todos.map((o) => {
                const c = customers.find((x) => x.id === o.customerId);
                return (
                  <div key={o.id} className="list-row" tabIndex={0} onClick={() => onOrderClick(o)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{c?.vorname ?? ''} {c?.nachname ?? ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, marginTop: 1 }}>
                        {o.status === 'offerte_versendet'
                          ? `${hoursSince(o.statusChangedAt)} Std. ohne Antwort`
                          : `${daysSince(o.statusChangedAt)} Tage offen`}
                      </div>
                    </div>
                    <Badge status={o.status} small />
                    <span style={{ color: 'var(--label3)' }}><SFChevron /></span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
        <p className="section-header" style={{ paddingLeft: 0 }}>Aktive Aufträge ({activeOrders.length})</p>
        {activeOrders.length === 0 ? (
          <div className="glass-panel" style={{ padding: 24, textAlign: 'center', color: 'var(--label3)', fontSize: 15 }}>
            Keine aktiven Aufträge.
          </div>
        ) : (
          <div className="inset-grouped-list">
            {activeOrders.slice(0, 8).map((o) => {
              const c = customers.find((x) => x.id === o.customerId);
              const dv = daysSince(o.statusChangedAt);
              return (
                <div key={o.id} className="list-row" tabIndex={0} onClick={() => onOrderClick(o)} style={isOverdue(o) ? { boxShadow: 'inset 2px 0 0 var(--red)' } : undefined}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{c?.vorname ?? ''} {c?.nachname ?? ''}</div>
                    <div style={{ fontSize: 13, color: 'var(--label3)', marginTop: 1 }}>#{o.orderNumber} · {dv < 1 ? 'heute' : `${dv}T`}</div>
                  </div>
                  <Badge status={o.status} small />
                  <span style={{ color: 'var(--label3)', marginLeft: 4 }}><SFChevron /></span>
                </div>
              );
            })}
          </div>
        )}
        </section>
        </div>
      </div>
    </div>
  );
}
