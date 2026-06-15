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

const fCHF = (n: number) => "CHF " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

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

  const inp = { display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', letterSpacing: '-0.3px' } as const;
  const fieldStyle = { width: '100%', background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '8px 10px', fontSize: 15, color: 'var(--label)', outline: 'none' } as const;
  const miniLabel = { fontSize: 11, fontWeight: 600 as const, color: 'var(--label3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 };

  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen, selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  return (
    <div>
      {/* ── Kundeninformationen ── */}
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

      {/* ── Offerte-Details ── */}
      <p className="section-header">Offerte-Details</p>
      <div className="form-section" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          <div style={{ padding: '13px 16px', borderRight: '0.33px solid var(--sep)' }}>
            <div style={miniLabel}>Betreff</div>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" style={inp} />
          </div>
          <div style={{ padding: '13px 16px' }}>
            <div style={miniLabel}>Gültig bis</div>
            <input type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} style={{ ...inp, fontSize: 15 }} />
          </div>
        </div>
      </div>

      {/* ── Totals Bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([
          ['Arbeit', fCHF(totA), totZE ? `${totZE} ZE` : null, 'var(--blue)'],
          ['Material', fCHF(totM), null, 'var(--green)'],
          ['Total', fCHF(totA + totM), null, 'var(--indigo)'],
        ] as [string, string, string | null, string][]).map(([l, v, sub, c]) => (
          <div key={l} className="glass-panel" style={{ flex: 1, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c, letterSpacing: '-0.3px' }}>{v}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Positionen ── */}
      <p className="section-header">Positionen</p>

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
              <div key={i} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={miniLabel}>Beschreibung</div>
                    <input value={pos.beschreibung} onChange={(e) => updA(i, 'beschreibung', e.target.value)} placeholder="Arbeitsschritt beschreiben…" style={{ width: '100%', background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 15, color: 'var(--label)', outline: 'none' }} />
                  </div>
                  {arbeit.length > 1 && (
                    <button onClick={() => remA(i)} style={{ marginTop: 18, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 9, width: 36, height: 36, color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFXmark />
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={miniLabel}>{pos.zeKI ? '✦ KI-ZE' : 'ZE'}</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <input type="number" value={pos.ze} onChange={(e) => updA(i, 'ze', e.target.value)} placeholder="Auto" min={0} style={{ flex: 1, background: pos.zeKI ? 'rgba(50,173,230,0.10)' : 'var(--fill3)', border: 'none', borderRadius: 9, padding: '8px 10px', fontSize: 15, color: pos.zeKI ? 'var(--teal)' : 'var(--label)', outline: 'none', fontWeight: pos.zeKI ? 700 : 400 }} />
                      <button onClick={() => kiZE(i)} disabled={pos.zeLoading || !pos.beschreibung.trim()} title="KI-Schätzung" style={{ width: 35, height: 35, background: pos.zeKI ? 'rgba(50,173,230,0.15)' : 'var(--fill2)', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (pos.zeLoading || !pos.beschreibung.trim()) ? 0.4 : 1, flexShrink: 0 }}>
                        {pos.zeLoading ? <Spinner size={15} /> : <span style={{ fontSize: 14 }}>✦</span>}
                      </button>
                    </div>
                    {pos.zeHint && <div style={{ fontSize: 10, color: pos.zeKI ? 'var(--teal)' : 'var(--red)', marginTop: 3, lineHeight: 1.3 }}>{pos.zeHint}</div>}
                  </div>
                  <div>
                    <div style={miniLabel}>CHF / h</div>
                    <input type="number" value={pos.stundenansatz} onChange={(e) => updA(i, 'stundenansatz', e.target.value)} placeholder="80" style={fieldStyle} />
                  </div>
                  <div>
                    <div style={miniLabel}>Total</div>
                    <div style={{ background: 'rgba(0,122,255,0.08)', borderRadius: 9, padding: '8px 10px', fontSize: 14, fontWeight: 700, color: 'var(--blue)', height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.2px' }}>
                      {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addA} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(0,122,255,0.38)', borderRadius: 12, padding: 12, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <SFPlus size={16} /> Arbeitsposition
            </button>
          </div>
        )}
        {tab === 'material' && (
          <div>
            {material.map((pos, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={miniLabel}>Beschreibung</div>
                    <input value={pos.beschreibung} onChange={(e) => updM(i, 'beschreibung', e.target.value)} placeholder="Ersatzteil / Material…" style={{ width: '100%', background: 'var(--fill3)', border: 'none', borderRadius: 9, padding: '9px 12px', fontSize: 15, color: 'var(--label)', outline: 'none' }} />
                  </div>
                  {material.length > 1 && (
                    <button onClick={() => remM(i)} style={{ marginTop: 18, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 9, width: 36, height: 36, color: 'var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFXmark />
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={miniLabel}>Menge</div>
                    <input type="number" value={pos.menge} onChange={(e) => updM(i, 'menge', e.target.value)} min={1} style={fieldStyle} />
                  </div>
                  <div>
                    <div style={miniLabel}>Stk. CHF</div>
                    <input type="number" value={pos.stueckpreis} onChange={(e) => updM(i, 'stueckpreis', e.target.value)} placeholder="0.00" style={fieldStyle} />
                  </div>
                  <div>
                    <div style={miniLabel}>Total</div>
                    <div style={{ background: 'rgba(52,199,89,0.10)', borderRadius: 9, padding: '8px 10px', fontSize: 14, fontWeight: 700, color: 'var(--green)', height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.2px' }}>
                      {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addM} style={{ width: '100%', background: 'rgba(255,255,255,0.50)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px dashed rgba(52,199,89,0.40)', borderRadius: 12, padding: 12, cursor: 'pointer', color: 'var(--green)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <SFPlus size={16} /> Materialposition
            </button>
          </div>
        )}
      </div>

      {/* ── Notizen ── */}
      <p className="section-header">Notizen</p>
      <div className="form-section" style={{ marginBottom: 24 }}>
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Interne Notizen zur Offerte…" rows={3} style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'none', border: 'none', outline: 'none', fontSize: 16, color: 'var(--label)', resize: 'vertical', letterSpacing: '-0.3px' }} />
      </div>

      {/* ── Actions ── */}
      <div style={{ borderTop: '0.33px solid var(--sep)', paddingTop: 20 }}>
        <button onClick={submit} className="btn-system" style={{ marginBottom: 10 }}>Offerte erstellen</button>
        <button onClick={onCancel} className="btn-system btn-secondary">Abbrechen</button>
      </div>
    </div>
  );
}
