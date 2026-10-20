import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { FormCard, FormBar, SummaryRow, VehicleChips, PositionenEditor, fCHF, type ArbeitRow, type MaterialRow } from '../ui/DocForm';
import { computeRechnungTotals, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from '../../lib/rechnung-totals';
import { offerteNr } from '../../lib/offerte-docs';
import NummerField, { nummerBestaetigt, parseNummer } from '../ui/NummerField';
import { materialPreis, materialZeSumme, zeMinuten } from '../../lib/ze';
import { setMaterialFeld } from '../../lib/marge';
import type { Customer, Order, Offerte, ArbeitPosition, MaterialPosition, Rechnung, RechnungKategorie } from '../../types';

type RechnungData = Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'> & { rechnungNumber: number };

interface RechnungFormProps {
  customers: Customer[];
  orders: Order[];
  offerten: Offerte[];
  onSave: (data: RechnungData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
  initial?: Rechnung;
  /** Automatic Rechnungs-Nr.: the next free one for a new Rechnung, else the current one. */
  nummerVorschlag: number;
  /** Whether another Rechnung already has this number. */
  nummerVergeben: (n: number) => boolean;
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

const KATEGORIE_OPTS: [RechnungKategorie, string][] = [
  ['reparatur',  'Reparatur'],
  ['karosserie', 'Karosserie'],
  ['inspektion', 'Inspektion'],
  ['service',    'Service'],
];

const newArbeit   = (): ArbeitRow   => ({ typ: 'arbeit',   beschreibung: '', ze: '', stundenansatz: '80', preis: '', zeKI: false, zeLoading: false, zeHint: '' });
const newMaterial = (): MaterialRow => ({ typ: 'material', beschreibung: '', menge: '1', stueckpreis: '', preis: '' });

function calcFaelligAm(days: string): string {
  const n = parseInt(days);
  if (isNaN(n) || n <= 0) return '';
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function RechnungForm({ customers, orders, offerten, onSave, onCancel, saving: savingProp, initial, nummerVorschlag, nummerVergeben }: RechnungFormProps) {
  const [nummer, setNummer] = useState(String(initial?.rechnungNumber ?? nummerVorschlag));
  const [selectedAuftragId, setSelectedAuftragId] = useState(initial?.auftragId ?? '');
  const [selectedOfferteId, setSelectedOfferteId] = useState('');
  const [cid,          setCid]          = useState(initial?.customerId ?? '');
  const [titel,        setTitel]        = useState(initial?.titel ?? '');
  const [arbeit,       setArbeit]       = useState<ArbeitRow[]>(() => {
    const ap = (initial?.positionen ?? []).filter((p): p is ArbeitPosition => p.typ === 'arbeit');
    return ap.length ? ap.map((p) => ({ ...p, zeLoading: false, zeHint: p.zeHint ?? '' })) : [newArbeit()];
  });
  const [material,     setMaterial]     = useState<MaterialRow[]>(() => {
    const mp = (initial?.positionen ?? []).filter((p): p is MaterialPosition => p.typ === 'material');
    return mp.length ? [...mp] : [newMaterial()];
  });
  const [notizen,      setNotizen]      = useState(initial?.notizen ?? '');
  const [kategorie,    setKategorie]    = useState<RechnungKategorie | ''>(initial?.kategorie ?? '');
  const [kleinteilManuell, setKleinteilManuell] = useState<boolean | null>(initial?.kleinteilManuell ?? null);
  const [zahlungsFrist, setZahlungsFrist] = useState(initial?.zahlungsFrist ?? '10');
  const [faelligAm,    setFaelligAm]    = useState(
    () => initial?.faelligAm ?? calcFaelligAm(initial?.zahlungsFrist ?? '10')
  );

  const [savingLocal, setSavingLocal] = useState(false);
  const busy = savingProp || savingLocal;

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
        const fehlt = !p.preis && !(parseFloat(p.stueckpreis) || parseFloat(p.ze ?? ''));
        return { ...p, preis: p.preis || (fehlt ? '' : materialPreis(p)) };
      });
    setArbeit(arbeitRows.length ? arbeitRows : [newArbeit()]);
    setMaterial(materialRows.length ? materialRows : [newMaterial()]);
  }

  function onOfferteSelect(offerteId: string) {
    setSelectedOfferteId(offerteId);
    setSelectedAuftragId('');
    if (!offerteId) return;
    const off = offerten.find((o) => o.id === offerteId);
    if (!off) return;
    setCid(off.customerId);
    if (!initial?.titel) setTitel(off.titel ?? `Offerte #${offerteNr(off)}`);
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
        const fehlt = !p.preis && !(parseFloat(p.stueckpreis) || parseFloat(p.ze ?? ''));
        return { ...p, preis: p.preis || (fehlt ? '' : materialPreis(p)) };
      });
    setArbeit(arbeitRows.length ? arbeitRows : [newArbeit()]);
    setMaterial(materialRows.length ? materialRows : [newMaterial()]);
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
    const n = [...m]; n[i] = setMaterialFeld(n[i], k, v);
    if (k === 'stueckpreis' || k === 'menge' || k === 'ze' || k === 'ek' || k === 'marge') n[i].preis = materialPreis(n[i]);
    return n;
  });

  const ap = arbeit.filter((p) => p.beschreibung.trim());
  const mp = material.filter((p) => p.beschreibung.trim());
  const { totalMaterial: totM, totalArbeit: totA, totalZE: totZE, rechnungstotal, kleinteilApplied } =
    computeRechnungTotals([...ap, ...mp], kategorie || undefined, kleinteilManuell, initial?.anzahlungProzent, parseFloat(initial?.anzahlungBetrag ?? '') || undefined);

  /** `draft` saves whatever is there so far (only the customer is required);
      a new Rechnung starts out as "Entwurf" either way. */
  async function submit(draft: boolean) {
    if (busy) return;
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    if (parseNummer(nummer) == null) { showToast('Bitte eine gültige Rechnungs-Nr. eingeben', 'error'); return; }
    // Only a changed number is checked: an existing duplicate doesn't ask again on every save.
    const rechnungNumber = nummerBestaetigt(nummer, (n) => n !== initial?.rechnungNumber && nummerVergeben(n), 'Rechnung');
    if (rechnungNumber == null) return;
    if (!draft && !ap.length && !mp.length) { showToast('Mindestens eine Position eingeben', 'error'); return; }
    setSavingLocal(true);
    try {
      // Awaited so a rejected write keeps the sheet (and the user's input) open.
      await onSave({
        rechnungNumber, customerId: cid, titel, positionen: [...mp, ...ap], notizen,
        zahlungsFrist, faelligAm,
        kategorie: kategorie || undefined, kleinteilManuell,
        totalBetrag: rechnungstotal.toFixed(2), totalArbeit: totA.toFixed(2),
        totalMaterial: totM.toFixed(2), totalZE: totZE,
        auftragId: selectedAuftragId || undefined,
      });
    } catch (e) {
      console.error('[Rechnung] save failed:', e);
    } finally {
      setSavingLocal(false);
    }
  }

  /* import status summary */
  const importActive = selectedAuftragId || selectedOfferteId;
  const importPos = importActive
    ? (selectedAuftragId
        ? (orders.find((x) => x.id === selectedAuftragId)?.positionen ?? [])
        : (offerten.find((o) => o.id === selectedOfferteId)?.positionen ?? []))
    : [];
  const importACount = importPos.filter((p) => p.typ === 'arbeit').length;
  const importMCount = importPos.filter((p) => p.typ === 'material').length;
  const importHint = importActive
    ? (importACount + importMCount > 0
        ? `${importACount} Arbeits- + ${importMCount} Materialpos. übernommen`
        : 'Kunde übernommen, keine Positionen')
    : 'Optional: aus Auftrag oder Offerte übernehmen';

  const totArbeitBase = totA - (kleinteilApplied ? KLEINTEIL_BETRAG : 0);
  const rundung = rechnungstotal - (totA + totM);

  return (
    <div className="df">

      {/* ── 1: Kunde & Details ── */}
      <FormCard title="Kunde & Details" hint={importHint}>
        <div className="df-grid">
          <div className="cf-field">
            <label className="cf-label">Aus Auftrag</label>
            <select
              className="cf-select"
              value={selectedAuftragId}
              onChange={(e) => onAuftragSelect(e.target.value)}
              style={{ color: selectedAuftragId ? 'var(--input-text)' : 'var(--input-placeholder)' }}
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
            <label className="cf-label">Aus Offerte</label>
            <select
              className="cf-select"
              value={selectedOfferteId}
              onChange={(e) => onOfferteSelect(e.target.value)}
              style={{ color: selectedOfferteId ? 'var(--input-text)' : 'var(--input-placeholder)' }}
            >
              <option value="">Offerte wählen…</option>
              {sortedOfferten.map((off) => {
                const c = customers.find((cu) => cu.id === off.customerId);
                return (
                  <option key={off.id} value={off.id}>
                    #{offerteNr(off)}{off.titel ? ` – ${off.titel}` : ''} · {c ? `${c.vorname} ${c.nachname}` : '?'} · CHF {parseFloat(off.totalBetrag || '0').toFixed(2)}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="cf-field df-span2">
            <label className="cf-label">Kunde *</label>
            <select
              className="cf-select"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              style={{ color: cid ? 'var(--input-text)' : 'var(--input-placeholder)' }}
            >
              <option value="">Auswählen…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>
              ))}
            </select>
          </div>
          {vehicleChips.length > 0 && <div className="df-span2"><VehicleChips chips={vehicleChips} /></div>}
          <NummerField
            label="Rechnungs-Nr." value={nummer} onChange={setNummer} vorschlag={nummerVorschlag}
            vergeben={(() => { const n = parseNummer(nummer); return n != null && n !== initial?.rechnungNumber && nummerVergeben(n); })()}
          />
          <div className="cf-field">
            <label className="cf-label">Betreff</label>
            <input className="cf-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Auftragsart</label>
            <select
              className="cf-select"
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value as RechnungKategorie | '')}
              style={{ color: kategorie ? 'var(--input-text)' : 'var(--input-placeholder)' }}
            >
              <option value="">Keine Angabe</option>
              {KATEGORIE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="cf-field">
            <label className="cf-label">Zahlungsfrist (Tage)</label>
            <input className="cf-input" type="number" inputMode="numeric" min={1} value={zahlungsFrist} onChange={(e) => handleZahlungsFristChange(e.target.value)} placeholder="30" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Fällig am</label>
            <input className="cf-input" type="date" value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
          </div>
        </div>
      </FormCard>

      {/* ── 2: Positionen ── */}
      <FormCard title="Positionen" hint="Enter fügt die nächste Zeile hinzu">
        <PositionenEditor
          arbeit={arbeit} material={material}
          onArbeitChange={updA} onArbeitAdd={addA} onArbeitRemove={remA} onKiZE={kiZE}
          onMaterialChange={updM} onMaterialAdd={addM} onMaterialRemove={remM}
        />
      </FormCard>

      {/* ── 3: Zusammenfassung ── */}
      <FormCard title="Zusammenfassung">
        <div className="df-split">
          <div className="cf-field">
            <label className="cf-label">Notizen</label>
            <textarea
              className="cf-textarea"
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              placeholder="Interne Notizen zur Rechnung…"
              rows={4}
            />
          </div>
          <div>
            <SummaryRow label="Material" value={fCHF(totM)} />
            {(() => {
              const mz = materialZeSumme(material);
              return mz.ze > 0 && <SummaryRow label="davon ZE zu Material" sub={`${mz.ze} ZE = ${Math.round(zeMinuten(mz.ze))} Min.`} value={fCHF(mz.betrag)} />;
            })()}
            <SummaryRow label="Arbeit" sub={totZE ? `${totZE} ZE` : null} value={fCHF(totArbeitBase)} />
            {/* Kleinteilepauschale: manual override of the per-Auftragsart default */}
            <SummaryRow
              label={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={kleinteilApplied}
                      onChange={(e) => setKleinteilManuell(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--blue)' }}
                    />
                    {KLEINTEIL_LABEL}
                  </label>
                  {kleinteilManuell != null && (
                    <button
                      type="button"
                      onClick={() => setKleinteilManuell(null)}
                      className="pill-btn pill-btn-inactive"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                    >
                      Automatisch
                    </button>
                  )}
                </span>
              }
              value={kleinteilApplied ? fCHF(KLEINTEIL_BETRAG) : '—'}
            />
            {Math.abs(rundung) >= 0.005 && <SummaryRow label="Rappenrundung" value={fCHF(rundung)} />}
            <SummaryRow label="Total" value={fCHF(rechnungstotal)} total />
          </div>
        </div>
      </FormCard>

      <FormBar label="Total" value={fCHF(rechnungstotal)}>
        {initial
          ? <button className="mf-btn-cancel" onClick={onCancel} disabled={busy}>Abbrechen</button>
          : <button className="mf-btn-cancel" onClick={() => submit(true)} disabled={busy}>Als Entwurf speichern</button>}
        <button className="mf-btn-save" onClick={() => submit(false)} disabled={busy}>
          {busy
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner size={12} /> Speichern…</span>
            : initial ? 'Änderungen speichern' : 'Rechnung erstellen'}
        </button>
      </FormBar>

    </div>
  );
}
