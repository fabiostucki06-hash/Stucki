import type { Rechnung, Customer, Order } from '../../types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  entwurf:      { label: 'Entwurf',      color: 'var(--label2)' },
  versendet:    { label: 'Versendet',    color: 'var(--orange)' },
  bezahlt:      { label: 'Bezahlt',      color: 'var(--green)'  },
  ueberfaellig: { label: 'Überfällig',   color: 'var(--red)'    },
};

interface RechnungListProps {
  rechnungen: Rechnung[];
  customers: Customer[];
  orders: Order[];
  onRechnungClick: (r: Rechnung) => void;
  onNew: () => void;
}

export default function RechnungList({ rechnungen, customers, orders, onRechnungClick, onNew }: RechnungListProps) {
  if (!rechnungen.length) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🧾</div>
        <p className="sf-headline" style={{ color: 'var(--label2)', marginBottom: 8 }}>Noch keine Rechnungen</p>
        <p className="sf-subhead" style={{ color: 'var(--label3)', marginBottom: 24 }}>Erstelle deine erste Rechnung aus einem Auftrag.</p>
        <button onClick={onNew} className="btn-system" style={{ maxWidth: 240, margin: '0 auto' }}>Neue Rechnung</button>
      </div>
    );
  }

  const sorted = [...rechnungen].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={{ padding: '8px 16px' }}>
      {sorted.map((r) => {
        const c = customers.find((x) => x.id === r.customerId);
        const o = orders.find((x) => x.id === r.auftragId);
        const meta = STATUS_META[r.status] ?? STATUS_META.entwurf;
        return (
          <button key={r.id} onClick={() => onRechnungClick(r)} className="card" style={{ width: '100%', textAlign: 'left', marginBottom: 10, padding: '14px 16px', cursor: 'pointer', display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--label)' }}>Rechnung #{r.rechnungNumber}</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--blue)' }}>CHF {parseFloat(r.totalBetrag || '0').toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--label2)', marginBottom: 2 }}>{c?.vorname} {c?.nachname} · {c?.kennzeichen ?? '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {o && <span style={{ fontSize: 13, color: 'var(--label3)' }}>Auftrag #{o.orderNumber}</span>}
              <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
