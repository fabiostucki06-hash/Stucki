import { useState, useEffect } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { SFPlus, SFXmark } from '../Icons';
import { PartLink, SaveStatus } from '../ui/DocForm';
import { useAutoSave } from '../../hooks/useAutoSave';
import { ActiveOfferteBanner } from './ActiveOfferte';
import PartsOrder from '../teile/PartsOrder';
import { exportOffertePDF, exportAuftragsbestaetigungPDF } from '../../lib/pdf-offerte';
import { CO_NAME, STD_SATZ } from '../../lib/company';
import { useSettings } from '../../hooks/useSettings';
import { formatDateCH, buildDocumentFilename, printWithFilename } from '../../lib/utils';
import { offerteNr, sumPositions, todayISO, roundToRappen, VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ, ANZAHLUNG_PROZENT, offerteNotizen, anzahlungErforderlich, anzahlungMoeglich, anzahlungAufteilung, sindVorkasseTerms } from '../../lib/offerte-docs';
import { materialPreis, zeBetrag } from '../../lib/ze';
import { setMaterialFeld } from '../../lib/marge';
import type { AuftragsBestaetigung, Customer, Offerte, OfferteStatus, Position, ArbeitPosition, MaterialPosition, Rechnung } from '../../types';

interface OfferteDetailProps {
  offerte: Offerte;
  customer: Customer | undefined;
  onClose: () => void;
  onUpdate: (upd: Offerte) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (off: Offerte) => void;
  onDuplicate: (offerte: Offerte) => Promise<void>;
  onCreateAuftrag?: (offerte: Offerte, acceptedIndices: number[]) => Promise<void>;
  onCreateRechnung?: (offerte: Offerte, acceptedIndices: number[]) => Promise<void>;
  /** Creates a reine Materialofferte as next version of this Offerte from the given positions. */
  onCreateMaterialofferte?: (offerte: Offerte, positionen: Position[]) => Promise<void>;
  /** Creates a 50% Vorkasse invoice listing the given (accepted) positions. */
  onCreateAnzahlung?: (offerte: Offerte, positionen: Position[]) => Promise<void>;
  /** Latest active Anzahlungsrechnung of this Offerte; enables "Schlussrechnung erstellen". */
  anzahlung?: Rechnung;
  /** Number of an existing Schlussrechnung for that Anzahlung, if any. */
  schlussrechnungNumber?: number;
  onCreateSchlussrechnung?: (anzahlung: Rechnung) => Promise<void>;
  /** Switches the sheet to the Auftragsbestätigungen view after an AB was created. */
  onShowAb?: () => void;
  /** 'ab' when opened from the Auftragsbestätigungen list: the sheet is then about
      the AB, so "Dokumente" offers only the AB PDF and prints as AB. */
  view?: 'ab';
}

const HDR: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: 'var(--label3)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 2, display: 'block',
  textShadow: '0 1px 3px rgba(0,0,0,0.30)',
};

type StatusMeta = { c: string; l: string };
const ST_META: Record<OfferteStatus, StatusMeta> = {
  entwurf:    { c: 'var(--label2)', l: 'Entwurf'    },
  versendet:  { c: 'var(--orange)', l: 'Versendet'  },
  angenommen: { c: 'var(--green)',  l: 'Angenommen' },
  abgelehnt:  { c: 'var(--red)',    l: 'Abgelehnt'  },
};

export default function OfferteDetail({ offerte, customer, onClose, onUpdate, onDelete, onEdit, onDuplicate, onCreateAuftrag, onCreateRechnung, onCreateMaterialofferte, onCreateAnzahlung, anzahlung, schlussrechnungNumber, onCreateSchlussrechnung, onShowAb, view }: OfferteDetailProps) {
  const [creatingSchluss, setCreatingSchluss] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [creatingAuftrag, setCreatingAuftrag] = useState(false);
  const [creatingRechnung, setCreatingRechnung] = useState(false);
  const [positionen, setPositionen] = useState<Position[]>(() => offerte.positionen ?? []);
  const [posAccepted, setPosAccepted] = useState<boolean[]>(() => (offerte.positionen ?? []).map(() => true));
  const [zahlungsziel, setZahlungsziel] = useState(offerte.zahlungsziel ?? '10');
  const [zahlungsbedingung, setZahlungsbedingung] = useState(offerte.zahlungsbedingung ?? '');
  const [zusatznotiz, setZusatznotiz] = useState(offerte.zusatznotiz ?? '');
  const [mitAnzahlung, setMitAnzahlung] = useState(() => anzahlungErforderlich(offerte));
  const [ab, setAb] = useState<AuftragsBestaetigung>(() => offerte.ab ?? {});
  /** Own signature, stored once in the settings; placed on every AB. */
  const { signature } = useSettings();
  const [creatingMat, setCreatingMat] = useState(false);
  const [creatingAnz, setCreatingAnz] = useState(false);
  const [creatingAb, setCreatingAb] = useState(false);
  const [dirty, setDirty] = useState(false);

  // The offerte prop can change under us while this component stays mounted
  // (edit sheet saved, background revalidate, another device). Re-seed the local
  // position state from the new prop — otherwise "Positionen speichern" writes the
  // stale snapshot back and silently overwrites those changes. Unsaved local edits
  // (dirty) win until they are saved or discarded.
  useEffect(() => {
    if (dirty) return;
    const pos = offerte.positionen ?? [];
    setPositionen(pos);
    setPosAccepted(pos.map(() => true));
    setZahlungsziel(offerte.zahlungsziel ?? '10');
    setZahlungsbedingung(offerte.zahlungsbedingung ?? '');
    setZusatznotiz(offerte.zusatznotiz ?? '');
    setMitAnzahlung(anzahlungErforderlich(offerte));
    setAb(offerte.ab ?? {});
  }, [dirty, offerte.id, offerte.positionen, offerte.zahlungsziel, offerte.zahlungsbedingung, offerte.zusatznotiz, offerte.anzahlungErforderlich, offerte.ab]);

  const [addingTyp, setAddingTyp] = useState<'arbeit' | 'material' | null>(null);
  const [newBeschreibung, setNewBeschreibung] = useState('');
  const [newZE, setNewZE] = useState('');
  const [newMenge, setNewMenge] = useState('1');
  const [newPreis, setNewPreis] = useState('');

  const sc = ST_META[offerte.status] ?? ST_META.entwurf;
  const isExpired = offerte.gueltigBis && new Date(offerte.gueltigBis) < new Date();

  const acceptedCount = posAccepted.filter(Boolean).length;

  /* ── live totals from local state ── */
  // Material = Menge × Stückpreis only; Arbeit = every ZE incl. those of material positions.
  const { totalArbeit, totalMaterial, totalZE } = sumPositions(positionen);

  const { totalArbeit: acceptedArbeit, totalMaterial: acceptedMaterial } = sumPositions(positionen.filter((_, i) => posAccepted[i]));
  const acceptedTotal = acceptedArbeit + acceptedMaterial;
  // Kleinteil Pauschale is a material position, listed on its own line in the totals.
  const acceptedKleinteil = positionen.filter((p, i) => posAccepted[i] && p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const acceptedMatPos = positionen.filter((p, i) => posAccepted[i] && p.typ === 'material');
  const hasTerms = !!(zahlungsbedingung || zusatznotiz);
  const nr = offerteNr(offerte);
  const docName = offerte.art === 'material' ? 'Materialofferte' : 'Offerte';
  const busy = creatingAuftrag || creatingRechnung || creatingMat || creatingAnz || creatingAb;

  /* "Dokumente" only offers the document this sheet is about: the AB in the AB
     view; a reine Materialofferte only itself; a Haupt-Offerte itself plus its
     AB once accepted. Drucken names the printout after that same document. */
  const isAbView = view === 'ab';
  const hasAb = offerte.status === 'angenommen' && positionen.length > 0;
  const showDocPdf = !isAbView;
  const showAbPdf = hasAb && (isAbView || offerte.art !== 'material');
  const printName = isAbView ? 'Auftragsbestätigung' : docName;

  /* AB fields: name / ort / datum default to the customer, workshop and today. */
  const abName = ab.name ?? (customer ? `${customer.vorname} ${customer.nachname}` : '');
  const abOrt = ab.ort ?? 'Thalheim AG';
  const abDatum = ab.datum ?? todayISO();

  function handleZahlungszielChange(val: string) {
    setZahlungsziel(val);
    setDirty(true);
  }

  function updAb(key: keyof AuftragsBestaetigung, val: string) {
    setAb((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  }

  /** 50% Anzahlung (Materialofferte only) on: the Vorkasse terms are filled in
      unless own terms exist. Off: billed at 100% again, the Vorkasse terms are removed. */
  function toggleAnzahlung(on: boolean) {
    setMitAnzahlung(on);
    if (on && !zahlungsbedingung.trim() && !zusatznotiz.trim()) {
      setZahlungsbedingung(VORKASSE_BEDINGUNG);
      setZusatznotiz(SCHLUSSRECHNUNG_NOTIZ);
    }
    if (!on && sindVorkasseTerms(zahlungsbedingung, zusatznotiz)) {
      setZahlungsbedingung('');
      setZusatznotiz('');
    }
    setDirty(true);
  }

  function removeTerms() {
    setZahlungsbedingung('');
    setZusatznotiz('');
    setMitAnzahlung(false);
    setDirty(true);
  }

  function togglePos(i: number, val: boolean) {
    setPosAccepted((prev) => { const n = [...prev]; n[i] = val; return n; });
  }

  function getAcceptedIndices() {
    return posAccepted.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  }

  function updPos(i: number, key: string, val: string) {
    setPositionen((prev) => {
      const next = [...prev];
      const cur = next[i];
      const pos = (cur.typ === 'material' ? setMaterialFeld(cur, key, val) : { ...cur, [key]: val }) as Position;
      if (pos.typ === 'arbeit') {
        // Arbeit is entered in ZE only; Arbeit Total = all ZE at the Std.Satz.
        pos.preis = zeBetrag(parseFloat((pos as ArbeitPosition).ze) || 0).toFixed(2);
      } else {
        // Menge × Stückpreis only; the ZE count as Arbeit (see positionTotals).
        const mp = pos as MaterialPosition;
        if (parseFloat(mp.stueckpreis) || parseFloat(mp.ze ?? '')) pos.preis = materialPreis(mp);
      }
      next[i] = pos;
      return next;
    });
    setDirty(true);
  }

  function removePosition(i: number) {
    setPositionen((prev) => prev.filter((_, j) => j !== i));
    setPosAccepted((prev) => prev.filter((_, j) => j !== i));
    setDirty(true);
  }

  function resetNewPos() {
    setAddingTyp(null);
    setNewBeschreibung('');
    setNewZE('');
    setNewMenge('1');
    setNewPreis('');
  }

  function addPosition() {
    if (!addingTyp || !newBeschreibung.trim()) return;
    const pos: Position = addingTyp === 'arbeit'
      ? {
          typ: 'arbeit',
          beschreibung: newBeschreibung.trim(),
          ze: newZE,
          stundenansatz: STD_SATZ,
          preis: zeBetrag(parseFloat(newZE) || 0).toFixed(2),
        }
      : {
          typ: 'material',
          beschreibung: newBeschreibung.trim(),
          menge: newMenge || '1',
          stueckpreis: newPreis || '0',
          preis: ((parseFloat(newMenge) || 1) * (parseFloat(newPreis) || 0)).toFixed(2),
        };
    setPositionen((prev) => [...prev, pos]);
    setPosAccepted((prev) => [...prev, true]);
    setDirty(true);
    resetNewPos();
  }

  /* Every write from this sheet goes through here, so a status change can't drop
     unsaved position edits and a position save can't drop the current status. */
  function buildPayload(patch?: Partial<Offerte>): Offerte {
    return {
      ...offerte,
      positionen,
      totalBetrag: (totalArbeit + totalMaterial).toFixed(2),
      totalArbeit: totalArbeit.toFixed(2),
      totalMaterial: totalMaterial.toFixed(2),
      totalZE,
      zahlungsziel,
      zahlungsbedingung: zahlungsbedingung || undefined,
      zusatznotiz: zusatznotiz || undefined,
      anzahlungErforderlich: mitAnzahlung,
      notizen: offerteNotizen(offerte.notizen, mitAnzahlung) || undefined,
      // AB data only exists once the Offerte was accepted (or already has some).
      ab: offerte.status === 'angenommen' || offerte.ab ? { ...ab, name: abName, ort: abOrt, datum: abDatum } : undefined,
      ...patch,
    };
  }

  /* Inline edits save themselves. Only the edited fields are compared, so the
     offerte prop coming back from a save doesn't count as a change; the write
     itself always goes through buildPayload. Once stored, the edits are no longer
     dirty and the local state follows the prop again. */
  const autoSave = useAutoSave(
    dirty ? { positionen, zahlungsziel, zahlungsbedingung, zusatznotiz, mitAnzahlung, ab } : null,
    () => onUpdate(buildPayload()),
  );
  useEffect(() => {
    if (autoSave.status === 'saved') setDirty(false);
  }, [autoSave.status]);
  /** The edit form starts from the inline edits, stored first so it can't overwrite them. */
  async function bearbeiten() {
    if (!dirty) { onEdit(offerte); return; }
    if (await autoSave.flush()) onEdit(buildPayload());
  }
  const saveStatus = (dirty || autoSave.status !== 'idle') && <SaveStatus status={autoSave.status} onRetry={autoSave.retry} />;

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      await onDuplicate(offerte);
    } finally {
      setDuplicating(false);
    }
  }

  async function handleCreateAuftrag() {
    if (!onCreateAuftrag || acceptedCount === 0) return;
    setCreatingAuftrag(true);
    try {
      await onCreateAuftrag(offerte, getAcceptedIndices());
    } finally {
      setCreatingAuftrag(false);
    }
  }

  /* The AB shows exactly what was accepted: same positions, totals and terms. */
  function abPayload(): Offerte {
    const pos = positionen.filter((_, i) => posAccepted[i]);
    const t = sumPositions(pos);
    return buildPayload({
      positionen: pos,
      totalArbeit: t.totalArbeit.toFixed(2),
      totalMaterial: t.totalMaterial.toFixed(2),
      totalBetrag: t.total.toFixed(2),
      totalZE: t.totalZE,
    });
  }

  async function handleExportAB() {
    if (dirty && !(await autoSave.flush())) return;
    exportAuftragsbestaetigungPDF(abPayload(), customer, signature);
  }

  /* The AB is this Offerte accepted: same positions, amounts, customer, notes and
     terms. Accepting stores the AB fields, then the AB PDF is generated and the
     sheet switches to the AB view. */
  async function handleCreateAb() {
    if (acceptedCount === 0) return;
    setCreatingAb(true);
    try {
      const abData = { ...ab, name: abName, ort: abOrt, datum: abDatum };
      if (offerte.status !== 'angenommen' || dirty) {
        await onUpdate(buildPayload({ status: 'angenommen', ab: abData }));
        setDirty(false);
      }
      await exportAuftragsbestaetigungPDF({ ...abPayload(), status: 'angenommen', ab: abData }, customer, signature);
      onShowAb?.();
    } catch {
      // onUpdate already toasted the reason.
    } finally {
      setCreatingAb(false);
    }
  }

  async function handleCreateMaterialofferte() {
    if (!onCreateMaterialofferte || acceptedMatPos.length === 0) return;
    setCreatingMat(true);
    try {
      await onCreateMaterialofferte(offerte, acceptedMatPos);
    } finally {
      setCreatingMat(false);
    }
  }

  async function handleCreateAnzahlung() {
    if (!onCreateAnzahlung || acceptedTotal <= 0) return;
    setCreatingAnz(true);
    try {
      await onCreateAnzahlung(offerte, positionen.filter((_, i) => posAccepted[i]));
    } finally {
      setCreatingAnz(false);
    }
  }

  async function handleCreateSchlussrechnung() {
    if (!onCreateSchlussrechnung || !anzahlung) return;
    if (schlussrechnungNumber != null && !window.confirm(`Für diese Anzahlung existiert bereits Schlussrechnung #${schlussrechnungNumber}. Trotzdem eine weitere erstellen?`)) return;
    setCreatingSchluss(true);
    try {
      await onCreateSchlussrechnung(anzahlung);
    } finally {
      setCreatingSchluss(false);
    }
  }

  async function handleCreateRechnung() {
    if (!onCreateRechnung || acceptedCount === 0) return;
    setCreatingRechnung(true);
    try {
      await onCreateRechnung(offerte, getAcceptedIndices());
    } finally {
      setCreatingRechnung(false);
    }
  }

  return (
    <Sheet
      title={`${docName} #${nr}`}
      onClose={onClose}
      full
      barRight={<button onClick={bearbeiten} className="bar-btn">Bearbeiten</button>}
    >
      <ActiveOfferteBanner offerte={offerte} customer={customer} />

      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: sc.c, letterSpacing: '0.34px' }}>{sc.l}</div>
        {offerte.titel && <div style={{ fontSize: 15, color: 'var(--label2)', marginTop: 4 }}>{offerte.titel}</div>}
        {(offerte.version ?? 1) > 1 && (
          <div style={{ fontSize: 13, color: 'var(--label3)', marginTop: 4 }}>
            Version {offerte.version}{offerte.art === 'material' ? ' · reine Materialofferte' : ''} · basiert auf Offerte #{offerte.offertNumber}
          </div>
        )}
      </div>

      {isExpired && offerte.status === 'versendet' && (
        <div className="alert-banner alert-danger" style={{ marginBottom: 12 }}>
          <span>⚠️</span><span className="sf-subhead">Offerte abgelaufen</span>
        </div>
      )}

      <p className="section-header">Status ändern</p>
      <div className="h-scroll" style={{ marginBottom: 20 }}>
        {(Object.entries(ST_META) as [OfferteStatus, StatusMeta][]).map(([s, meta]) => (
          <button
            key={s}
            onClick={async () => {
              setSaving(true);
              try {
                await onUpdate(buildPayload({ status: s }));
                setDirty(false);
              } catch {
                // onUpdate already toasted the reason; leave the old status selected.
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className={`pill-btn ${offerte.status === s ? 'pill-btn-active' : 'pill-btn-inactive'}`}
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            {saving && offerte.status === s ? <Spinner size={12} /> : meta.l}
          </button>
        ))}
      </div>

      {customer && (
        <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
          <div className="list-row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <div className="sf-headline">{customer.vorname} {customer.nachname}</div>
              <div className="sf-subhead" style={{ color: 'var(--label2)' }}>{customer.telefon} · {customer.kennzeichen}</div>
            </div>
          </div>
        </div>
      )}

      {offerte.gueltigBis && (
        <div className="sf-subhead" style={{ color: isExpired ? 'var(--red)' : 'var(--label2)', marginBottom: 12 }}>
          Gültig bis: {formatDateCH(offerte.gueltigBis)}{isExpired ? ' (abgelaufen)' : ''}
        </div>
      )}

      {anzahlungMoeglich(offerte) && <label
        className="glass-panel no-print"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 12, cursor: 'pointer' }}
      >
        <input
          type="checkbox" checked={mitAnzahlung} onChange={(e) => toggleAnzahlung(e.target.checked)}
          style={{ width: 22, height: 22, accentColor: '#007AFF', flexShrink: 0, cursor: 'pointer' }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--label)' }}>{ANZAHLUNG_PROZENT}% Anzahlung erforderlich</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--label2)', marginTop: 1 }}>
            {mitAnzahlung
              ? `Materialofferte und PDF weisen die Anzahlung von CHF ${anzahlungAufteilung(totalArbeit + totalMaterial).anzahlung.toFixed(2)} und den Bestellhinweis aus, Vorkasse-Bedingungen aktiv`
              : 'Materialofferte über 100% ohne Anzahlung und Bestellhinweis'}
          </span>
        </span>
      </label>}

      {hasTerms ? (
        <div className="glass-panel doc-terms">
          <div className="ab-panel-title">Zahlungsbedingungen</div>
          <div className="cf-field">
            <label className="cf-label">Bemerkung / Zahlungsbedingung</label>
            <textarea className="cf-textarea" rows={2} value={zahlungsbedingung} onChange={(e) => { setZahlungsbedingung(e.target.value); setDirty(true); }} />
          </div>
          <div className="cf-field">
            <label className="cf-label">Zusatznotiz</label>
            <textarea className="cf-textarea" rows={2} value={zusatznotiz} onChange={(e) => { setZusatznotiz(e.target.value); setDirty(true); }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={removeTerms} className="mf-btn-cancel">Standard (Tage netto) verwenden</button>
          </div>
        </div>
      ) : (
      <div style={{ background: 'rgba(52,199,89,0.09)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid rgba(52,199,89,0.22)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, color: 'var(--green)' }}>✓</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Zahlungsziel:</span>
        <input
          type="number"
          value={zahlungsziel}
          onChange={(e) => handleZahlungszielChange(e.target.value)}
          min={1}
          style={{
            width: 48, padding: '3px 6px', fontSize: 15, fontWeight: 700, color: '#ffffff',
            background: 'var(--input-bg)', border: '1.5px solid rgba(52,199,89,0.55)',
            borderRadius: 6, textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Tage netto</span>
      </div>
      )}

      {/* ── Positionen – inline editable mit Accept/Reject ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
        <p className="section-header" style={{ margin: 0 }}>Positionen</p>
        {saveStatus && <span style={{ marginRight: 20 }}>{saveStatus}</span>}
      </div>
      <div className="inset-grouped-list" style={{ marginBottom: 8, marginTop: 8 }}>
        {positionen.map((pos, i) => {
          const accepted = posAccepted[i] ?? true;
          return (
            <div
              key={i}
              className="list-row"
              style={{
                cursor: 'default',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 8,
                opacity: accepted ? 1 : 0.45,
                transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sf-subhead" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pos.beschreibung}</div>
                  <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {pos.typ === 'arbeit' ? 'Arbeit' : <>Material <PartLink url={pos.link} /></>}
                  </div>
                </div>

                {/* Inline editable inputs */}
                {pos.typ === 'arbeit' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={HDR}>ZE</span>
                      <input
                        className="mf-pos-num"
                        type="number"
                        value={(pos as ArbeitPosition).ze}
                        onChange={(e) => updPos(i, 'ze', e.target.value)}
                        placeholder="—"
                        min={0}
                        style={{ width: 44, padding: '3px 5px', fontSize: 13 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={HDR}>ST.</span>
                      <input
                        className="mf-pos-num"
                        type="number"
                        value={(pos as MaterialPosition).menge}
                        onChange={(e) => updPos(i, 'menge', e.target.value)}
                        min={1}
                        style={{ width: 40, padding: '3px 5px', fontSize: 13 }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--label3)', paddingBottom: 4, flexShrink: 0 }}>×</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={HDR}>CHF</span>
                      <input
                        className="mf-pos-num"
                        type="number"
                        value={(pos as MaterialPosition).stueckpreis}
                        onChange={(e) => updPos(i, 'stueckpreis', e.target.value)}
                        placeholder="0.00"
                        min={0}
                        style={{ width: 58, padding: '3px 5px', fontSize: 13 }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--label)', flexShrink: 0, minWidth: 68, textAlign: 'right' }}>
                  {pos.typ === 'arbeit' ? '—' : `CHF ${(parseFloat(pos.preis || '0')).toFixed(2)}`}
                </div>

                <button
                  onClick={() => removePosition(i)}
                  className="del-btn-visible"
                  title="Position löschen"
                  aria-label="Position löschen"
                >
                  <SFXmark />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => togglePos(i, true)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, cursor: 'pointer',
                    background: accepted ? 'rgba(52,199,89,0.15)' : 'var(--fill3)',
                    color: accepted ? 'var(--green)' : 'var(--label3)',
                    border: accepted ? '1px solid rgba(52,199,89,0.3)' : '1px solid rgba(0,0,0,0.08)',
                    transition: 'all 0.12s',
                  }}
                >✓ Angenommen</button>
                <button
                  onClick={() => togglePos(i, false)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100, cursor: 'pointer',
                    background: !accepted ? 'rgba(255,59,48,0.12)' : 'var(--fill3)',
                    color: !accepted ? 'var(--red)' : 'var(--label3)',
                    border: !accepted ? '1px solid rgba(255,59,48,0.25)' : '1px solid rgba(0,0,0,0.08)',
                    transition: 'all 0.12s',
                  }}
                >✕ Abgelehnt</button>
              </div>
            </div>
          );
        })}

        {/* ── Add new position ── */}
        <div style={{ padding: '10px 16px' }}>
          {!addingTyp ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAddingTyp('arbeit')} className="mf-add-pos"><SFPlus size={12} /> Arbeitsposition</button>
              <button onClick={() => setAddingTyp('material')} className="mf-add-pos green"><SFPlus size={12} /> Materialposition</button>
            </div>
          ) : (
            <div onKeyDown={(e) => {
              // Keyboard entry: Enter adds the position, Escape cancels it.
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); addPosition(); }
              else if (e.key === 'Escape') { e.preventDefault(); resetNewPos(); }
            }}>
              <div className="cf-field" style={{ marginBottom: 8 }}>
                <label className="cf-label">Bezeichnung</label>
                <input
                  className="cf-input"
                  value={newBeschreibung}
                  onChange={(e) => setNewBeschreibung(e.target.value)}
                  placeholder={addingTyp === 'arbeit' ? 'z.B. Ölwechsel' : 'z.B. Ölfilter'}
                  autoFocus
                />
              </div>
              {addingTyp === 'arbeit' ? (
                <div className="cf-grid-2" style={{ marginBottom: 10 }}>
                  <div className="cf-field">
                    <label className="cf-label">ZE</label>
                    <input className="cf-input" type="number" min={0} value={newZE} onChange={(e) => setNewZE(e.target.value)} placeholder="0" />
                  </div>
                </div>
              ) : (
                <div className="cf-grid-2" style={{ marginBottom: 10 }}>
                  <div className="cf-field">
                    <label className="cf-label">Stk.</label>
                    <input className="cf-input" type="number" min={1} value={newMenge} onChange={(e) => setNewMenge(e.target.value)} placeholder="1" />
                  </div>
                  <div className="cf-field">
                    <label className="cf-label">CHF</label>
                    <input className="cf-input" type="number" min={0} value={newPreis} onChange={(e) => setNewPreis(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={resetNewPos} className="mf-btn-cancel">Abbrechen</button>
                <button onClick={addPosition} disabled={!newBeschreibung.trim()} className="mf-btn-save">Hinzufügen</button>
              </div>
            </div>
          )}
        </div>

        {/* Accepted subtotal */}
        {positionen.length > 0 && (
          <div className="list-row" style={{ cursor: 'default', background: 'rgba(0,122,255,0.06)', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            {([
              ['Material Total', acceptedMaterial - acceptedKleinteil, positionen.some((p) => p.typ === 'material' && p.beschreibung !== 'Kleinteil Pauschale')],
              ['Arbeit Total', acceptedArbeit, acceptedArbeit > 0 || positionen.some((p) => p.typ === 'arbeit')],
              ['Kleinteil Pauschale', acceptedKleinteil, acceptedKleinteil > 0],
            ] as [string, number, boolean][]).filter(([, , show]) => show).map(([label, betrag]) => (
              <div key={label} style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 14, color: 'var(--label2)' }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>CHF {betrag.toFixed(2)}</div>
              </div>
            ))}
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', marginTop: 4 }}>
              <div className="sf-headline" style={{ flex: 1 }}>
                Total Angenommen
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--label3)', marginLeft: 6 }}>
                  ({acceptedCount}/{positionen.length})
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)' }}>
                CHF {acceptedTotal.toFixed(2)}
              </div>
            </div>
            {mitAnzahlung && (() => {
              const { anzahlung: anz, rest } = anzahlungAufteilung(acceptedTotal);
              return (
                <>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>Fällige Anzahlung ({ANZAHLUNG_PROZENT}%)</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--label)' }}>CHF {anz.toFixed(2)}</div>
                  </div>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--label2)' }}>Restbetrag {100 - ANZAHLUNG_PROZENT}% (mit Schlussrechnung)</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>CHF {rest.toFixed(2)}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {offerte.status === 'angenommen' && (
        <PartsOrder
          docLabel={`${docName} #${nr}`}
          positionen={positionen}
          onSave={async (pos, materialStatus) => {
            await onUpdate(buildPayload({ positionen: pos, materialStatus }));
            setPositionen(pos);
            setDirty(false);
          }}
        />
      )}

      {/* ── Auftragsbestätigung (nur bei angenommener Offerte) ── */}
      {offerte.status === 'angenommen' && positionen.length > 0 && (
        <div className="glass-panel ab-panel">
          <div className="ab-panel-title">Auftragsbestätigung</div>
          <div className="sf-subhead" style={{ color: 'var(--label2)', marginBottom: 12 }}>
            Gleicher Inhalt und Zahlungsbedingungen wie {docName} #{nr} · {acceptedCount} Positionen · CHF {acceptedTotal.toFixed(2)}
          </div>
          <div className="cf-field" style={{ marginBottom: 10 }}>
            <label className="cf-label">Ungefährer Zeitpunkt der Fertigstellung</label>
            <input className="cf-input" value={ab.fertigstellung ?? ''} onChange={(e) => updAb('fertigstellung', e.target.value)} placeholder="z.B. KW 45 / Ende November" />
          </div>
          {/* Signature blocks: hidden on screen, printed only (same layout as the PDF).
              Werkstatt is filled from the settings; the Kunde block keeps Ort, Datum,
              Name and Unterschrift blank to be filled in and signed by hand. */}
          <div className="ab-sig-print" aria-hidden="true">
            <div className="ab-sig-block">
              <div className="ab-sig-role">Auftragnehmer / Werkstatt</div>
              <div className="ab-sig-row"><span className="ab-sig-lbl">Ort, Datum</span><span className="ab-sig-val">{abOrt}, {formatDateCH(abDatum)}</span></div>
              <div className="ab-sig-row"><span className="ab-sig-lbl">Name</span><span className="ab-sig-val ab-sig-strong">{CO_NAME}</span></div>
              <div className="ab-sig-area">{signature && <img src={signature} alt="" />}</div>
              <div className="ab-sig-caption">Unterschrift Werkstatt</div>
            </div>
            <div className="ab-sig-block">
              <div className="ab-sig-role">Auftraggeber / Kunde</div>
              <div className="ab-sig-row"><span className="ab-sig-lbl">Ort, Datum</span><span className="ab-sig-val ab-sig-blank" /></div>
              <div className="ab-sig-row"><span className="ab-sig-lbl">Name</span><span className="ab-sig-val ab-sig-blank" /></div>
              <div className="ab-sig-area" />
              <div className="ab-sig-caption">Unterschrift Kunde</div>
            </div>
          </div>
          {saveStatus && <div style={{ marginTop: 14 }}>{saveStatus}</div>}
        </div>
      )}

      {offerteNotizen(offerte.notizen, mitAnzahlung) && <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16, whiteSpace: 'pre-line' }}>{offerteNotizen(offerte.notizen, mitAnzahlung)}</div>}

      {/* ── Aktionen, gruppiert. Screen only: buttons never print, so the
          group panels are left out of the printout entirely (no-print). ── */}

      {/* PDF / Druck: one button per document, nothing twice. */}
      <div className="glass-panel doc-group no-print">
        <div className="ab-panel-title">Dokumente</div>
        <div className="doc-btn-grid">
          {showDocPdf && (
            <button onClick={() => exportOffertePDF(buildPayload(), customer)} className={`btn-system btn-primary${showAbPdf ? '' : ' doc-btn-full'}`}>
              {docName} als PDF
            </button>
          )}
          {showAbPdf && (
            <button onClick={handleExportAB} disabled={autoSave.status === 'saving' || acceptedCount === 0} className={`btn-system btn-primary${showDocPdf ? '' : ' doc-btn-full'}`}>
              AB als PDF
            </button>
          )}
          <button onClick={() => printWithFilename(buildDocumentFilename(customer, printName, nr))} className="btn-system btn-secondary doc-btn-full">
            {isAbView ? 'AB drucken' : `${docName} drucken`}
          </button>
        </div>
        <div className="doc-group-hint">PDFs werden zusätzlich auf Google Drive abgelegt (GarageOS / Dokumenttyp / Jahr).</div>
      </div>

      {/* Folgedokumente aus den angenommenen Positionen. */}
      {positionen.length > 0 && (!isAbView || onCreateAuftrag || onCreateRechnung || onCreateMaterialofferte || onCreateAnzahlung || (onCreateSchlussrechnung && anzahlung)) && (
        <div className="glass-panel doc-group no-print">
          <div className="ab-panel-title">Weiterverarbeiten · {acceptedCount} Positionen</div>
          <div className="doc-btn-grid">
            {onCreateAuftrag && (
              <button onClick={handleCreateAuftrag} disabled={busy || acceptedCount === 0} className="btn-system btn-primary">
                {creatingAuftrag ? <><Spinner size={13} />&nbsp; Wird erstellt…</> : 'Auftrag erstellen'}
              </button>
            )}
            {onCreateRechnung && (
              <button onClick={handleCreateRechnung} disabled={busy || acceptedCount === 0} className="btn-system btn-green">
                {creatingRechnung ? <><Spinner size={13} />&nbsp; Wird erstellt…</> : 'Rechnung erstellen'}
              </button>
            )}
            {!isAbView && (
              <button onClick={handleCreateAb} disabled={busy || acceptedCount === 0} className="btn-system btn-primary doc-btn-full">
                {creatingAb ? <><Spinner size={13} />&nbsp; Wird erstellt…</> : 'Auftragsbestätigung erstellen'}
              </button>
            )}
            {onCreateMaterialofferte && acceptedMatPos.length > 0 && (
              <button onClick={handleCreateMaterialofferte} disabled={busy} className="btn-system btn-secondary doc-btn-full">
                {creatingMat ? <><Spinner size={13} />&nbsp; Wird erstellt…</> : `Materialofferte erstellen (${acceptedMatPos.length} Pos.)`}
              </button>
            )}
            {onCreateAnzahlung && (
              <button onClick={handleCreateAnzahlung} disabled={busy || acceptedTotal <= 0} className="btn-system btn-green doc-btn-full">
                {creatingAnz
                  ? <><Spinner size={13} />&nbsp; Wird erstellt…</>
                  : `Anzahlungsrechnung ${ANZAHLUNG_PROZENT}% · CHF ${roundToRappen(acceptedTotal * ANZAHLUNG_PROZENT / 100).toFixed(2)}`}
              </button>
            )}
            {onCreateSchlussrechnung && anzahlung && (
              <button onClick={handleCreateSchlussrechnung} disabled={busy || creatingSchluss} className="btn-system btn-primary doc-btn-full">
                {creatingSchluss
                  ? <><Spinner size={13} />&nbsp; Wird erstellt…</>
                  : `Schlussrechnung erstellen (abzgl. Anzahlung #${anzahlung.rechnungNumber})`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="glass-panel doc-group no-print">
        <div className="ab-panel-title">Verwalten</div>
        <div className="doc-btn-grid">
          <button onClick={handleDuplicate} disabled={duplicating} className="btn-system btn-secondary">
            {duplicating ? <><Spinner size={13} />&nbsp; Wird dupliziert…</> : 'Duplizieren'}
          </button>
          <button onClick={async () => { if (window.confirm(`${docName} löschen?`)) await onDelete(offerte.id); }} className="btn-system btn-destructive">Löschen</button>
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--label3)', textAlign: 'center' }}>Erstellt: {formatDateCH(offerte.createdAt)} · {docName} #{nr}</div>
    </Sheet>
  );
}
