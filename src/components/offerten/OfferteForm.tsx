import { useRef, useState } from 'react';
import { FormCard, FormBar, SaveStatus, SummaryRow, VehicleChips, PositionenEditor, fCHF, type ArbeitRow, type MaterialRow } from '../ui/DocForm';
import type { Customer, ArbeitPosition, MaterialPosition, Offerte, OfferteStatus } from '../../types';
import { offerteNotizen, anzahlungErforderlich, anzahlungMoeglich, anzahlungAufteilung, sindVorkasseTerms, ANZAHLUNG_PROZENT, VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ } from '../../lib/offerte-docs';
import NummerField, { parseNummer } from '../ui/NummerField';
import { materialPreis, materialZeSumme, ohneMaterialZe, positionTotals, zeBetrag, zeMinuten } from '../../lib/ze';
import { setMaterialFeld } from '../../lib/marge';
import { useAutoSave } from '../../hooks/useAutoSave';

type OfferteData = Omit<Offerte, 'id' | 'offertNumber' | 'createdAt'> & { offertNumber: number };

const STATUS_OPTS: [OfferteStatus, string][] = [
  ['entwurf',    'Entwurf'],
  ['versendet',  'Versendet'],
  ['angenommen', 'Angenommen'],
  ['abgelehnt',  'Abgelehnt'],
];

interface OfferteFormProps {
  customers: Customer[];
  /** Auto-save: `existing` is the stored Offerte (none yet for a new one, which
      creates it); resolves with the row as stored and rejects when the write failed. */
  onSave: (data: OfferteData, existing?: Offerte) => Promise<Offerte>;
  /** "Fertig": everything is saved; `saved` is the stored Offerte, if any. */
  onDone: (saved?: Offerte) => void;
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

export default function OfferteForm({ customers, onSave, onDone, initial, prefillMaterial, prefillCustomerId, nummerVorschlag, nummerVergeben }: OfferteFormProps) {
  // Kept from the start: once a new Offerte is stored, the next free number moves on.
  const [vorschlag] = useState(nummerVorschlag);
  const [nummer, setNummer] = useState(String(initial?.offertNumber ?? vorschlag));
  /* The Offerte as last stored. The ref feeds the save chain (a quick second save
     must update the Offerte the first one created), the state the render. */
  const savedRef = useRef<Offerte | undefined>(initial);
  const [saved, setSaved] = useState<Offerte | undefined>(initial);
  // A taken number is only used after "Trotzdem verwenden".
  const [dupOk, setDupOk] = useState<number | null>(null);
  // Only a Materialofferte offers the 50% Anzahlung; a new Offerte from this form is a normal one.
  const istMaterial = !!initial && anzahlungMoeglich(initial);
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
    // A Materialofferte prices the parts only: no ZE on its positions.
    if (mp.length) return istMaterial ? mp.map(ohneMaterialZe) : [...mp];
    if (!initial && prefillMaterial) return [{ ...prefillMaterial }];
    return [newMaterial()];
  });
  const [notizen,    setNotizen]    = useState(() => offerteNotizen(initial?.notizen, initial ? anzahlungErforderlich(initial) : false));
  const [gueltigBis, setGueltigBis] = useState(initial?.gueltigBis ?? '');
  const [zahlungsziel, setZahlungsziel] = useState(initial?.zahlungsziel ?? '10');
  const [status,     setStatus]     = useState<OfferteStatus>(initial?.status ?? 'entwurf');

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
    n[i].preis = ze ? zeBetrag(ze).toFixed(2) : '';
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
        const n = [...a]; const ze = parseFloat(r.ze) || 0;
        n[i] = { ...n[i], ze: r.ze, zeKI: true, zeHint: r.begruendung, zeLoading: false, preis: ze ? zeBetrag(ze).toFixed(2) : '' };
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

  // Material = Menge × Stückpreis only; Arbeit = every ZE (incl. material positions) at its rate.
  const { totalArbeit: totA, totalMaterial: totM, totalZE: totZE } = positionTotals([...material, ...arbeit.map(toArbeitPosition)]);
  const kleinteilActive = totZE > 100;
  const kleinteilBetrag = kleinteilActive ? 10 : 0;
  const totMeff = totM + kleinteilBetrag;

  const nr = parseNummer(nummer);
  // Only a changed number is checked: an existing duplicate doesn't block every save.
  const nrVergeben = nr != null && nr !== saved?.offertNumber && nummerVergeben(nr);
  const hatInhalt = !!titel.trim() || arbeit.some((p) => p.beschreibung.trim()) || material.some((p) => p.beschreibung.trim());

  /** Why the current input isn't saved (null: it is). A new Offerte is only
      created once there is a customer and something to offer. */
  const hinweis =
    !cid ? (saved ? 'Kunde fehlt – nicht gespeichert' : 'Speichert automatisch, sobald ein Kunde gewählt ist')
    : nr == null ? 'Ungültige Offerte-Nr. – nicht gespeichert'
    : nrVergeben && dupOk !== nr ? `Nr. ${nr} existiert bereits – nicht gespeichert`
    : !saved && !hatInhalt ? 'Speichert automatisch, sobald Betreff oder Position erfasst ist'
    : null;

  const autoPauschale: MaterialPosition[] = kleinteilActive
    ? [{ typ: 'material', beschreibung: 'Kleinteil Pauschale', menge: '1', stueckpreis: '10', preis: '10.00' }]
    : [];
  const data: OfferteData | null = hinweis || nr == null ? null : {
    offertNumber: nr, customerId: cid, titel,
    positionen: [...material.filter((p) => p.beschreibung.trim()), ...autoPauschale, ...arbeit.filter((p) => p.beschreibung.trim()).map(toArbeitPosition)],
    notizen, gueltigBis, zahlungsziel, status,
    ...zahlungsterms(),
    totalBetrag: (totA + totMeff).toFixed(2), totalArbeit: totA.toFixed(2),
    totalMaterial: totMeff.toFixed(2), totalZE: totZE,
  };

  const autoSave = useAutoSave(data, async (d) => {
    const s = await onSave(d, savedRef.current);
    savedRef.current = s;
    setSaved(s);
  }, { unsaved: !initial });

  /** Saves what's still pending, then closes. A failed save keeps the form open. */
  async function fertig() {
    if (hinweis && (saved || hatInhalt) && !window.confirm(`${hinweis}. Trotzdem schliessen?`)) return;
    if (await autoSave.flush()) onDone(savedRef.current);
  }

  const total = totA + totMeff;

  /** The legal material hint in the Notizen comes and goes with the checkbox. */
  function toggleAnzahlung(on: boolean) {
    setMitAnzahlung(on);
    setNotizen((n) => offerteNotizen(n, on));
  }

  /** Anzahlung flag plus the matching terms: on fills in the Vorkasse terms unless
      own ones exist, off (always on a normal Offerte) removes the Vorkasse terms
      again (same as in the Offerte view). */
  function zahlungsterms(): Pick<Offerte, 'anzahlungErforderlich' | 'zahlungsbedingung' | 'zusatznotiz'> {
    const zb = saved?.zahlungsbedingung?.trim() ?? '', zn = saved?.zusatznotiz?.trim() ?? '';
    if (mitAnzahlung) {
      return zb || zn
        ? { anzahlungErforderlich: true, zahlungsbedingung: saved?.zahlungsbedingung, zusatznotiz: saved?.zusatznotiz }
        : { anzahlungErforderlich: true, zahlungsbedingung: VORKASSE_BEDINGUNG, zusatznotiz: SCHLUSSRECHNUNG_NOTIZ };
    }
    return sindVorkasseTerms(zb, zn)
      ? { anzahlungErforderlich: false, zahlungsbedingung: undefined, zusatznotiz: undefined }
      : { anzahlungErforderlich: false, zahlungsbedingung: saved?.zahlungsbedingung, zusatznotiz: saved?.zusatznotiz };
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
            label="Offerte-Nr." value={nummer} onChange={setNummer} vorschlag={vorschlag}
            suffix={initial?.version && initial.version > 1 ? `_${initial.version}` : undefined}
            vergeben={nrVergeben}
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
          {istMaterial && <label
            className="df-span2"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              background: mitAnzahlung ? 'rgba(0,122,255,0.12)' : 'var(--fill3)',
              border: `1px solid ${mitAnzahlung ? 'rgba(0,122,255,0.45)' : 'transparent'}`,
            }}
          >
            <input
              type="checkbox" checked={mitAnzahlung} onChange={(e) => toggleAnzahlung(e.target.checked)}
              style={{ width: 22, height: 22, accentColor: '#007AFF', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--label)' }}>{ANZAHLUNG_PROZENT}% Anzahlung erforderlich</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--label2)', marginTop: 1 }}>
                {mitAnzahlung
                  ? 'Anzahlung wird im Total und im PDF ausgewiesen, Bestellhinweis in den Notizen, Vorkasse-Bedingungen aktiv'
                  : 'Materialofferte über 100% ohne Anzahlung und Bestellhinweis'}
              </span>
            </span>
          </label>}
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
          ohneZe={istMaterial}
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
            <SummaryRow label="Material Total" value={fCHF(totM)} />
            <SummaryRow label="Arbeit Total" sub={totZE ? `${totZE} ZE` : null} value={fCHF(totA)} />
            {(() => {
              const mz = materialZeSumme(material);
              return mz.ze > 0 && <SummaryRow label="inkl. ZE zu Material" sub={`${mz.ze} ZE = ${Math.round(zeMinuten(mz.ze))} Min.`} value={fCHF(mz.betrag)} />;
            })()}
            {kleinteilActive && <SummaryRow label="Kleinteil Pauschale" sub="über 100 ZE" value={fCHF(kleinteilBetrag)} />}
            <SummaryRow label="Total" value={fCHF(total)} total />
            {mitAnzahlung && <SummaryRow label={`Fällige Anzahlung (${ANZAHLUNG_PROZENT}%)`} value={fCHF(anzahlungAufteilung(total).anzahlung)} />}
          </div>
        </div>
      </FormCard>

      <FormBar
        label="Total" value={fCHF(total)}
        status={
          <SaveStatus
            status={autoSave.status} onRetry={autoSave.retry} hinweis={hinweis}
            action={nr != null && nrVergeben && dupOk !== nr && cid ? { label: 'Trotzdem verwenden', onClick: () => setDupOk(nr) } : undefined}
          />
        }
      >
        <button className="mf-btn-save" onClick={fertig}>Fertig</button>
      </FormBar>

    </div>
  );
}
