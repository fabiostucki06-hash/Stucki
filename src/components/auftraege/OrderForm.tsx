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

  /* ── shared style tokens ── */
  const gc: React.CSSProperties = {
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(64px) saturate(240%)',
    WebkitBackdropFilter: 'blur(64px) saturate(240%)',
    border: '1px solid rgba(255,255,255,0.20)',
    borderRadius: 18,
    padding: '16px 18px',
    marginBottom: 14,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), 0 4px 24px rgba(0,0,0,0.06)',
  };
  const gcHdr: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--label2)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 13, display: 'block',
    textShadow: '0 1px 3px rgba(0,0,0,0.30)',
  };

  return (
    <div>

      {/* ── Section 1: Kunde (only when not pre-filled) ── */}
      {!preCid && (
        <div style={gc}>
          <span style={gcHdr}>Kunde</span>
          <div className="cf-field">
            <label className="cf-label">Kunde *</label>
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
            <div className="mf-chips" style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11 }}>🚗</span>
              {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
            </div>
          )}
        </div>
      )}

      {/* Vehicle chips when customer is pre-filled */}
      {preCid && vehicleChips.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 14px', marginBottom: 14,
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 12,
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🚗</span>
          <div className="mf-chips" style={{ padding: 0 }}>
            {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
          </div>
        </div>
      )}

      {/* ── Section 2: Beanstandungen ── */}
      <div style={gc}>
        <span style={gcHdr}>Beanstandungen</span>
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

      {/* ── Section 3: Notizen ── */}
      <div style={gc}>
        <span style={gcHdr}>Notizen</span>
        <textarea
          className="cf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zum Auftrag…"
          rows={3}
          style={{ marginBottom: 0 }}
        />
      </div>

      {/* ── Actions: side-by-side ── */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 4, paddingBottom: 8 }}>
        <button
          className="mf-btn-cancel"
          onClick={onCancel}
          style={{ flex: '0 0 auto', width: 110, height: 50, borderRadius: 14, fontSize: 15 }}
        >
          Abbrechen
        </button>
        <button className="mf-btn-save" onClick={submit} disabled={saving} style={{ flex: 1, height: 50 }}>
          {saving ? 'Wird gespeichert…' : 'Auftrag erstellen'}
        </button>
      </div>

    </div>
  );
}
