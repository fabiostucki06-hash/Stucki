import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import type { Customer, ArbeitPosition, MaterialPosition, Offerte } from '../../types';

type ArbeitRow  = ArbeitPosition  & { zeLoading: boolean; zeHint: string };
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
  const rules: [RegExp, number][] = [
    [/oelwechsel|ölwechsel/, 2],[/inspektion|service/, 6],[/bremsen|bremsbelag/, 4],
    [/reifen|pneu/, 2],[/getriebe/, 10],[/kupplung/, 8],[/zahnriemen/, 8],
    [/batterie/, 1],[/diagnose/, 1],[/klima/, 3],
  ];
  for (const [re, ze] of rules) if (re.test(t)) return String(ze);
  return '1';
}

async function schaetzeZEmitKI(beschreibung: string, fz: string): Promise<{ ze: string; begruendung: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 150,
      messages: [{ role: 'user', content: `Du bist Automechaniker Schweiz. Schätze ZE (1 ZE=0.6min) für:\nFahrzeug: ${fz}\nArbeit: ${beschreibung}\nNur JSON: {"ze":<Zahl>,"begruendung":"<max 60 Zeichen>"}` }],
    }),
  });
  const data = await res.json();
  const text = (data.content || []).map((b: { text?: string }) => b.text || '').join('');
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  return { ze: String(Math.round(parsed.ze)), begruendung: parsed.begruendung };
}

const newArbeit   = (): ArbeitRow   => ({ typ: 'arbeit',   beschreibung: '', ze: '', stundenansatz: '80', preis: '', zeKI: false, zeLoading: false, zeHint: '' });
const newMaterial = (): MaterialRow => ({ typ: 'material', beschreibung: '', menge: '1', stueckpreis: '', preis: '' });
const fCHF = (n: number) => 'CHF ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

export default function OfferteForm({ customers, onSave, onCancel }: OfferteFormProps) {
  const [cid,       setCid]       = useState('');
  const [titel,     setTitel]     = useState('');
  const [tab,       setTab]       = useState<'arbeit' | 'material'>('arbeit');
  const [arbeit,    setArbeit]    = useState<ArbeitRow[]>([newArbeit()]);
  const [material,  setMaterial]  = useState<MaterialRow[]>([newMaterial()]);
  const [notizen,   setNotizen]   = useState('');
  const [gueltigBis, setGueltigBis] = useState('');

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
       selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  /* ── Arbeit mutations ── */
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
      const fz = selectedCustomer
        ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
           selectedCustomer.km ? selectedCustomer.km + 'km' : ''].filter(Boolean).join(' ')
        : 'unbekannt';
      const r = await schaetzeZEmitKI(pos.beschreibung, fz);
      setArbeit((a) => {
        const n = [...a]; const sa = parseFloat(n[i].stundenansatz) || 0; const ze = parseFloat(r.ze) || 0;
        n[i] = { ...n[i], ze: r.ze, zeKI: true, zeHint: r.begruendung, zeLoading: false, preis: ze && sa ? ((ze / 100) * sa).toFixed(2) : '' };
        return n;
      });
    } catch {
      setArbeit((a) => { const n = [...a]; n[i] = { ...n[i], zeLoading: false, zeHint: 'KI-Fehler' }; return n; });
    }
  };

  /* ── Material mutations ── */
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

  const totA  = arbeit.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totM  = material.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totZE = arbeit.reduce((s, p) => s + (parseFloat(p.ze) || 0), 0);

  function submit() {
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    const ap = arbeit.filter((p) => p.beschreibung.trim());
    const mp = material.filter((p) => p.beschreibung.trim());
    if (!ap.length && !mp.length) { showToast('Mindestens eine Position eingeben', 'error'); return; }
    onSave({
      customerId: cid, titel, positionen: [...ap, ...mp], notizen, gueltigBis,
      totalBetrag: (totA + totM).toFixed(2), totalArbeit: totA.toFixed(2),
      totalMaterial: totM.toFixed(2), totalZE: totZE,
    });
  }

  return (
    <div>
      {/* ── Header: Kunde + Datum + Betreff ── */}
      <div className="cf-section-title">Kunde &amp; Details</div>
      <div className="cf-group">
        <div className="cf-grid-21">
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
          <div className="cf-field">
            <label className="cf-label">Gültig bis</label>
            <input className="cf-input" type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
          </div>
        </div>

        {vehicleChips.length > 0 && (
          <div className="vehicle-chips-bar">
            <span style={{ fontSize: 12 }}>🚗</span>
            {vehicleChips.map((v, i) => <span key={i} className="vehicle-chip">{v}</span>)}
          </div>
        )}

        <div className="cf-field" style={{ marginTop: vehicleChips.length ? 8 : 10 }}>
          <label className="cf-label">Betreff</label>
          <input className="cf-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" />
        </div>
      </div>

      {/* ── Totals bar ── */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
        {([
          ['Arbeit',   fCHF(totA),        totZE ? `${totZE} ZE` : null, 'var(--blue)'],
          ['Material', fCHF(totM),        null,                          'var(--green)'],
          ['Total',    fCHF(totA + totM), null,                          'var(--indigo)'],
        ] as [string, string, string | null, string][]).map(([l, v, sub, c]) => (
          <div key={l} className="glass-panel" style={{ flex: 1, padding: '7px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--label2)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c, letterSpacing: '-0.2px' }}>{v}</div>
            {sub && <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Positionen tab bar ── */}
      <div className="cf-section-title">Positionen</div>
      <div className="doc-tab-bar" style={{ marginBottom: 10 }}>
        {(['arbeit', 'material'] as const).map((t) => (
          <button key={t} className={`doc-tab${tab === t ? ' dt-active' : ''}`} onClick={() => setTab(t)} aria-pressed={tab === t}>
            {t === 'arbeit' ? (
              <><svg width={14} height={14} viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M9.5 3.5a3.5 3.5 0 01-4.9 4.9L2 11a1.2 1.2 0 001.7 1.7L6.2 10A3.5 3.5 0 019.5 3.5zm.7-.7l-2 2 .8.8 2-2-.8-.8z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round"/></svg>Arbeit</>
            ) : (
              <><svg width={14} height={14} viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x={2} y={4} width={11} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2}/><path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"/></svg>Material</>
            )}
            <span className={`doc-tab-count${(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length ? ' has-items' : ''}`}>
              {(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Arbeit table ── */}
      {tab === 'arbeit' && (
        <div className="pos-tbl-wrap">
          <table className="pos-tbl">
            <colgroup>
              <col style={{ width: 28 }} />
              <col />
              <col style={{ width: 62 }} />
              <col style={{ width: 32 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Beschreibung</th>
                <th>ZE</th>
                <th title="KI-Schätzung">✦</th>
                <th>CHF/h</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {arbeit.map((pos, i) => (
                <tr key={i}>
                  <td><div className="pos-num-badge">{String(i + 1).padStart(2, '0')}</div></td>
                  <td>
                    <input
                      className="pos-inp"
                      value={pos.beschreibung}
                      onChange={(e) => updA(i, 'beschreibung', e.target.value)}
                      placeholder="Arbeitsschritt…"
                    />
                  </td>
                  <td>
                    <input
                      className="pos-inp pos-inp-num"
                      type="number"
                      value={pos.ze}
                      onChange={(e) => updA(i, 'ze', e.target.value)}
                      placeholder="Auto"
                      min={0}
                      title={pos.zeHint || undefined}
                      style={pos.zeKI ? { color: 'var(--teal)', fontWeight: 700 } : {}}
                    />
                  </td>
                  <td>
                    <button
                      className={`pos-ki-btn${pos.zeKI ? ' ki-active' : ''}`}
                      onClick={() => kiZE(i)}
                      disabled={pos.zeLoading || !pos.beschreibung.trim()}
                      title="KI-Schätzung anfordern"
                    >
                      {pos.zeLoading ? <Spinner size={11} /> : '✦'}
                    </button>
                  </td>
                  <td>
                    <input
                      className="pos-inp pos-inp-num"
                      type="number"
                      value={pos.stundenansatz}
                      onChange={(e) => updA(i, 'stundenansatz', e.target.value)}
                      placeholder="80"
                    />
                  </td>
                  <td className="pos-total-cell" style={{ color: 'var(--blue)' }}>
                    {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                  </td>
                  <td>
                    {arbeit.length > 1 && (
                      <button className="pos-del-btn" onClick={() => remA(i)}><SFXmark /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="cf-add-row cf-add-row-arbeit" onClick={addA}>
            <SFPlus size={11} /> Arbeitsposition
          </button>
        </div>
      )}

      {/* ── Material table ── */}
      {tab === 'material' && (
        <div className="pos-tbl-wrap">
          <table className="pos-tbl">
            <colgroup>
              <col style={{ width: 28 }} />
              <col />
              <col style={{ width: 62 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Beschreibung</th>
                <th>Menge</th>
                <th>Stk. CHF</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {material.map((pos, i) => (
                <tr key={i}>
                  <td><div className="pos-num-badge">{String(i + 1).padStart(2, '0')}</div></td>
                  <td>
                    <input
                      className="pos-inp"
                      value={pos.beschreibung}
                      onChange={(e) => updM(i, 'beschreibung', e.target.value)}
                      placeholder="Ersatzteil / Material…"
                    />
                  </td>
                  <td>
                    <input
                      className="pos-inp pos-inp-num"
                      type="number"
                      value={pos.menge}
                      onChange={(e) => updM(i, 'menge', e.target.value)}
                      min={1}
                    />
                  </td>
                  <td>
                    <input
                      className="pos-inp pos-inp-num"
                      type="number"
                      value={pos.stueckpreis}
                      onChange={(e) => updM(i, 'stueckpreis', e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="pos-total-cell" style={{ color: 'var(--green)' }}>
                    {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                  </td>
                  <td>
                    {material.length > 1 && (
                      <button className="pos-del-btn" onClick={() => remM(i)}><SFXmark /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="cf-add-row cf-add-row-material" onClick={addM}>
            <SFPlus size={11} /> Materialposition
          </button>
        </div>
      )}

      {/* ── Notizen ── */}
      <div className="cf-section-title">Notizen</div>
      <div className="cf-group">
        <textarea
          className="cf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zur Offerte…"
          rows={2}
        />
      </div>

      {/* ── Actions ── */}
      <div className="cf-actions">
        <button className="cf-btn-cancel" onClick={onCancel}>Abbrechen</button>
        <button className="cf-btn-save" onClick={submit}>Offerte erstellen</button>
      </div>
    </div>
  );
}
