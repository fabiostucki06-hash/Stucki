import { useState } from 'react';
import { showToast } from '../ui/Toast';
import type { Customer, Order } from '../../types';

interface RechnungFormProps {
  orders: Order[];
  customers: Customer[];
  onSave: (orderId: string, betrag: string, zahlungsFrist: string) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export default function RechnungForm({ orders, customers, onSave, onCancel, saving }: RechnungFormProps) {
  const [orderId, setOrderId] = useState('');
  const [betrag, setBetrag] = useState('');
  const [zahlungsFrist, setZahlungsFrist] = useState('30');

  const availableOrders = orders
    .filter((o) => o.status !== 'abgeschlossen')
    .sort((a, b) => b.orderNumber - a.orderNumber);

  const selectedOrder = orders.find((o) => o.id === orderId) ?? null;
  const selectedCustomer = selectedOrder
    ? customers.find((c) => c.id === selectedOrder.customerId)
    : null;

  function submit() {
    if (!orderId) { showToast('Bitte einen Auftrag auswählen', 'error'); return; }
    if (!betrag || parseFloat(betrag) <= 0) { showToast('Bitte einen gültigen Betrag eingeben', 'error'); return; }
    onSave(orderId, betrag, zahlungsFrist);
  }

  return (
    <div>

      {/* ── Auftrag ── */}
      <div className="mf-section">
        <span className="mf-section-label">Auftrag</span>
        <select
          className="mf-select"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          style={{ color: orderId ? 'var(--label)' : 'var(--label3)' }}
        >
          <option value="">Auftrag auswählen…</option>
          {availableOrders.map((o) => {
            const c = customers.find((x) => x.id === o.customerId);
            return (
              <option key={o.id} value={o.id}>
                #{o.orderNumber} – {c?.vorname ?? ''} {c?.nachname ?? ''}
                {c?.kennzeichen ? ` (${c.kennzeichen})` : ''}
              </option>
            );
          })}
        </select>
        {selectedCustomer && (
          <div className="mf-chips" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 11 }}>🚗</span>
            {[selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen]
              .filter(Boolean)
              .map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
          </div>
        )}
      </div>

      {/* ── Rechnungsbetrag ── */}
      <div className="mf-section">
        <span className="mf-section-label">Rechnungsbetrag</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--label2)', flexShrink: 0 }}>CHF</span>
          <input
            type="number"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            placeholder="0.00"
            min={0}
            step="0.05"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 26, fontWeight: 700, color: 'var(--blue)', letterSpacing: '-0.5px', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* ── Zahlungsfrist ── */}
      <div className="mf-section">
        <span className="mf-section-label">Zahlungsfrist</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 10 }}>
          <span style={{ fontSize: 15, color: 'var(--label2)' }}>Zahlungsziel (Tage)</span>
          <input
            type="number"
            value={zahlungsFrist}
            onChange={(e) => setZahlungsFrist(e.target.value)}
            min={1}
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 15, color: 'var(--label)', textAlign: 'right', width: 56, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="mf-actions">
        <button className="mf-btn-save" onClick={submit} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Rechnung erstellen'}
        </button>
        <button className="mf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>

    </div>
  );
}
