import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import type { Customer, ArbeitPosition, MaterialPosition, Offerte } from '../../types';

type ArbeitRow = ArbeitPosition & { zeLoading: boolean; zeHint: string };
type MaterialRow = MaterialPosition;

type OfferteData = Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>;

interface OfferteFormProps {
  customers: Customer[];
  onSave: (data: OfferteData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

function schaetzeZE(desc: string): string {
  const t = desc.toLowerCase();
  const rules: [RegExp, number][] = [[/oelwechsel|ölwechsel/, 2],[/inspektion|service/, 6],[/bremsen|bremsbelag/, 4],[/reifen|pneu/, 2],[/getriebe/, 10],[/kupplung/, 8],[/zahnriemen/, 8],[/batterie/, 1],[/diagnose/, 1],[/klima/, 3]];
  for (const [re, ze] of rules) if (re.test(t)) return String(ze);
  return '1';
}

async function schaetzeZEmitKI(beschreibung: string, fz: string): Promise<{ ze: string; begruendung: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 150,
      messages: [{ role: 'user', content: `Du bist Automechaniker Schweiz. Schätze ZE (1 ZE=0.6min) für:\nFahrzeug: ${fz}\nArbeit: ${beschreibung}\nNur JSON: {"ze":<Zahl>,"begruendung":"<max 60 Zeichen>"}` }] }),
  });
  const data = await res.json();
  const text = (data.content || []).map((b: { text?: string }) => b.text || '').join('');
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  return { ze: String(Math.round(parsed.ze)), begruendung: parsed.begruendung };
}

const newArbeit = (): ArbeitRow => ({ typ: 'arbeit', beschreibung: '', ze: '', stundenansatz: '80', preis: '', zeKI: false, zeLoading: false, zeHint: '' });
const newMaterial = (): MaterialRow => ({ typ: 'material', beschreibung: '', menge: '1', stueckpreis: '', preis: '' });

export default function OfferteForm({ customers, onSave, onCancel }: OfferteFormProps) {
  const [cid, setCid] = useState('');
  const [titel, setTitel] = useState('');
  const [tab, setTab] = useState<'arbeit' | 'material'>('arbeit');
  const [arbeit, setArbeit] = useState<ArbeitRow[]>([newArbeit()]);
  const [material, setMaterial] = useState<MaterialRow[]>([newMaterial()]);
  const [notizen, setNotizen] = useState('');
  const [gueltigBis, setGueltigBis] = useState('');

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;

  const addA = () => setArbeit((a) => [...a, newArbeit()]);
  const remA = (i: number) => setArbeit((a) => a.filter((_, j) => j !== i));
  const updA = (i: number, k: string, v: string) => setArbeit((a) => {
    const n = [...a]; n[i] = { ...n[i], [k]: v };
    if (k === 'beschreibung' && v.trim().length > 3) { n[i].ze = schaetzeZE(v); n[i].zeKI = false; n[i].zeHint = ''; }
    if (k === 'ze') { n[i].zeKI = false; n[i].zeHint = ''; }
    const ze = parseFloat(k === 'ze' ? v : n[i].ze) || 0;
    const sa = parseFloat(k === 'stundenansatz' ? v : n[i].stundenansatz) || 0;
    n[i].preis = ze && sa ? ((ze / 100) * sa).toFixed(2) : '';
    return n;
  });
  const kiZE = async (i: number) => {
    const pos = arbeit[i]; if (!pos.beschreibung.trim()) return;
    setArbeit((a) => { const n = [...a]; n[i] = { ...n[i], zeLoading: true }; return n; });
    try {
      const fz = selectedCustomer ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen, selectedCustomer.km ? selectedCustomer.km + 'km' : ''].filter(Boolean).join(' ') : 'unbekannt';
      const r = await schaetzeZEmitKI(pos.beschreibung, fz);
      setArbeit((a) => {
        const n = [...a]; const sa = parseFloat(n[i].stundenansatz) || 0; const ze = parseFloat(r.ze) || 0;
        n[i] = { ...n[i], ze: r.ze, zeKI: true, zeHint: r.begruendung, zeLoading: false, preis: ze && sa ? ((ze / 100) * sa).toFixed(2) : '' };
        return n;
      });
    } catch { setArbeit((a) => { const n = [...a]; n[i] = { ...n[i], zeLoading: false, zeHint: 'KI-Fehler' }; return n; }); }
  };

  const addM = () => setMaterial((m) => [...m, newMaterial()]);
  const remM = (i: number) => setMaterial((m) => m.filter((_, j) => j !== i));
  const updM = (i: number, k: string, v: string) => setMaterial((m) => {
    const n = [...m]; n[i] = { ...n[i], [k]: v };
    if (k === 'stueckpreis' || k === 'menge') {
      const sp = parseFloat(k === 'stueckpreis' ? v : n[i].stueckpreis) || 0;
      const mg = parseFloat(k === 'menge' ? v : n[i].menge) || 1;
      n[i].preis = (sp * mg).toFixed(2);
    }
    return n;
  });

  const totA = arbeit.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totM = material.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totZE = arbeit.reduce((s, p) => s + (parseFloat(p.ze) || 0), 0);

  function submit() {
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    const ap = arbeit.filter((p) => p.beschreibung.trim());
    const mp = material.filter((p) => p.beschreibung.trim());
    if (!ap.length && !mp.length) { showToast('Mindestens eine Position eingeben', 'error'); return; }
    onSave({ customerId: cid, titel, positionen: [...ap, ...mp], notizen, gueltigBis, totalBetrag: (totA + totM).toFixed(2), totalArbeit: totA.toFixed(2), totalMaterial: totM.toFixed(2), totalZE: totZE });
  }

  const inp = { display: 'block', width: '100%', padding: '8px 0', background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)' } as const;
  const fieldStyle = { width: '100%', background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: 8, fontSize: 15, color: 'var(--label)', outline: 'none' } as const;

  return (
    <div>
      <p className="section-header">Kunde</p>
      <div className="form-section" style={{ marginBottom: 20 }}>
        <div style={{ padding: '11px 16px', borderBottom: '0.33px solid var(--sep)' }}>
          <select value={cid} onChange={(e) => setCid(e.target.value)} style={{ ...inp, color: cid ? 'var(--label)' : 'var(--label3)' }}>
            <option value="">Kunde auswählen…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>)}
          </select>
        </div>
        <div style={{ padding: '11px 16px', borderBottom: '0.33px solid var(--sep)' }}>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel / Betreff" style={inp} />
        </div>
        <div style={{ padding: '11px 16px' }}>
          <input type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['Arbeit', `CHF ${totA.toFixed(2)}`, totZE ? `${totZE} ZE` : null, 'var(--blue)'],
          ['Material', `CHF ${totM.toFixed(2)}`, null, 'var(--green)'],
          ['Total', `CHF ${(totA + totM).toFixed(2)}`, null, 'var(--indigo)'],
        ].map(([l, v, sub, c]) => (
          <div key={String(l)} className="glass-panel" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: String(c) }}>{v}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--label3)' }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div className="doc-tab-bar">
        {(['arbeit', 'material'] as const).map((t) => (
          <button key={t} className={`doc-tab${tab === t ? ' dt-active' : ''}`} onClick={() => setTab(t)} aria-pressed={tab === t}>
            {t === 'arbeit' ? (
              <><svg width={15} height={15} viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M9.5 3.5a3.5 3.5 0 01-4.9 4.9L2 11a1.2 1.2 0 001.7 1.7L6.2 10A3.5 3.5 0 019.5 3.5zm.7-.7l-2 2 .8.8 2-2-.8-.8z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round"/></svg>Arbeit</>
            ) : (
              <><svg width={15} height={15} viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x={2} y={4} width={11} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2}/><path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"/></svg>Material</>
            )}
            <span className={`doc-tab-count${(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length ? ' has-items' : ''}`}>
              {(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        {tab === 'arbeit' && (
          <div>
            {arbeit.map((pos, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={pos.beschreibung} onChange={(e) => updA(i, 'beschreibung', e.target.value)} placeholder="Beschreibung der Arbeit…" style={{ flex: 1, background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 16, color: 'var(--label)', outline: 'none' }} />
                  {arbeit.length > 1 && <button onClick={() => remA(i)} style={{ background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 9, width: 38, height: 38, color: 'var(--red)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFXmark /></button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{pos.zeKI ? 'KI-ZE' : 'ZE'}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="number" value={pos.ze} onChange={(e) => updA(i, 'ze', e.target.value)} placeholder="Auto" min={0} style={{ flex: 1, background: pos.zeKI ? 'rgba(50,173,230,0.10)' : 'var(--fill3)', border: 'none', borderRadius: 9, padding: 8, fontSize: 15, color: pos.zeKI ? 'var(--teal)' : 'var(--label)', outline: 'none', fontWeight: pos.zeKI ? 700 : 400 }} />
                      <button onClick={() => kiZE(i)} disabled={pos.zeLoading || !pos.beschreibung.trim()} title="KI-Schätzung" style={{ width: 36, height: 36, background: pos.zeKI ? 'rgba(50,173,230,0.15)' : 'var(--fill2)', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (pos.zeLoading || !pos.beschreibung.trim()) ? 0.4 : 1, flexShrink: 0 }}>
                        {pos.zeLoading ? <Spinner size={16} /> : <span style={{ fontSize: 15 }}>✦</span>}
                      </button>
                    </div>
                    {pos.zeHint && <div style={{ fontSize: 11, color: pos.zeKI ? 'var(--teal)' : 'var(--red)', marginTop: 3 }}>{pos.zeHint}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CHF/h</div>
                    <input type="number" value={pos.stundenansatz} onChange={(e) => updA(i, 'stundenansatz', e.target.value)} placeholder="80" style={fieldStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                    <div style={{ background: 'rgba(0,122,255,0.08)', borderRadius: 9, padding: 8, fontSize: 15, fontWeight: 700, color: 'var(--blue)', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pos.preis ? parseFloat(pos.preis).toFixed(2) : '—'}</div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addA} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(0,122,255,0.38)', borderRadius: 12, padding: 11, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <SFPlus size={16} /> Arbeitsposition
            </button>
          </div>
        )}
        {tab === 'material' && (
          <div>
            {material.map((pos, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={pos.beschreibung} onChange={(e) => updM(i, 'beschreibung', e.target.value)} placeholder="Material / Ersatzteil…" style={{ flex: 1, background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 16, color: 'var(--label)', outline: 'none' }} />
                  {material.length > 1 && <button onClick={() => remM(i)} style={{ background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 9, width: 38, height: 38, color: 'var(--red)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFXmark /></button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Menge</div>
                    <input type="number" value={pos.menge} onChange={(e) => updM(i, 'menge', e.target.value)} min={1} style={fieldStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stk. CHF</div>
                    <input type="number" value={pos.stueckpreis} onChange={(e) => updM(i, 'stueckpreis', e.target.value)} placeholder="0.00" style={fieldStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                    <div style={{ background: 'rgba(52,199,89,0.10)', borderRadius: 9, padding: 8, fontSize: 15, fontWeight: 700, color: 'var(--green)', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pos.preis ? parseFloat(pos.preis).toFixed(2) : '—'}</div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addM} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(52,199,89,0.40)', borderRadius: 12, padding: 11, cursor: 'pointer', color: 'var(--green)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <SFPlus size={16} /> Materialposition
            </button>
          </div>
        )}
      </div>

      <p className="section-header">Notizen</p>
      <div className="form-section" style={{ marginBottom: 20 }}>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Interne Notizen…" rows={3} style={{ display: 'block', width: '100%', padding: '11px 16px', background: 'none', border: 'none', outline: 'none', fontSize: 17, color: 'var(--label)', resize: 'vertical' }} />
      </div>

      <button onClick={submit} className="btn-system" style={{ marginBottom: 12 }}>Offerte erstellen</button>
      <button onClick={onCancel} className="btn-system btn-secondary">Abbrechen</button>
    </div>
  );
}
