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
  const [cid, setCid]       = useState(preCid ?? '');
  const [bs, setBs]         = useState(['']);
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
      {!preCid && (
        <>
          <div className="cf-section-title">Kunde</div>
          <div className="cf-group" style={{ marginBottom: vehicleChips.length ? 6 : 12 }}>
            <div className="cf-field">
              <label className="cf-label">Kunde auswählen *</label>
              <select
                className="cf-select"
                value={cid}
                onChange={(e) => setCid(e.target.value)}
                style={{ color: cid ? 'var(--label)' : 'var(--label3)' }}
              >
                <option value="">Kunde auswählen…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>
                ))}
              </select>
            </div>
            {vehicleChips.length > 0 && (
              <div className="vehicle-chips-bar">
                <span style={{ fontSize: 12 }}>🚗</span>
                {vehicleChips.map((v, i) => <span key={i} className="vehicle-chip">{v}</span>)}
              </div>
            )}
          </div>
        </>
      )}

      {preCid && vehicleChips.length > 0 && (
        <div className="vehicle-chips-bar" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12 }}>🚗</span>
          {vehicleChips.map((v, i) => <span key={i} className="vehicle-chip">{v}</span>)}
        </div>
      )}

      <div className="cf-section-title">Beanstandungen</div>
      <div style={{ marginBottom: 12 }}>
        {bs.map((b, i) => (
          <div key={i} className="bean-row">
            <div className="bean-num">{String(i + 1).padStart(2, '0')}</div>
            <div className="bean-input-wrap">
              <input
                className="bean-input"
                value={b}
                onChange={(e) => updB(i, e.target.value)}
                placeholder={`Beanstandung ${i + 1}…`}
              />
            </div>
            {bs.length > 1 && (
              <button className="bean-del" onClick={() => remB(i)}><SFXmark /></button>
            )}
          </div>
        ))}
        <button
          onClick={addB}
          style={{
            width: '100%', background: 'transparent',
            border: '1.5px dashed rgba(0,122,255,0.28)', borderRadius: 8,
            padding: '7px 12px', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            color: 'var(--blue)', marginTop: 4, transition: 'background 0.12s',
          }}
        >
          <SFPlus size={12} /> Beanstandung hinzufügen
        </button>
      </div>

      <div className="cf-section-title">Notizen</div>
      <div className="cf-group">
        <textarea
          className="cf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zum Auftrag…"
          rows={3}
        />
      </div>

      <div className="cf-actions">
        <button className="cf-btn-cancel" onClick={onCancel}>Abbrechen</button>
        <button className="cf-btn-save" onClick={submit} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Auftrag erstellen'}
        </button>
      </div>
    </div>
  );
}
