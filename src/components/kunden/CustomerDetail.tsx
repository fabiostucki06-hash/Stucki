import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import { SFChevron } from '../Icons';
import { isOverdue, formatDateCH } from '../../lib/utils';
import type { Customer, Order } from '../../types';

interface CustomerDetailProps {
  customer: Customer;
  orders: Order[];
  onClose: () => void;
  onEdit: () => void;
  onNewOrder: () => void;
  onOrderClick: (o: Order) => void;
  onDelete: () => void;
}

export default function CustomerDetail({ customer, orders, onClose, onEdit, onNewOrder, onOrderClick, onDelete }: CustomerDetailProps) {
  const cos = orders
    .filter((o) => o.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Sheet title="Kundenakte" onClose={onClose} full barRight={<button onClick={onEdit} className="bar-btn">Bearbeiten</button>}>
      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 26,
            background: 'linear-gradient(to bottom,#54a4ff,#0056b3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5),0 3px 8px rgba(0,86,179,0.35)',
            textShadow: '0 -1px 0 rgba(0,0,0,0.3)',
          }}>
            {(customer.vorname[0] ?? '').toUpperCase()}{(customer.nachname[0] ?? '').toUpperCase()}
          </div>
          <div>
            <div className="sf-title3">{customer.vorname} {customer.nachname}</div>
            <div className="sf-subhead" style={{ color: 'var(--label2)' }}>{customer.telefon}</div>
            {customer.email && <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{customer.email}</div>}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.60)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70),0 4px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🚗</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{customer.marke ?? ''} {customer.modell ?? ''} · {customer.kennzeichen ?? ''}</span>
          {customer.km && <span style={{ fontSize: 13, color: 'var(--label2)', marginLeft: 'auto' }}>{Number(customer.km).toLocaleString()} km</span>}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.60)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70),0 4px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--label2)' }}>Chassisnummer</span>
            <span style={{ fontWeight: 600 }}>{customer.chassisnummer || '–'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--label2)' }}>1. Inv. Setzung</span>
            <span style={{ fontWeight: 600 }}>{customer.erstzulassung ? formatDateCH(customer.erstzulassung) : '–'}</span>
          </div>
        </div>
      </div>

      <button onClick={onNewOrder} className="btn-system" style={{ marginBottom: 12 }}>Neuer Auftrag</button>
      <button
        onClick={() => { if (window.confirm('Kunden löschen? Dies kann nicht rückgängig gemacht werden.')) onDelete(); }}
        className="btn-system btn-destructive"
        style={{ marginBottom: 20 }}
      >
        Kunden löschen
      </button>

      <p className="section-header">Aufträge ({cos.length})</p>
      {!cos.length && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--label3)', fontSize: 15 }}>Noch keine Aufträge.</div>}
      <div className="inset-grouped-list">
        {cos.map((o) => (
          <div key={o.id} className="list-row" onClick={() => onOrderClick(o)}>
            <div style={{ flex: 1 }}>
              {isOverdue(o) && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 2 }}>Frist überschritten</div>}
              <div className="sf-subhead" style={{ fontWeight: 600 }}>Auftrag #{o.orderNumber}</div>
              <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{formatDateCH(o.createdAt)}</div>
            </div>
            <Badge status={o.status} small />
            <span style={{ color: 'var(--label3)', marginLeft: 6 }}><SFChevron /></span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
