import type { Customer, Order } from '../../types';

interface RechnungenListProps {
  orders: Order[];
  customers: Customer[];
  onOrderClick: (order: Order) => void;
}

export default function RechnungenList({ orders, customers, onOrderClick }: RechnungenListProps) {
  const rechnungen = orders
    .filter((o) => o.rechnungsBetrag)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = rechnungen.reduce((sum, o) => sum + parseFloat(o.rechnungsBetrag ?? '0'), 0);

  return (
    <div>
      <div className="nav-large-title">
        <h1 className="sf-title1">Rechnungen</h1>
      </div>

      {rechnungen.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
          <div className="sf-headline" style={{ marginBottom: 6 }}>Keine Rechnungen</div>
          <div className="sf-subhead" style={{ color: 'var(--label2)', lineHeight: 1.5 }}>
            Sobald ein Auftrag einen Rechnungsbetrag<br />hat, erscheint er hier.
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>

          {/* Summary card */}
          <div style={{
            background: 'rgba(255,255,255,0.45)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.60)',
            borderRadius: 16,
            padding: '18px 22px',
            marginBottom: 20,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70), 0 8px 32px 0 rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                Gesamtumsatz
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--blue)' }}>
                CHF {total.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 3 }}>
                {rechnungen.length} {rechnungen.length === 1 ? 'Rechnung' : 'Rechnungen'}
              </div>
            </div>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'rgba(0,122,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>
              🧾
            </div>
          </div>

          {/* List */}
          <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
            {rechnungen.map((order) => {
              const customer = customers.find((c) => c.id === order.customerId);
              return (
                <button key={order.id} className="list-row" onClick={() => onOrderClick(order)}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: 'rgba(0,122,255,0.09)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, flexShrink: 0,
                  }}>
                    🧾
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sf-headline" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer?.vorname ?? ''} {customer?.nachname ?? ''}
                    </div>
                    <div className="sf-footnote" style={{ color: 'var(--label2)', marginTop: 1 }}>
                      Auftrag #{order.orderNumber}
                      {customer?.kennzeichen ? ` · ${customer.kennzeichen}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--blue)', letterSpacing: '-0.3px' }}>
                      CHF {order.rechnungsBetrag}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>
                      {new Date(order.createdAt).toLocaleDateString('de-CH')}
                    </div>
                  </div>
                  <span className="list-chevron">›</span>
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
