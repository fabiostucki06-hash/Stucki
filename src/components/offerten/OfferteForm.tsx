import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import type { Customer, ArbeitPosition, MaterialPosition, Offerte } from '../../types';

type ArbeitRow   = ArbeitPosition  & { zeLoading: boolean; zeHint: string };
type MaterialRow = MaterialPosition;
type OfferteData = Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>;

interface OfferteFormProps {
  customers: Customer[];
  onSave: (data: OfferteData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
  initial?: Offerte;
}

function schaetzeZE(desc: string): string {
  const t = desc.toLowerCase();
  const rules: [RegExp, number][] = [
    [/oelwechsel|ölwechsel/, 2], [/inspektion|service/, 6], [/bremsen|bremsbelag/, 4],
    [/reifen|pneu/, 2], [/getriebe/, 10], [/kupplung/, 8], [/zahnriemen/, 8],
    [/batterie/, 1], [/diagnose/, 1], [/klima/, 3],
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

export default function OfferteForm({ customers, onSave, onCancel, initial }: OfferteFormProps) {
  const [cid,        setCid]        = useState(initial?.customerId ?? '');
  const [titel,      setTitel]      = useState(initial?.titel ?? '');
  const [tab,        setTab]        = useState<'arbeit' | 'material'>('arbeit');
  const [arbeit,     setArbeit]     = useState<ArbeitRow[]>(() => {
    const ap = (initial?.positionen ?? []).filter((p): p is ArbeitPosition => p.typ === 'arbeit');
    return ap.length ? ap.map((p) => ({ ...p, zeLoading: false, zeHint: p.zeHint ?? '' })) : [newArbeit()];
  });
  const [material,   setMaterial]   = useState<MaterialRow[]>(() => {
    const mp = (initial?.positionen ?? []).filter((p): p is MaterialPosition => p.typ === 'material');
    return mp.length ? [...mp] : [newMaterial()];
  });
  const [notizen,    setNotizen]    = useState(initial?.notizen ?? '');
  const [gueltigBis, setGueltigBis] = useState(initial?.gueltigBis ?? '');

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

  const hdrTxt: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.07em' };

  return (
    <div>

      {/* ── Kunde & Details ── */}
      <div className="mf-section">
        <span className="mf-section-label">Kunde &amp; Details</span>
        <div className="mf-row-2" style={{ marginBottom: 14 }}>
          <div>
            <label className="mf-label">Kunde *</label>
            <select
              className="mf-select"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              style={{ color: cid ? 'var(--label)' : 'var(--label3)' }}
            >
              <option value="">Auswählen…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mf-label">Gültig bis</label>
            <input className="mf-input" type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
          </div>
        </div>

        {vehicleChips.length > 0 && (
          <div className="mf-chips">
            <span style={{ fontSize: 11 }}>🚗</span>
            {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
          </div>
        )}

        <div style={{ marginTop: vehicleChips.length ? 12 : 0 }}>
          <label className="mf-label">Betreff</label>
          <input className="mf-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" />
        </div>
      </div>

      {/* ── Totals ── */}
      <div className="mf-totals">
        {([
          ['Arbeit',   fCHF(totA),        totZE ? `${totZE} ZE` : null, 'var(--blue)'],
          ['Material', fCHF(totM),        null,                          'var(--green)'],
          ['Total',    fCHF(totA + totM), null,                          'var(--indigo)'],
        ] as [string, string, string | null, string][]).map(([l, v, sub, c]) => (
          <div key={l} className="mf-total-pill">
            <div className="mf-total-name">{l}</div>
            <div className="mf-total-val" style={{ color: c }}>{v}</div>
            {sub && <div className="mf-total-sub">{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Positionen ── */}
      <div className="mf-section">
        <span className="mf-section-label">Positionen</span>

        <div className="doc-tab-bar" style={{ marginBottom: 10 }}>
          {(['arbeit', 'material'] as const).map((t) => (
            <button key={t} className={`doc-tab${tab === t ? ' dt-active' : ''}`} onClick={() => setTab(t)} aria-pressed={tab === t}>
              {t === 'arbeit' ? (
                <><svg width={13} height={13} viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M9.5 3.5a3.5 3.5 0 01-4.9 4.9L2 11a1.2 1.2 0 001.7 1.7L6.2 10A3.5 3.5 0 019.5 3.5zm.7-.7l-2 2 .8.8 2-2-.8-.8z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round"/></svg>Arbeit</>
              ) : (
                <><svg width={13} height={13} viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x={2} y={4} width={11} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2}/><path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"/></svg>Material</>
              )}
              <span className={`doc-tab-count${(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length ? ' has-items' : ''}`}>
                {(t === 'arbeit' ? arbeit : material).filter((p) => p.beschreibung).length}
              </span>
            </button>
          ))}
        </div>

        {/* Arbeit rows */}
        {tab === 'arbeit' && (
          <>
            <div className="mf-pos-hdr">
              <span style={{ width: 18, flexShrink: 0 }} />
              <span style={{ ...hdrTxt, flex: 1 }}>Beschreibung</span>
              <span style={{ ...hdrTxt, width: 42, textAlign: 'right' }}>ZE</span>
              <span style={{ width: 28, flexShrink: 0 }} />
              <span style={{ ...hdrTxt, width: 50, textAlign: 'right' }}>CHF/h</span>
              <span style={{ ...hdrTxt, width: 68, textAlign: 'right' }}>Total</span>
              <span style={{ width: 22, flexShrink: 0 }} />
            </div>
            {arbeit.map((pos, i) => (
              <div key={i} className="mf-pos-row">
                <span className="mf-pos-idx">{i + 1}</span>
                <input
                  className="mf-pos-desc"
                  value={pos.beschreibung}
                  onChange={(e) => updA(i, 'beschreibung', e.target.value)}
                  placeholder="Arbeitsschritt…"
                />
                <input
                  className="mf-pos-num"
                  style={{ width: 42, color: pos.zeKI ? 'var(--teal)' : undefined, fontWeight: pos.zeKI ? 700 : undefined }}
                  type="number"
                  value={pos.ze}
                  onChange={(e) => updA(i, 'ze', e.target.value)}
                  placeholder="—"
                  min={0}
                  title={pos.zeHint || undefined}
                />
                <button
                  className={`mf-pos-ki${pos.zeKI ? ' ki-active' : ''}`}
                  style={{ width: 28 }}
                  onClick={() => kiZE(i)}
                  disabled={pos.zeLoading || !pos.beschreibung.trim()}
                  title="KI-Schätzung anfordern"
                >
                  {pos.zeLoading ? <Spinner size={10} /> : '✦'}
                </button>
                <input
                  className="mf-pos-num"
                  style={{ width: 50 }}
                  type="number"
                  value={pos.stundenansatz}
                  onChange={(e) => updA(i, 'stundenansatz', e.target.value)}
                  placeholder="80"
                />
                <span className="mf-pos-total" style={{ color: 'var(--blue)', width: 68 }}>
                  {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                </span>
                {arbeit.length > 1
                  ? <button className="mf-pos-del" onClick={() => remA(i)}><SFXmark /></button>
                  : <span style={{ width: 22 }} />
                }
              </div>
            ))}
            <button className="mf-add-pos" onClick={addA}><SFPlus size={12} /> Arbeitsposition</button>
          </>
        )}

        {/* Material rows */}
        {tab === 'material' && (
          <>
            <div className="mf-pos-hdr">
              <span style={{ width: 18, flexShrink: 0 }} />
              <span style={{ ...hdrTxt, flex: 1 }}>Beschreibung</span>
              <span style={{ ...hdrTxt, width: 44, textAlign: 'right' }}>Menge</span>
              <span style={{ ...hdrTxt, width: 64, textAlign: 'right' }}>Stk. CHF</span>
              <span style={{ ...hdrTxt, width: 68, textAlign: 'right' }}>Total</span>
              <span style={{ width: 22, flexShrink: 0 }} />
            </div>
            {material.map((pos, i) => (
              <div key={i} className="mf-pos-row">
                <span className="mf-pos-idx">{i + 1}</span>
                <input
                  className="mf-pos-desc"
                  value={pos.beschreibung}
                  onChange={(e) => updM(i, 'beschreibung', e.target.value)}
                  placeholder="Ersatzteil / Material…"
                />
                <input
                  className="mf-pos-num"
                  style={{ width: 44 }}
                  type="number"
                  value={pos.menge}
                  onChange={(e) => updM(i, 'menge', e.target.value)}
                  min={1}
                />
                <input
                  className="mf-pos-num"
                  style={{ width: 64 }}
                  type="number"
                  value={pos.stueckpreis}
                  onChange={(e) => updM(i, 'stueckpreis', e.target.value)}
                  placeholder="0.00"
                />
                <span className="mf-pos-total" style={{ color: 'var(--green)', width: 68 }}>
                  {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                </span>
                {material.length > 1
                  ? <button className="mf-pos-del" onClick={() => remM(i)}><SFXmark /></button>
                  : <span style={{ width: 22 }} />
                }
              </div>
            ))}
            <button className="mf-add-pos green" onClick={addM}><SFPlus size={12} /> Materialposition</button>
          </>
        )}
      </div>

      {/* ── Notizen ── */}
      <div className="mf-section">
        <span className="mf-section-label">Notizen</span>
        <textarea
          className="mf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zur Offerte…"
          rows={3}
        />
      </div>

      {/* ── Actions ── */}
      <div className="mf-actions">
        <button className="mf-btn-save" onClick={submit}>
          {initial ? 'Änderungen speichern' : 'Offerte erstellen'}
        </button>
        <button className="mf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>

    </div>
  );
}
