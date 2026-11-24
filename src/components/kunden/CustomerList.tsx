import { useState } from 'react';
import Badge from '../ui/Badge';
import { SFChevron, SFXmark } from '../Icons';
import { getActiveStatus } from '../../lib/utils';
import { useApp } from '../../context/AppContext';
import type { Customer, Order, OrderStatus } from '../../types';

interface CustomerListProps {
  customers: Customer[];
  orders: Order[];
  onCustomerClick: (c: Customer) => void;
  onNew: () => void;
}

export default function CustomerList({ customers, orders, onCustomerClick, onNew }: CustomerListProps) {
  const { vehiclesOf } = useApp();
  const [search, setSearch] = useState('');
  const [filterK, setFilterK] = useState<'all' | 'active' | 'inactive'>('all');

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    // Every vehicle of the customer is searchable (plate, make, model, VIN).
    const fz = vehiclesOf(c.id).map((v) => `${v.kennzeichen ?? ''} ${v.marke ?? ''} ${v.modell ?? ''} ${v.chassisnummer ?? ''}`).join(' ');
    const match = !q || `${c.vorname} ${c.nachname} ${c.telefon} ${fz}`.toLowerCase().includes(q);
    const as = getActiveStatus(orders, c.id);
    if (filterK === 'active' && !as) return false;
    if (filterK === 'inactive' && as) return false;
    return match;
  }).sort((a, b) => {
    const na = `${a.nachname} ${a.vorname}`.toLowerCase();
    const nb = `${b.nachname} ${b.vorname}`.toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  return (
    <div>
      <div className="page-head page-head-pad">
        <h1 className="sf-title1">Kunden</h1>
        <button onClick={onNew} className="btn-tinted">+ Neue</button>
      </div>

      <div className="search-bar-wrap">
        <div className="search-bar">
          <span className="search-icon">⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suche" autoComplete="off" />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label3)', padding: 0 }}>
              <SFXmark />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '8px 16px' }}>
        <div className="seg-ctrl" style={{ width: '100%', marginBottom: 12 }}>
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button key={f} className={`seg-item${filterK === f ? ' active' : ''}`} onClick={() => setFilterK(f)} style={{ flex: 1 }}>
              {f === 'all' ? 'Alle' : f === 'active' ? 'Aktiv' : 'Inaktiv'}
            </button>
          ))}
        </div>

        {!filtered.length && <div className="glass-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--label3)' }}>Keine Kunden gefunden.</div>}

        <div className="inset-grouped-list">
          {filtered.map((c) => {
            const as = getActiveStatus(orders, c.id) as OrderStatus | null;
            return (
              <div key={c.id} className="list-row" tabIndex={0} onClick={() => onCustomerClick(c)}>
                <div className="avatar">
                  {(c.vorname?.[0] ?? '').toUpperCase()}{(c.nachname?.[0] ?? '').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{c.vorname} {c.nachname}</div>
                  <div style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>{c.telefon}</div>
                  <div style={{ fontSize: 12, color: 'var(--label3)', marginTop: 1 }}>{c.kennzeichen}{c.marke ? ' · ' + c.marke : ''}{vehiclesOf(c.id).length > 1 ? ` · +${vehiclesOf(c.id).length - 1} Fahrzeug${vehiclesOf(c.id).length > 2 ? 'e' : ''}` : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {as ? <Badge status={as} small /> : <span style={{ fontSize: 11, color: 'var(--label3)' }}>Inaktiv</span>}
                  <span style={{ color: 'var(--label3)' }}><SFChevron /></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
