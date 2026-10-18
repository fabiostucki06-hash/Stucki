import { useState, useEffect } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus, SFXmark } from '../Icons';
import { PartLink } from '../ui/DocForm';
import { ActiveOfferteBanner } from './ActiveOfferte';
import PartsOrder from '../teile/PartsOrder';
import { exportOffertePDF, exportAuftragsbestaetigungPDF, CO_NAME } from '../../lib/pdf-offerte';
import { useSettings } from '../../hooks/useSettings';
import { formatDateCH, buildDocumentFilename, printWithFilename } from '../../lib/utils';
import { offerteNr, sumPositions, todayISO, roundToRappen, VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ, ANZAHLUNG_PROZENT } from '../../lib/offerte-docs';
import type { AuftragsBestaetigung, Customer, Offerte, OfferteStatus, Position, ArbeitPosition, MaterialPosition } from '../../types';

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
  /** Creates a 50% Vorkasse invoice over `total`. */
  onCreateAnzahlung?: (offerte: Offerte, total: number) => Promise<void>;
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

export default function OfferteDetail({ offerte, customer, onClose, onUpdate, onDelete, onEdit, onDuplicate, onCreateAuftrag, onCreateRechnung, onCreateMaterialofferte, onCreateAnzahlung }: OfferteDetailProps) {
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [creatingAuftrag, setCreatingAuftrag] = useState(false);
  const [creatingRechnung, setCreatingRechnung] = useState(false);
  const [positionen, setPositionen] = useState<Position[]>(() => offerte.positionen ?? []);
  const [posAccepted, setPosAccepted] = useState<boolean[]>(() => (offerte.positionen ?? []).map(() => true));
  const [zahlungsziel, setZahlungsziel] = useState(offerte.zahlungsziel ?? '10');
  const [zahlungsbedingung, setZahlungsbedingung] = useState(offerte.zahlungsbedingung ?? '');
  const [zusatznotiz, setZusatznotiz] = useState(offerte.zusatznotiz ?? '');
  const [ab, setAb] = useState<AuftragsBestaetigung>(() => offerte.ab ?? {});
  /** Own signature, stored once in the settings; placed on every AB. */
  const { signature } = useSettings();
  const [creatingMat, setCreatingMat] = useState(false);
  const [creatingAnz, setCreatingAnz] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [posSaving, setPosSaving] = useState(false);

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
    setAb(offerte.ab ?? {});
  }, [dirty, offerte.id, offerte.positionen, offerte.zahlungsziel, offerte.zahlungsbedingung, offerte.zusatznotiz, offerte.ab]);

  const [addingTyp, setAddingTyp] = useState<'arbeit' | 'material' | null>(null);
  const [newBeschreibung, setNewBeschreibung] = useState('');
  const [newZE, setNewZE] = useState('');
  const [newAW, setNewAW] = useState('80');
  const [newMenge, setNewMenge] = useState('1');
  const [newPreis, setNewPreis] = useState('');

  const sc = ST_META[offerte.status] ?? ST_META.entwurf;
  const isExpired = offerte.gueltigBis && new Date(offerte.gueltigBis) < new Date();

  const acceptedCount = posAccepted.filter(Boolean).length;

  /* ── live totals from local state ── */
  const totalArbeit = positionen.filter((p) => p.typ === 'arbeit')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const totalMaterial = positionen.filter((p) => p.typ === 'material')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const totalZE = positionen.filter((p): p is ArbeitPosition => p.typ === 'arbeit')
    .reduce((s, p) => s + (parseFloat(p.ze || '0') || 0), 0);

  const acceptedArbeit = positionen.filter((p, i) => posAccepted[i] && p.typ === 'arbeit')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const acceptedMaterial = positionen.filter((p, i) => posAccepted[i] && p.typ === 'material')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const acceptedTotal = acceptedArbeit + acceptedMaterial;
  const acceptedMatPos = positionen.filter((p, i) => posAccepted[i] && p.typ === 'material');
  const hasTerms = !!(zahlungsbedingung || zusatznotiz);
  const nr = offerteNr(offerte);
  const docName = offerte.art === 'material' ? 'Materialofferte' : 'Offerte';
  const busy = creatingAuftrag || creatingRechnung || creatingMat || creatingAnz;

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

  function applyVorkasse() {
    setZahlungsbedingung(VORKASSE_BEDINGUNG);
    setZusatznotiz(SCHLUSSRECHNUNG_NOTIZ);
    setDirty(true);
  }

  function removeTerms() {
    setZahlungsbedingung('');
    setZusatznotiz('');
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
      const pos = { ...next[i], [key]: val } as Position;
      if (pos.typ === 'arbeit') {
        const ze = parseFloat(key === 'ze' ? val : (pos as ArbeitPosition).ze) || 0;
        const sa = parseFloat(key === 'stundenansatz' ? val : (pos as ArbeitPosition).stundenansatz) || 0;
        if (ze && sa) pos.preis = ((ze / 100) * sa).toFixed(2);
      } else {
        const mg = parseFloat(key === 'menge' ? val : (pos as MaterialPosition).menge) || 1;
        const sp = parseFloat(key === 'stueckpreis' ? val : (pos as MaterialPosition).stueckpreis) || 0;
        if (sp) pos.preis = (sp * mg).toFixed(2);
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
    setNewAW('80');
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
          stundenansatz: newAW || '80',
          preis: (((parseFloat(newZE) || 0) / 100) * (parseFloat(newAW) || 0)).toFixed(2),
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
      // AB data only exists once the Offerte was accepted (or already has some).
      ab: offerte.status === 'angenommen' || offerte.ab ? { ...ab, name: abName, ort: abOrt, datum: abDatum } : undefined,
      ...patch,
    };
  }

  async function savePositionen(msg = 'Positionen gespeichert') {
    setPosSaving(true);
    try {
      await onUpdate(buildPayload());
      setDirty(false);
      showToast(msg, 'success');
    } catch {
      // onUpdate already toasted the concrete reason; keep the edits marked dirty.
    } finally {
      setPosSaving(false);
    }
  }

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
    if (dirty) await savePositionen('Auftragsbestätigung gespeichert');
    exportAuftragsbestaetigungPDF(abPayload(), customer, signature);
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
      await onCreateAnzahlung(offerte, acceptedTotal);
    } finally {
      setCreatingAnz(false);
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
      barRight={<button onClick={() => onEdit(offerte)} className="bar-btn">Bearbeiten</button>}
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
        <button onClick={applyVorkasse} className="mf-btn-cancel" style={{ marginLeft: 'auto' }}>50% Vorkasse</button>
      </div>
      )}

      {/* ── Positionen – inline editable mit Accept/Reject ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
        <p className="section-header" style={{ margin: 0 }}>Positionen</p>
        {dirty && (
          <button
            onClick={() => savePositionen()}
            disabled={posSaving}
            className="mf-btn-save"
            style={{ marginRight: 20, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {posSaving ? <><Spinner size={11} /> Speichern…</> : '✓ Speichern'}
          </button>
        )}
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
                    <span style={{ fontSize: 11, color: 'var(--label3)', paddingBottom: 4, flexShrink: 0 }}>×</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={HDR}>CHF/H</span>
                      <input
                        className="mf-pos-num"
                        type="number"
                        value={(pos as ArbeitPosition).stundenansatz}
                        onChange={(e) => updPos(i, 'stundenansatz', e.target.value)}
                        placeholder="80"
                        min={0}
                        style={{ width: 52, padding: '3px 5px', fontSize: 13 }}
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
                  CHF {(parseFloat(pos.preis || '0')).toFixed(2)}
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
            <div>
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
                  <div className="cf-field">
                    <label className="cf-label">AW (CHF/h)</label>
                    <input className="cf-input" type="number" min={0} value={newAW} onChange={(e) => setNewAW(e.target.value)} placeholder="80" />
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
            <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
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

      {/* ── Aktionen: Auftrag / Rechnung erstellen ── */}
      {positionen.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {onCreateAuftrag && (
            <button
              onClick={handleCreateAuftrag}
              disabled={busy || acceptedCount === 0}
              className="btn-system"
              style={{
                flex: 1,
                background: acceptedCount > 0
                  ? 'linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%)'
                  : undefined,
                opacity: acceptedCount === 0 ? 0.4 : 1,
              }}
            >
              {creatingAuftrag
                ? <><Spinner size={13} />&nbsp; Wird erstellt…</>
                : `Auftrag erstellen (${acceptedCount})`
              }
            </button>
          )}
          {onCreateRechnung && (
            <button
              onClick={handleCreateRechnung}
              disabled={busy || acceptedCount === 0}
              className="btn-system btn-green"
              style={{
                flex: 1,
                opacity: acceptedCount === 0 ? 0.4 : 1,
              }}
            >
              {creatingRechnung
                ? <><Spinner size={13} />&nbsp; Wird erstellt…</>
                : `Rechnung erstellen (${acceptedCount})`
              }
            </button>
          )}
        </div>
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
              Werkstatt is filled from the settings; the Kunde block keeps Ort, Datum
              and Unterschrift blank to be filled in and signed by hand. */}
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
              <div className="ab-sig-row"><span className="ab-sig-lbl">Name</span><span className="ab-sig-val ab-sig-strong">{abName}</span></div>
              <div className="ab-sig-area" />
              <div className="ab-sig-caption">Unterschrift Kunde</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {dirty && (
              <button onClick={() => savePositionen('Auftragsbestätigung gespeichert')} disabled={posSaving} className="btn-system btn-secondary" style={{ flex: 1 }}>
                {posSaving ? <><Spinner size={13} />&nbsp; Speichern…</> : 'AB speichern'}
              </button>
            )}
            <button onClick={handleExportAB} disabled={posSaving || acceptedCount === 0} className="btn-system" style={{ flex: 1 }}>
              AB als PDF
            </button>
          </div>
        </div>
      )}

      {/* ── Folgedokumente: Materialofferte / Anzahlungsrechnung ── */}
      {positionen.length > 0 && (onCreateMaterialofferte || onCreateAnzahlung) && (
        <div className="doc-actions">
          {onCreateMaterialofferte && acceptedMatPos.length > 0 && (
            <button onClick={handleCreateMaterialofferte} disabled={busy} className="btn-system btn-secondary">
              {creatingMat ? <><Spinner size={13} />&nbsp; Wird erstellt…</> : `Materialofferte erstellen (${acceptedMatPos.length} Pos.)`}
            </button>
          )}
          {onCreateAnzahlung && (
            <button onClick={handleCreateAnzahlung} disabled={busy || acceptedTotal <= 0} className="btn-system btn-green" style={{ opacity: acceptedTotal <= 0 ? 0.4 : 1 }}>
              {creatingAnz
                ? <><Spinner size={13} />&nbsp; Wird erstellt…</>
                : `Anzahlungsrechnung ${ANZAHLUNG_PROZENT}% · CHF ${roundToRappen(acceptedTotal * ANZAHLUNG_PROZENT / 100).toFixed(2)}`}
            </button>
          )}
        </div>
      )}

      {offerte.notizen && <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16 }}>{offerte.notizen}</div>}

      <button onClick={() => exportOffertePDF(buildPayload(), customer)} className="btn-system btn-green" style={{ marginBottom: 12 }}>PDF speichern</button>
      <button onClick={() => printWithFilename(buildDocumentFilename(customer, docName, nr))} className="btn-system btn-secondary" style={{ marginBottom: 12 }}>Drucken</button>
      <button onClick={handleDuplicate} disabled={duplicating} className="btn-system btn-secondary" style={{ marginBottom: 12 }}>
        {duplicating ? <><Spinner size={13} />&nbsp; Wird dupliziert…</> : `${docName} duplizieren`}
      </button>
      <button onClick={async () => { if (window.confirm('Offerte löschen?')) await onDelete(offerte.id); }} className="btn-system btn-destructive">Offerte löschen</button>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--label3)', textAlign: 'center' }}>Erstellt: {formatDateCH(offerte.createdAt)} · {docName} #{nr}</div>
    </Sheet>
  );
}
