import { useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { FormCard, FormBar, SummaryRow, VehicleChips, PositionenEditor, fCHF, type ArbeitRow, type MaterialRow } from '../ui/DocForm';
import type { Customer, ArbeitPosition, MaterialPosition, Offerte, OfferteStatus } from '../../types';
import { mitMaterialHinweis, anzahlungErforderlich, anzahlungAufteilung, ANZAHLUNG_PROZENT, VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ } from '../../lib/offerte-docs';
import NummerField, { nummerBestaetigt, parseNummer } from '../ui/NummerField';
import { materialPreis, materialZeSumme, zeMinuten } from '../../lib/ze';

type OfferteData = Omit<Offerte, 'id' | 'offertNumber' | 'createdAt'> & { offertNumber: number };

const STATUS_OPTS: [OfferteStatus, string][] = [
  ['entwurf',    'Entwurf'],
  ['versendet',  'Versendet'],
  ['angenommen', 'Angenommen'],
  ['abgelehnt',  'Abgelehnt'],
];

interface OfferteFormProps {
  customers: Customer[];
  onSave: (data: OfferteData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
  initial?: Offerte;
  /** Automatic Offerte-Nr.: the next free one for a new Offerte, else the current one. */
  nummerVorschlag: number;
  /** Whether another Offerte (same version) already has this number. */
  nummerVergeben: (n: number) => boolean;
  /** Pre-fills the material tab with one row (e.g. from the part-import flow). Ignored when `initial` is set. */
  prefillMaterial?: MaterialPosition;
  prefillCustomerId?: string;
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
/* zeLoading is row-only UI state and must never reach the offerten jsonb payload,
   so the persisted shape is spelled out instead of spreading the whole row. */
const toArbeitPosition = (p: ArbeitRow): ArbeitPosition => ({
  typ: 'arbeit',
  beschreibung: p.beschreibung,
  ze: p.ze,
  stundenansatz: p.stundenansatz,
  preis: p.preis,
  zeKI: p.zeKI,
  zeHint: p.zeHint,
});
const newMaterial = (): MaterialRow => ({ typ: 'material', beschreibung: '', menge: '1', stueckpreis: '', preis: '' });

export default function OfferteForm({ customers, onSave, onCancel, saving: savingProp, initial, prefillMaterial, prefillCustomerId, nummerVorschlag, nummerVergeben }: OfferteFormProps) {
  const [nummer, setNummer] = useState(String(initial?.offertNumber ?? nummerVorschlag));
  // Off by default: a new Offerte is a plain one.
  const [mitAnzahlung, setMitAnzahlung] = useState(() => (initial ? anzahlungErforderlich(initial) : false));
  const [cid,        setCid]        = useState(initial?.customerId ?? prefillCustomerId ?? '');
  const [titel,      setTitel]      = useState(initial?.titel ?? '');
  const [arbeit,     setArbeit]     = useState<ArbeitRow[]>(() => {
    const ap = (initial?.positionen ?? []).filter((p): p is ArbeitPosition => p.typ === 'arbeit');
    return ap.length ? ap.map((p) => ({ ...p, zeLoading: false, zeHint: p.zeHint ?? '' })) : [newArbeit()];
  });
  const [material,   setMaterial]   = useState<MaterialRow[]>(() => {
    const mp = (initial?.positionen ?? [])
      .filter((p): p is MaterialPosition => p.typ === 'material')
      .filter((p) => p.beschreibung !== 'Kleinteil Pauschale');
    if (mp.length) return [...mp];
    if (!initial && prefillMaterial) return [{ ...prefillMaterial }];
    return [newMaterial()];
  });
  const [notizen,    setNotizen]    = useState(() => mitMaterialHinweis(initial?.notizen));
  const [gueltigBis, setGueltigBis] = useState(initial?.gueltigBis ?? '');
  const [zahlungsziel, setZahlungsziel] = useState(initial?.zahlungsziel ?? '10');
  const [status,     setStatus]     = useState<OfferteStatus>(initial?.status ?? 'entwurf');
  const [savingLocal, setSavingLocal] = useState(false);
  const busy = savingProp || savingLocal;

  const selectedCustomer = customers.find((c) => c.id === cid) ?? null;
  const vehicleChips = selectedCustomer
    ? [selectedCustomer.marke, selectedCustomer.modell, selectedCustomer.kennzeichen,
       selectedCustomer.km ? selectedCustomer.km + ' km' : ''].filter(Boolean)
    : [];

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
    if (k === 'stueckpreis' || k === 'menge' || k === 'ze') n[i].preis = materialPreis(n[i]);
    return n;
  });

  const totA  = arbeit.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totM  = material.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
  const totZE = arbeit.reduce((s, p) => s + (parseFloat(p.ze) || 0), 0);
  const kleinteilActive = totZE > 100;
  const kleinteilBetrag = kleinteilActive ? 10 : 0;
  const totMeff = totM + kleinteilBetrag;

  /** `draft` saves whatever is there so far (only the customer is required);
      a new Offerte starts out as "Entwurf" either way. */
  async function submit(draft: boolean) {
    if (busy) return;
    if (!cid) { showToast('Bitte einen Kunden auswählen', 'error'); return; }
    if (parseNummer(nummer) == null) { showToast('Bitte eine gültige Offerte-Nr. eingeben', 'error'); return; }
    // Only a changed number is checked: an existing duplicate doesn't ask again on every save.
    const offertNumber = nummerBestaetigt(nummer, (n) => n !== initial?.offertNumber && nummerVergeben(n), 'Offerte');
    if (offertNumber == null) return;
    const ap = arbeit.filter((p) => p.beschreibung.trim()).map(toArbeitPosition);
    const mp = material.filter((p) => p.beschreibung.trim());
    if (!draft && !ap.length && !mp.length) { showToast('Mindestens eine Position eingeben', 'error'); return; }
    const autoPauschale: MaterialPosition[] = kleinteilActive
      ? [{ typ: 'material', beschreibung: 'Kleinteil Pauschale', menge: '1', stueckpreis: '10', preis: '10.00' }]
      : [];
    setSavingLocal(true);
    try {
      // Awaited so a rejected write keeps the sheet (and the user's input) open;
      // the save path already toasts the reason via syncOk().
      await onSave({
        offertNumber, customerId: cid, titel, positionen: [...ap, ...mp, ...autoPauschale], notizen, gueltigBis, zahlungsziel, status,
        ...zahlungsterms(),
        totalBetrag: (totA + totMeff).toFixed(2), totalArbeit: totA.toFixed(2),
        totalMaterial: totMeff.toFixed(2), totalZE: totZE,
      });
    } catch (e) {
      console.error('[Offerte] save failed:', e);
    } finally {
      setSavingLocal(false);
    }
  }

  const total = totA + totMeff;

  /** Anzahlung flag plus the matching terms: on fills in the Vorkasse terms unless
      own ones exist, off removes the Vorkasse terms again (same as in the Offerte view). */
  function zahlungsterms(): Pick<Offerte, 'anzahlungErforderlich' | 'zahlungsbedingung' | 'zusatznotiz'> {
    const zb = initial?.zahlungsbedingung?.trim() ?? '', zn = initial?.zusatznotiz?.trim() ?? '';
    if (mitAnzahlung) {
      return zb || zn
        ? { anzahlungErforderlich: true, zahlungsbedingung: initial?.zahlungsbedingung, zusatznotiz: initial?.zusatznotiz }
        : { anzahlungErforderlich: true, zahlungsbedingung: VORKASSE_BEDINGUNG, zusatznotiz: SCHLUSSRECHNUNG_NOTIZ };
    }
    const vorkasse = zb === VORKASSE_BEDINGUNG && [SCHLUSSRECHNUNG_NOTIZ, ''].includes(zn);
    return vorkasse
      ? { anzahlungErforderlich: false, zahlungsbedingung: undefined, zusatznotiz: undefined }
      : { anzahlungErforderlich: false, zahlungsbedingung: initial?.zahlungsbedingung, zusatznotiz: initial?.zusatznotiz };
  }

  return (
    <div className="df">

      {/* ── 1: Kunde & Details ── */}
      <FormCard title="Kunde & Details">
        <div className="df-grid">
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
            label="Offerte-Nr." value={nummer} onChange={setNummer} vorschlag={nummerVorschlag}
            suffix={initial?.version && initial.version > 1 ? `_${initial.version}` : undefined}
            vergeben={(() => { const n = parseNummer(nummer); return n != null && n !== initial?.offertNumber && nummerVergeben(n); })()}
          />
          <div className="cf-field">
            <label className="cf-label">Betreff</label>
            <input className="cf-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Inspektion, Reparatur…" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Gültig bis</label>
            <input className="cf-input" type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
          </div>
          <div className="cf-field">
            <label className="cf-label">Zahlungsziel (Tage)</label>
            <input className="cf-input" type="number" inputMode="numeric" min={1} value={zahlungsziel} onChange={(e) => setZahlungsziel(e.target.value)} placeholder="10" />
          </div>
          <label
            className="df-span2"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              background: mitAnzahlung ? 'rgba(0,122,255,0.12)' : 'var(--fill3)',
              border: `1px solid ${mitAnzahlung ? 'rgba(0,122,255,0.45)' : 'transparent'}`,
            }}
          >
            <input
              type="checkbox" checked={mitAnzahlung} onChange={(e) => setMitAnzahlung(e.target.checked)}
              style={{ width: 22, height: 22, accentColor: '#007AFF', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--label)' }}>{ANZAHLUNG_PROZENT}% Anzahlung verlangen</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--label2)', marginTop: 1 }}>
                {mitAnzahlung
                  ? 'Fällige Anzahlung wird im Total und im PDF ausgewiesen, Vorkasse-Bedingungen aktiv'
                  : 'Normale Offerte über 100% ohne Anzahlungshinweis'}
              </span>
            </span>
          </label>
          {initial && (
            <div className="cf-field df-span2">
              <label className="cf-label">Status</label>
              <select className="cf-select" value={status} onChange={(e) => setStatus(e.target.value as OfferteStatus)}>
                {STATUS_OPTS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
              </select>
            </div>
          )}
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
              placeholder="Interne Notizen zur Offerte…"
              rows={4}
            />
          </div>
          <div>
            <SummaryRow label="Arbeit" sub={totZE ? `${totZE} ZE` : null} value={fCHF(totA)} />
            <SummaryRow label="Material" value={fCHF(totM)} />
            {(() => {
              const mz = materialZeSumme(material);
              return mz.ze > 0 && <SummaryRow label="davon ZE zu Material" sub={`${mz.ze} ZE = ${Math.round(zeMinuten(mz.ze))} Min.`} value={fCHF(mz.betrag)} />;
            })()}
            {kleinteilActive && <SummaryRow label="Kleinteil Pauschale" sub="über 100 ZE" value={fCHF(kleinteilBetrag)} />}
            <SummaryRow label="Total" value={fCHF(total)} total />
            {mitAnzahlung && <SummaryRow label={`Fällige Anzahlung (${ANZAHLUNG_PROZENT}%)`} value={fCHF(anzahlungAufteilung(total).anzahlung)} />}
          </div>
        </div>
      </FormCard>

      <FormBar label="Total" value={fCHF(total)}>
        {initial
          ? <button className="mf-btn-cancel" onClick={onCancel} disabled={busy}>Abbrechen</button>
          : <button className="mf-btn-cancel" onClick={() => submit(true)} disabled={busy}>Als Entwurf speichern</button>}
        <button className="mf-btn-save" onClick={() => submit(false)} disabled={busy}>
          {busy
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner size={12} /> Speichern…</span>
            : initial ? 'Änderungen speichern' : 'Offerte erstellen'}
        </button>
      </FormBar>

    </div>
  );
}
