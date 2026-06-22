import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { SFPlus, SFXmark } from '../Icons';
import { isOverdue, daysSince, hoursSince } from '../../lib/utils';
import { SC, SO } from '../../constants/statuses';
import { exportOrderPDF } from '../../lib/pdf-auftrag';
import type { ArbeitPosition, Customer, MaterialPosition, Order, OrderItem, OrderStatus } from '../../types';

interface OrderDetailProps {
  order: Order;
  customer: Customer | undefined;
  onClose: () => void;
  onUpdate: (upd: Order, cp: Partial<Customer> | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  defaultEdit?: boolean;
}

export default function OrderDetail({ order, customer, onClose, onUpdate, onDelete, defaultEdit }: OrderDetailProps) {
  const [edit, setEdit] = useState(defaultEdit ?? false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [bs, setBs] = useState((order.beanstandungen ?? ['']).filter((b) => !b.trim().toLowerCase().includes('offerte')));
  const [notizen, setNotizen] = useState(order.notizen ?? '');
  const [items] = useState<OrderItem[]>(order.offertItems ?? []);
  const offB = order.offertBetrag ?? '';
  const [recB, setRecB] = useState(order.rechnungsBetrag ?? '');
  const [zahlungsFrist, setZahlungsFrist] = useState(order.zahlungsFrist ?? '30');
  const [cv, setCv] = useState(customer?.vorname ?? '');
  const [cn, setCn] = useState(customer?.nachname ?? '');
  const [ct, setCt] = useState(customer?.telefon ?? '');
  const [ck, setCk] = useState(customer?.kennzeichen ?? '');
  const [cm, setCm] = useState(customer?.modell ?? '');
  const [cma, setCma] = useState(customer?.marke ?? '');
  const [editCust, setEditCust] = useState(false);

  const ov = isOverdue({ ...order, status });
  const d = daysSince(order.statusChangedAt); const hh = hoursSince(order.statusChangedAt);

  const addB = () => setBs((p) => [...p, '']);
  const updB = (i: number, v: string) => setBs((p) => { const n = [...p]; n[i] = v; return n; });
  const remB = (i: number) => setBs((p) => p.filter((_, j) => j !== i));

  async function save() {
    setSaving(true);
    const upd: Order = { ...order, status, beanstandungen: bs.filter((x) => x.trim()), notizen, offertItems: items, offertBetrag: offB, rechnungsBetrag: recB, zahlungsFrist };
    if (status !== order.status) upd.statusChangedAt = new Date().toISOString();
    const cp = editCust ? { vorname: cv, nachname: cn, telefon: ct, kennzeichen: ck, modell: cm, marke: cma } : null;
    await onUpdate(upd, cp); setSaving(false); setEdit(false); setEditCust(false);
  }

  async function saveStatus(ns: OrderStatus) {
    setStatus(ns); setSaving(true);
    const upd: Order = { ...order, status: ns, beanstandungen: bs.filter((x) => x.trim()), notizen, offertItems: items, offertBetrag: offB, rechnungsBetrag: recB, zahlungsFrist, statusChangedAt: new Date().toISOString() };
    await onUpdate(upd, null); setSaving(false);
  }

  const inp2 = { display: 'block', width: '100%', background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 16, color: 'var(--label)', outline: 'none' } as const;

  return (
    <Sheet
      title={`Auftrag #${order.orderNumber}`} onClose={onClose} full
      barLeft={
        <div style={{ minWidth: 60, display: 'flex', alignItems: 'center', gap: 6 }}>
          {edit && <button onClick={save} disabled={saving} className="bar-btn" style={{ color: 'var(--blue)', fontWeight: 600 }}>{saving ? '…' : 'Sichern'}</button>}
        </div>
      }
      barRight={
        <div style={{ display: 'flex', gap: 4, minWidth: 60, justifyContent: 'flex-end' }}>
          {!edit && <button onClick={() => setEdit(true)} className="bar-btn">Bearbeiten</button>}
          {edit && <button onClick={() => { setEdit(false); setEditCust(false); }} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}
        </div>
      }
    >
      {ov && (
        <div className="alert-banner alert-danger" style={{ marginBottom: 12 }}>
          <span>⚠️</span>
          <span className="sf-subhead">{status === 'offerte_versendet' ? 'Offerte >48h ohne Antwort' : 'Zahlung überfällig'}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Badge status={status} />
        <span style={{ fontSize: 13, color: 'var(--label3)' }}>{d < 1 ? `${hh} Std.` : `${d} Tage`}</span>
        {saving && <Spinner size={16} />}
      </div>

      <p className="section-header">Status</p>
      <div className="h-scroll" style={{ marginBottom: 20 }}>
        {SO.map((s) => (
          <button key={s} onClick={() => saveStatus(s)} disabled={saving} className={`pill-btn ${status === s ? 'pill-btn-active' : 'pill-btn-inactive'}`} style={{ opacity: saving ? 0.5 : 1 }}>
            {SC[s].short}
          </button>
        ))}
      </div>

      <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
        <div className="list-row" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div className="sf-headline">{customer?.vorname ?? ''} {customer?.nachname ?? ''}</div>
            <div className="sf-subhead" style={{ color: 'var(--label2)' }}>{customer?.telefon} · {customer?.kennzeichen}</div>
          </div>
          {edit && (
            <button onClick={() => setEditCust((p) => !p)} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}>
              {editCust ? 'Fertig' : 'Bearbeiten'}
            </button>
          )}
        </div>
        {editCust && edit && (
          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([['vorname', cv, setCv], ['nachname', cn, setCn], ['telefon', ct, setCt], ['kennzeichen', ck, setCk], ['marke', cma, setCma], ['modell', cm, setCm]] as [string, string, (v: string) => void][]).map(([k, v, setter]) => (
              <input key={k} value={v} onChange={(e) => setter(e.target.value)} placeholder={{ vorname: 'Vorname', nachname: 'Nachname', telefon: 'Telefon', kennzeichen: 'Kennzeichen', marke: 'Marke', modell: 'Modell' }[k]} style={inp2} />
            ))}
          </div>
        )}
      </div>

      <p className="section-header">Beanstandungen</p>
      {edit ? (
        <div style={{ marginBottom: 20 }}>
          {bs.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input value={b} onChange={(e) => updB(i, e.target.value)} placeholder={`Beanstandung ${i + 1}`} style={{ ...inp2, flex: 1 }} />
              {bs.length > 1 && (
                <button onClick={() => remB(i)} style={{ background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 9, width: 38, height: 38, color: 'var(--red)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFXmark />
                </button>
              )}
            </div>
          ))}
          <button onClick={addB} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(0,122,255,0.38)', borderRadius: 12, padding: 10, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <SFPlus size={16} /> Hinzufügen
          </button>
        </div>
      ) : (
        <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
          {(order.beanstandungen ?? [])
            .filter((b) => b.trim() !== '' && !b.trim().toLowerCase().includes('offerte'))
            .map((b, i) => (
              <div key={i} className="list-row" style={{ cursor: 'default' }}>
                <span style={{ fontWeight: 600, color: 'var(--blue)', marginRight: 8, fontSize: 13 }}>{i + 1}.</span>
                <span className="sf-subhead">{b}</span>
              </div>
            ))}
        </div>
      )}


      {/* ── Positionen (copied from Offerte) ── */}
      {(order.positionen ?? []).length > 0 && (
        <>
          <p className="section-header">Positionen</p>
          <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
            {(order.positionen ?? []).map((pos, i) => {
              const ap = pos.typ === 'arbeit'   ? (pos as ArbeitPosition)   : null;
              const mp = pos.typ === 'material' ? (pos as MaterialPosition) : null;
              return (
                <div key={i} className="list-row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div className="sf-subhead">{pos.beschreibung}</div>
                    <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {ap
                        ? `Arbeit${ap.ze ? ` · ${ap.ze} ZE` : ''}${ap.stundenansatz ? ` · CHF ${ap.stundenansatz}/Std` : ''}`
                        : `Material${mp?.menge ? ` · ${mp.menge}×` : ''}${mp?.stueckpreis ? ` · CHF ${mp.stueckpreis}/Stk` : ''}`
                      }
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--label)', flexShrink: 0 }}>
                    CHF {parseFloat(pos.preis || '0').toFixed(2)}
                  </div>
                </div>
              );
            })}
            <div className="list-row" style={{ cursor: 'default', background: 'rgba(0,122,255,0.06)' }}>
              <div className="sf-headline" style={{ flex: 1 }}>Total Positionen</div>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)' }}>
                CHF {(order.positionen ?? []).reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0).toFixed(2)}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="section-header">Rechnung</p>
      {edit ? (
        <div className="form-section" style={{ marginBottom: 20 }}>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Rechnungsbetrag</div>
              <div style={{ fontSize: 13, color: 'var(--label3)' }}>Gesamtbetrag in CHF</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--label2)' }}>CHF</span>
              <input
                type="number"
                value={recB}
                onChange={(e) => setRecB(e.target.value)}
                placeholder="0.00"
                min={0}
                step="0.05"
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 22, fontWeight: 700, color: 'var(--blue)', textAlign: 'right', width: 120, letterSpacing: '-0.4px', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.45)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.60)',
          borderRadius: 16,
          padding: '20px 22px',
          marginBottom: 20,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70), 0 8px 32px 0 rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Total Rechnung</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px', color: recB ? 'var(--blue)' : 'var(--label3)' }}>
              {recB ? `CHF ${recB}` : '–'}
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: recB ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
          }}>
            🧾
          </div>
        </div>
      )}

      {edit && (status === 'zahlung_versendet' || status === 'zahlung_erhalten') && (
        <>
          <p className="section-header">Zahlungsfrist</p>
          <div className="form-section" style={{ marginBottom: 16 }}>
            <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, color: 'var(--label2)' }}>Zahlungsziel (Tage, Standard: 30)</span>
              <input type="number" value={zahlungsFrist} onChange={(e) => setZahlungsFrist(e.target.value)} placeholder="10" min={1} style={{ background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', textAlign: 'right', width: 60 }} />
            </div>
          </div>
        </>
      )}

      {!edit && zahlungsFrist && (status === 'zahlung_versendet' || status === 'zahlung_erhalten') && (() => {
        const frist = parseInt(zahlungsFrist); const vergangen = daysSince(order.statusChangedAt); const verbl = frist - vergangen; const abg = verbl < 0;
        return (
          <div className={`alert-banner ${abg ? 'alert-danger' : 'alert-warning'}`} style={{ marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Zahlungsfrist</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{abg ? `${Math.abs(verbl)} Tage überfällig!` : `${verbl} Tage verbleibend`}</div>
            </div>
          </div>
        );
      })()}

      {edit ? (
        <>
          <p className="section-header">Notizen</p>
          <div className="form-section" style={{ marginBottom: 16 }}>
            <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Interne Notizen…" rows={3} style={{ display: 'block', width: '100%', padding: '11px 16px', background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)', resize: 'vertical' }} />
          </div>
        </>
      ) : notizen ? (
        <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16 }}>{notizen}</div>
      ) : null}

      <button onClick={() => exportOrderPDF(order, customer)} className="btn-system btn-secondary" style={{ marginBottom: 12 }}>↓  PDF herunterladen</button>
      <button onClick={async () => { if (window.confirm('Auftrag wirklich löschen?')) await onDelete(order.id); }} className="btn-system btn-destructive" style={{ marginBottom: 12 }}>Auftrag löschen</button>
      <div style={{ fontSize: 13, color: 'var(--label3)', textAlign: 'center', paddingBottom: 8 }}>Erstellt: {new Date(order.createdAt).toLocaleDateString('de-CH')} · #{order.orderNumber}</div>
    </Sheet>
  );
}
