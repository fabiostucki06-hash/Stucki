import { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { FormCard, FormBar, VehicleChips, onEnterNextRow } from '../ui/DocForm';
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
  const [savingLocal, setSavingLocal] = useState(false);
  const busy = saving || savingLocal;
  const listRef = useRef<HTMLDivElement>(null);
  // A freshly added row takes focus, so the list can be typed top to bottom.
  const focusNew = useRef(false);

  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('[data-df-desc]');
    inputs?.[inputs.length - 1]?.focus();
  }, [bs.length]);

  const addB = () => { focusNew.current = true; setBs((p) => [...p, '']); };
  const updB = (i: number, v: string) => setBs((p) => { const n = [...p]; n[i] = v; return n; });
  const remB = (i: number) => setBs((p) => p.filter((_, j) => j !== i));

  async function submit() {
    if (busy) return;
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    const b = bs.filter((x) => x.trim());
    if (!b.length) { showToast('Mindestens eine Beanstandung eingeben', 'error'); return; }
    setSavingLocal(true);
    try {
      await onSave({ customerId: cid, beanstandungen: b, notizen });
    } catch (e) {
      console.error('[Auftrag] save failed:', e);
    } finally {
      setSavingLocal(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
       selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  const filled = bs.filter((x) => x.trim()).length;

  return (
    <div className="df">

      {/* ── 1: Kunde & Fahrzeug ── */}
      <FormCard title="Kunde & Fahrzeug">
        <div className="df-grid">
          <div className="cf-field df-span2">
            <label className="cf-label">Kunde *</label>
            {preCid && selectedCustomer ? (
              <div className="cf-input">{selectedCustomer.vorname} {selectedCustomer.nachname}</div>
            ) : (
              <select
                className="cf-select"
                value={cid}
                onChange={(e) => setCid(e.target.value)}
                style={{ color: cid ? 'var(--input-text)' : 'var(--input-placeholder)' }}
              >
                <option value="">Kunde auswählen…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>
                ))}
              </select>
            )}
          </div>
          {vehicleChips.length > 0 && <div className="df-span2"><VehicleChips chips={vehicleChips} /></div>}
        </div>
      </FormCard>

      {/* ── 2: Beanstandungen ── */}
      <FormCard title="Beanstandungen" hint="Enter fügt die nächste Zeile hinzu">
        <div ref={listRef}>
          {bs.map((b, i) => (
            <div key={i} className="df-line df-bean" onKeyDown={(e) => onEnterNextRow(e, i === bs.length - 1, addB)}>
              <span className="df-idx">{i + 1}</span>
              <input
                className="df-inp" data-df-desc="bean"
                value={b}
                onChange={(e) => updB(i, e.target.value)}
                placeholder={`Beanstandung ${i + 1}…`}
              />
              {bs.length > 1
                ? <button type="button" className="mf-bean-del" onClick={() => remB(i)} aria-label="Beanstandung entfernen"><SFXmark /></button>
                : <span />}
            </div>
          ))}
        </div>
        <button type="button" className="mf-add-bean" onClick={addB}><SFPlus size={12} /> Beanstandung</button>
      </FormCard>

      {/* ── 3: Notizen ── */}
      <FormCard title="Notizen">
        <textarea
          className="cf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zum Auftrag…"
          rows={3}
        />
      </FormCard>

      <FormBar label="Beanstandungen" value={String(filled)}>
        <button className="mf-btn-cancel" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button className="mf-btn-save" onClick={submit} disabled={busy}>
          {busy
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner size={12} /> Speichern…</span>
            : 'Auftrag erstellen'}
        </button>
      </FormBar>

    </div>
  );
}
