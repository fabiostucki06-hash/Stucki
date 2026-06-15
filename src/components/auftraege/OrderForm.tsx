import { useState } from 'react';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import type { Customer, Order } from '../../types';

type OrderData = Pick<Order, 'customerId' | 'beanstandungen' | 'notizen'>;

interface OrderFormProps {
  customers: Customer[];
  customerId?: string;
  onSave: (data: OrderData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export default function OrderForm({ customers, customerId: preCid, onSave, onCancel, saving }: OrderFormProps) {
  const [cid,     setCid]     = useState(preCid ?? '');
  const [bs,      setBs]      = useState(['']);
  const [notizen, setNotizen] = useState('');

  const addB = () => setBs((p) => [...p, '']);
  const updB = (i: number, v: string) => setBs((p) => { const n = [...p]; n[i] = v; return n; });
  const remB = (i: number) => setBs((p) => p.filter((_, j) => j !== i));

  function submit() {
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    const b = bs.filter((x) => x.trim());
    if (!b.length) { showToast('Mindestens eine Beanstandung eingeben', 'error'); return; }
    onSave({ customerId: cid, beanstandungen: b, notizen });
  }

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
       selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  return (
    <div>

      {/* ── Kunde ── */}
      {!preCid && (
        <div className="mf-section">
          <span className="mf-section-label">Kunde</span>
          <select
            className="mf-select"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            style={{ color: cid ? 'var(--label)' : 'var(--label3)' }}
          >
            <option value="">Kunde auswählen…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>
            ))}
          </select>
          {vehicleChips.length > 0 && (
            <div className="mf-chips" style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11 }}>🚗</span>
              {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
            </div>
          )}
        </div>
      )}

      {preCid && vehicleChips.length > 0 && (
        <div className="mf-chips" style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11 }}>🚗</span>
          {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
        </div>
      )}

      {/* ── Beanstandungen ── */}
      <div className="mf-section">
        <span className="mf-section-label">Beanstandungen</span>
        {bs.map((b, i) => (
          <div key={i} className="mf-bean-row">
            <span className="mf-bean-idx">{i + 1}</span>
            <input
              className="mf-bean-inp"
              value={b}
              onChange={(e) => updB(i, e.target.value)}
              placeholder={`Beanstandung ${i + 1}…`}
            />
            {bs.length > 1 && (
              <button className="mf-bean-del" onClick={() => remB(i)}><SFXmark /></button>
            )}
          </div>
        ))}
        <button className="mf-add-bean" onClick={addB}><SFPlus size={12} /> Beanstandung hinzufügen</button>
      </div>

      {/* ── Notizen ── */}
      <div className="mf-section">
        <span className="mf-section-label">Notizen</span>
        <textarea
          className="mf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zum Auftrag…"
          rows={3}
        />
      </div>

      {/* ── Actions ── */}
      <div className="mf-actions">
        <button className="mf-btn-save" onClick={submit} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Auftrag erstellen'}
        </button>
        <button className="mf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>

    </div>
  );
}
