import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import type { Customer, Order, Offerte, ArbeitPosition, MaterialPosition, Rechnung } from '../../types';

type ArbeitRow   = ArbeitPosition  & { zeLoading: boolean; zeHint: string };
type MaterialRow = MaterialPosition;
type RechnungData = Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>;

interface RechnungFormProps {
  customers: Customer[];
  orders: Order[];
  offerten: Offerte[];
  onSave: (data: RechnungData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
  initial?: Rechnung;
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

function calcFaelligAm(days: string): string {
  const n = parseInt(days);
  if (isNaN(n) || n <= 0) return '';
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function RechnungForm({ customers, orders, offerten, onSave, onCancel, initial }: RechnungFormProps) {
  const [selectedAuftragId, setSelectedAuftragId] = useState(initial?.auftragId ?? '');
  const [selectedOfferteId, setSelectedOfferteId] = useState('');
  const [cid,          setCid]          = useState(initial?.customerId ?? '');
  const [titel,        setTitel]        = useState(initial?.titel ?? '');
  const [tab,          setTab]          = useState<'arbeit' | 'material'>('arbeit');
  const [arbeit,       setArbeit]       = useState<ArbeitRow[]>(() => {
    const ap = (initial?.positionen ?? []).filter((p): p is ArbeitPosition => p.typ === 'arbeit');
    return ap.length ? ap.map((p) => ({ ...p, zeLoading: false, zeHint: p.zeHint ?? '' })) : [newArbeit()];
  });
  const [material,     setMaterial]     = useState<MaterialRow[]>(() => {
    const mp = (initial?.positionen ?? []).filter((p): p is MaterialPosition => p.typ === 'material');
    return mp.length ? [...mp] : [newMaterial()];
  });
  const [notizen,      setNotizen]      = useState(initial?.notizen ?? '');
  const [zahlungsFrist, setZahlungsFrist] = useState(initial?.zahlungsFrist ?? '30');
  const [faelligAm,    setFaelligAm]    = useState(
    () => initial?.faelligAm ?? calcFaelligAm(initial?.zahlungsFrist ?? '30')
  );

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
       selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

  const sortedAuftraege = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sortedOfferten  = [...offerten].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function onAuftragSelect(auftragId: string) {
    setSelectedAuftragId(auftragId);
    setSelectedOfferteId('');
    if (!auftragId) return;
    const auftrag = orders.find((o) => o.id === auftragId);
    if (!auftrag) return;
    setCid(auftrag.customerId);
    const positions = auftrag.positionen ?? [];
    const arbeitRows: ArbeitRow[] = positions
      .filter((p): p is ArbeitPosition => p.typ === 'arbeit')
      .map((p) => {
        const ze = parseFloat(p.ze) || 0; const sa = parseFloat(p.stundenansatz || '80') || 80;
        return { ...p, stundenansatz: String(sa), preis: p.preis || (ze && sa ? ((ze / 100) * sa).toFixed(2) : ''), zeLoading: false, zeHint: p.zeHint ?? '' };
      });
    const materialRows: MaterialRow[] = positions
      .filter((p): p is MaterialPosition => p.typ === 'material')
      .map((p) => {
        const mg = parseFloat(p.menge) || 1; const sp = parseFloat(p.stueckpreis) || 0;
        return { ...p, preis: p.preis || (sp ? (sp * mg).toFixed(2) : '') };
      });
    setArbeit(arbeitRows.length ? arbeitRows : [newArbeit()]);
    setMaterial(materialRows.length ? materialRows : [newMaterial()]);
    if (arbeitRows.length > 0) setTab('arbeit');
    else if (materialRows.length > 0) setTab('material');
  }

  function onOfferteSelect(offerteId: string) {
    setSelectedOfferteId(offerteId);
    setSelectedAuftragId('');
    if (!offerteId) return;
    const off = offerten.find((o) => o.id === offerteId);
    if (!off) return;
    setCid(off.customerId);
    if (!initial?.titel) setTitel(off.titel ?? `Offerte #${off.offertNumber}`);
    const positions = off.positionen ?? [];
    const arbeitRows: ArbeitRow[] = positions
      .filter((p): p is ArbeitPosition => p.typ === 'arbeit')
      .map((p) => {
        const ze = parseFloat(p.ze) || 0; const sa = parseFloat(p.stundenansatz || '80') || 80;
        return { ...p, stundenansatz: String(sa), preis: p.preis || (ze && sa ? ((ze / 100) * sa).toFixed(2) : ''), zeLoading: false, zeHint: p.zeHint ?? '' };
      });
    const materialRows: MaterialRow[] = positions
      .filter((p): p is MaterialPosition => p.typ === 'material')
      .map((p) => {
        const mg = parseFloat(p.menge) || 1; const sp = parseFloat(p.stueckpreis) || 0;
        return { ...p, preis: p.preis || (sp ? (sp * mg).toFixed(2) : '') };
      });
    setArbeit(arbeitRows.length ? arbeitRows : [newArbeit()]);
    setMaterial(materialRows.length ? materialRows : [newMaterial()]);
    if (arbeitRows.length > 0) setTab('arbeit');
    else if (materialRows.length > 0) setTab('material');
  }

  function handleZahlungsFristChange(val: string) {
    setZahlungsFrist(val);
    setFaelligAm(calcFaelligAm(val));
  }

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
      customerId: cid, titel, positionen: [...ap, ...mp], notizen,
      zahlungsFrist, faelligAm,
      totalBetrag: (totA + totM).toFixed(2), totalArbeit: totA.toFixed(2),
      totalMaterial: totM.toFixed(2), totalZE: totZE,
      auftragId: selectedAuftragId || undefined,
    });
  }

  /* ── shared style tokens ── */
  const gc: React.CSSProperties = {
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(64px) saturate(240%)',
    WebkitBackdropFilter: 'blur(64px) saturate(240%)',
    border: '1px solid rgba(255,255,255,0.20)',
    borderRadius: 18,
    padding: '10px 12px',
    marginBottom: 24,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), 0 4px 24px rgba(0,0,0,0.06)',
  };
  const gcHdr: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--label2)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 9, display: 'block',
    textShadow: '0 1px 3px rgba(0,0,0,0.30)',
  };
  const hdrTxt: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--label2)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    textShadow: '0 1px 3px rgba(0,0,0,0.30)',
  };

  const arbeitCount   = arbeit.filter((p) => p.beschreibung).length;
  const materialCount = material.filter((p) => p.beschreibung).length;

  /* import status summary */
  const importActive = selectedAuftragId || selectedOfferteId;
  const importPos = importActive
    ? (selectedAuftragId
        ? (orders.find((x) => x.id === selectedAuftragId)?.positionen ?? [])
        : (offerten.find((o) => o.id === selectedOfferteId)?.positionen ?? []))
    : [];
  const importACount = importPos.filter((p) => p.typ === 'arbeit').length;
  const importMCount = importPos.filter((p) => p.typ === 'material').length;

  return (
    <div>

      {/* ── Section 1: Import aus Auftrag / Offerte ── */}
      <div style={gc}>
        <span style={gcHdr}>Aus bestehendem Dokument befüllen</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Aus Auftrag</label>
            <select
              className="cf-select"
              value={selectedAuftragId}
              onChange={(e) => onAuftragSelect(e.target.value)}
              style={{ color: selectedAuftragId ? 'var(--label)' : 'var(--label3)' }}
            >
              <option value="">Auftrag wählen…</option>
              {sortedAuftraege.map((o) => {
                const c = customers.find((cu) => cu.id === o.customerId);
                const hasPos = (o.positionen ?? []).length > 0;
                return (
                  <option key={o.id} value={o.id}>
                    #{o.orderNumber}{hasPos ? '' : ' (keine Pos.)'} · {c ? `${c.vorname} ${c.nachname}` : '?'}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="cf-field">
            <label className="cf-label">Aus Offerte (optional)</label>
            <select
              className="cf-select"
              value={selectedOfferteId}
              onChange={(e) => onOfferteSelect(e.target.value)}
              style={{ color: selectedOfferteId ? 'var(--label)' : 'var(--label3)' }}
            >
              <option value="">Offerte wählen…</option>
              {sortedOfferten.map((off) => {
                const c = customers.find((cu) => cu.id === off.customerId);
                return (
                  <option key={off.id} value={off.id}>
                    #{off.offertNumber}{off.titel ? ` – ${off.titel}` : ''} · {c ? `${c.vorname} ${c.nachname}` : '?'} · CHF {parseFloat(off.totalBetrag || '0').toFixed(2)}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        {importActive && (
          <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--blue)', padding: '7px 10px', background: 'rgba(0,122,255,0.10)', borderRadius: 8, border: '1px solid rgba(0,122,255,0.20)' }}>
            {selectedAuftragId ? 'Auftrag' : 'Offerte'} importiert —{' '}
            {importACount + importMCount > 0
              ? `${importACount} Arbeits- + ${importMCount} Materialpos. übernommen`
              : 'Kunde übernommen, keine Positionen'}
          </div>
        )}
      </div>

      {/* ── Section 2: Kunde & Details ── */}
      <div style={gc}>
        <span style={gcHdr}>Kunde &amp; Details</span>

        {/* 2/3 Kunde + 1/3 Fällig am */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Kunde *</label>
            <select
              className="cf-select"
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
          <div className="cf-field">
            <label className="cf-label">Fällig am</label>
            <input className="cf-input" type="date" value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
          </div>
        </div>

        {vehicleChips.length > 0 && (
          <div className="mf-chips" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11 }}>🚗</span>
            {vehicleChips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
          </div>
        )}

        <div className="cf-field" style={{ marginBottom: 12 }}>
          <label className="cf-label">Betreff</label>
          <input className="cf-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="cf-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Zahlungsfrist</label>
          <input
            className="cf-input"
            type="number"
            value={zahlungsFrist}
            onChange={(e) => handleZahlungsFristChange(e.target.value)}
            placeholder="30"
            min={1}
            style={{ width: 72, flex: 'none' }}
          />
          <span style={{ fontSize: 13, color: 'var(--label2)', whiteSpace: 'nowrap' }}>Tage</span>
        </div>
      </div>

      {/* ── Section 3: Positionen ── */}
      <div style={gc}>
        <span style={gcHdr}>Positionen</span>

        {/* iOS Segmented Control */}
        <div className="seg-ctrl" style={{ marginBottom: 10 }}>
          {(['arbeit', 'material'] as const).map((t) => {
            const cnt = t === 'arbeit' ? arbeitCount : materialCount;
            const isActive = tab === t;
            return (
              <button
                key={t}
                className={`seg-item${isActive ? ' active' : ''}`}
                onClick={() => setTab(t)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {t === 'arbeit' ? (
                  <svg width={12} height={12} viewBox="0 0 15 15" fill="none" aria-hidden="true">
                    <path d="M9.5 3.5a3.5 3.5 0 01-4.9 4.9L2 11a1.2 1.2 0 001.7 1.7L6.2 10A3.5 3.5 0 019.5 3.5zm.7-.7l-2 2 .8.8 2-2-.8-.8z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width={12} height={12} viewBox="0 0 15 15" fill="none" aria-hidden="true">
                    <rect x={2} y={4} width={11} height={9} rx={1.5} stroke="currentColor" strokeWidth={1.2} />
                    <path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
                  </svg>
                )}
                {t === 'arbeit' ? 'Arbeit' : 'Material'}
                {cnt > 0 && (
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.18)',
                    borderRadius: 9, minWidth: 18, height: 18, fontSize: 10, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                  }}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
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
                <input className="mf-pos-desc" value={pos.beschreibung} onChange={(e) => updA(i, 'beschreibung', e.target.value)} placeholder="Arbeitsschritt…" />
                <input
                  className="mf-pos-num"
                  style={{ width: 42, color: pos.zeKI ? 'var(--teal)' : undefined, fontWeight: pos.zeKI ? 700 : undefined }}
                  type="number" value={pos.ze} onChange={(e) => updA(i, 'ze', e.target.value)}
                  placeholder="—" min={0} title={pos.zeHint || undefined}
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
                <input className="mf-pos-num" style={{ width: 50 }} type="number" value={pos.stundenansatz} onChange={(e) => updA(i, 'stundenansatz', e.target.value)} placeholder="80" />
                <span className="mf-pos-total" style={{ color: 'var(--blue)', width: 68 }}>
                  {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                </span>
                {arbeit.length > 1
                  ? <button className="mf-pos-del" onClick={() => remA(i)}><SFXmark /></button>
                  : <span style={{ width: 22 }} />}
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
                <input className="mf-pos-desc" value={pos.beschreibung} onChange={(e) => updM(i, 'beschreibung', e.target.value)} placeholder="Ersatzteil / Material…" />
                <input className="mf-pos-num" style={{ width: 44 }} type="number" value={pos.menge} onChange={(e) => updM(i, 'menge', e.target.value)} min={1} />
                <input className="mf-pos-num" style={{ width: 64 }} type="number" value={pos.stueckpreis} onChange={(e) => updM(i, 'stueckpreis', e.target.value)} placeholder="0.00" />
                <span className="mf-pos-total" style={{ color: 'var(--green)', width: 68 }}>
                  {pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}
                </span>
                {material.length > 1
                  ? <button className="mf-pos-del" onClick={() => remM(i)}><SFXmark /></button>
                  : <span style={{ width: 22 }} />}
              </div>
            ))}
            <button className="mf-add-pos green" onClick={addM}><SFPlus size={12} /> Materialposition</button>
          </>
        )}

        {/* ── Totals summary ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          marginTop: 10, paddingTop: 10,
          borderTop: '0.5px solid var(--sep)',
        }}>
          {([
            ['Arbeit',   fCHF(totA),        totZE ? `${totZE} ZE` : null, 'var(--blue)'],
            ['Material', fCHF(totM),        null,                          'var(--green)'],
            ['Total',    fCHF(totA + totM), null,                          'var(--indigo)'],
          ] as [string, string, string | null, string][]).map(([l, v, sub, c]) => (
            <div key={l} style={{
              textAlign: 'center', padding: '6px 5px',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 12,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--label2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, textShadow: '0 1px 3px rgba(0,0,0,0.30)' }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.25px', color: c, textShadow: '0 1px 3px rgba(0,0,0,0.20)', whiteSpace: 'nowrap' }}>{v}</div>
              {sub && <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--label2)', marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 4: Notizen ── */}
      <div style={gc}>
        <span style={gcHdr}>Notizen</span>
        <textarea
          className="cf-textarea"
          value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          placeholder="Interne Notizen zur Rechnung…"
          rows={3}
          style={{ marginBottom: 0 }}
        />
      </div>

      {/* ── Actions: right-aligned pills ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, paddingBottom: 6 }}>
        <button className="mf-btn-cancel" onClick={onCancel}>Abbrechen</button>
        <button className="mf-btn-save" onClick={submit}>
          {initial ? 'Änderungen speichern' : 'Rechnung erstellen'}
        </button>
      </div>

    </div>
  );
}
