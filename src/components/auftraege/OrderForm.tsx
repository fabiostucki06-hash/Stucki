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

  const inp = { display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)' } as const;

  return (
    <div>
      {!preCid && (
        <>
          <p className="section-header">Kunde</p>
          <div className="form-section" style={{ marginBottom: 20 }}>
            <div style={{ padding: '11px 16px' }}>
              <select value={cid} onChange={(e) => setCid(e.target.value)} style={{ ...inp, color: cid ? 'var(--label)' : 'var(--label3)' }}>
                <option value="">Kunde auswählen…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <p className="section-header">Beanstandungen</p>
      <div style={{ marginBottom: 20 }}>
        {bs.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.50)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center' }}>
              <input value={b} onChange={(e) => updB(i, e.target.value)} placeholder={`Beanstandung ${i + 1}…`} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)' }} />
            </div>
            {bs.length > 1 && (
              <button onClick={() => remB(i)} style={{ background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 12, width: 44, height: 44, color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFXmark />
              </button>
            )}
          </div>
        ))}
        <button onClick={addB} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(0,122,255,0.38)', borderRadius: 12, padding: 11, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <SFPlus size={16} /> Beanstandung hinzufügen
        </button>
      </div>

      <p className="section-header">Notizen</p>
      <div className="form-section" style={{ marginBottom: 20 }}>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Interne Notizen…" rows={3} style={{ display: 'block', width: '100%', padding: '11px 16px', background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)', resize: 'vertical' }} />
      </div>

      <button onClick={submit} disabled={saving} className="btn-system" style={{ marginBottom: 12 }}>{saving ? 'Wird gespeichert…' : 'Auftrag erstellen'}</button>
      <button onClick={onCancel} className="btn-system btn-secondary">Abbrechen</button>
    </div>
  );
}
