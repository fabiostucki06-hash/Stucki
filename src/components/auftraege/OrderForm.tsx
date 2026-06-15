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
  const [cid, setCid] = useState(preCid ?? '');
  const [bs, setBs] = useState(['']);
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

  const inp = { display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', letterSpacing: '-0.3px' } as const;
  const miniLabel = { fontSize: 11, fontWeight: 600 as const, color: 'var(--label3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 };

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen, selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  return (
    <div>
      {!preCid && (
        <>
          <p className="section-header">Kundeninformationen</p>
          <div className="form-section" style={{ marginBottom: 20 }}>
            <div style={{ padding: '13px 16px', borderBottom: vehicleChips.length ? '0.33px solid var(--sep)' : undefined }}>
              <div style={miniLabel}>Kunde</div>
              <select value={cid} onChange={(e) => setCid(e.target.value)} style={{ ...inp, color: cid ? 'var(--label)' : 'var(--label3)' }}>
                <option value="">Kunde auswählen…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>)}
              </select>
            </div>
            {vehicleChips.length > 0 && (
              <div style={{ padding: '8px 14px 10px', display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, marginRight: 2 }}>🚗</span>
                {vehicleChips.map((v, i) => (
                  <span key={i} style={{ fontSize: 12, color: 'var(--blue)', background: 'rgba(0,122,255,0.09)', borderRadius: 6, padding: '2px 8px', fontWeight: 500, letterSpacing: '-0.1px' }}>{v}</span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {preCid && vehicleChips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: 'rgba(0,122,255,0.06)', borderRadius: 12, border: '1px solid rgba(0,122,255,0.12)' }}>
          <span style={{ fontSize: 13, marginRight: 2 }}>🚗</span>
          {vehicleChips.map((v, i) => (
            <span key={i} style={{ fontSize: 12, color: 'var(--blue)', background: 'rgba(0,122,255,0.10)', borderRadius: 6, padding: '2px 8px', fontWeight: 500 }}>{v}</span>
          ))}
        </div>
      )}

      <p className="section-header">Beanstandungen</p>
      <div style={{ marginBottom: 20 }}>
        {bs.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,122,255,0.10)', color: 'var(--blue)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.50)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center' }}>
              <input value={b} onChange={(e) => updB(i, e.target.value)} placeholder={`Beanstandung ${i + 1}…`} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', letterSpacing: '-0.3px' }} />
            </div>
            {bs.length > 1 && (
              <button onClick={() => remB(i)} style={{ background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 12, width: 44, height: 44, color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFXmark />
              </button>
            )}
          </div>
        ))}
        <button onClick={addB} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(0,122,255,0.38)', borderRadius: 12, padding: 12, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SFPlus size={16} /> Beanstandung hinzufügen
        </button>
      </div>

      <p className="section-header">Notizen</p>
      <div className="form-section" style={{ marginBottom: 24 }}>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Interne Notizen zum Auftrag…" rows={3} style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', resize: 'vertical', letterSpacing: '-0.3px' }} />
      </div>

      <div style={{ borderTop: '0.33px solid var(--sep)', paddingTop: 20 }}>
        <button onClick={submit} disabled={saving} className="btn-system" style={{ marginBottom: 10 }}>{saving ? 'Wird gespeichert…' : 'Auftrag erstellen'}</button>
        <button onClick={onCancel} className="btn-system btn-secondary">Abbrechen</button>
      </div>
    </div>
  );
}
