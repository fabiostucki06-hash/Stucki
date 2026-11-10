import { useState, useEffect } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { DocActions, DocSummary } from '../ui/DocActions';
import { SFPlus, SFXmark } from '../Icons';
import { PartLink, PosWerte, SaveStatus } from '../ui/DocForm';
import { useAutoSave } from '../../hooks/useAutoSave';
import { exportRechnungPDF } from '../../lib/pdf-rechnung';
import { computeRechnungTotals, rechnungDocName, schlussReferenz, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from '../../lib/rechnung-totals';
import { mitMaterialHinweis } from '../../lib/offerte-docs';
import { materialPreis, zeBetrag } from '../../lib/ze';
import { STD_SATZ } from '../../lib/company';
import { setMaterialFeld } from '../../lib/marge';
import { festpreisSummen, positionsArt, positionsText } from '../../lib/sonderpositionen';
import { formatDateCH, buildDocumentFilename, printWithFilename } from '../../lib/utils';
import type { Customer, Rechnung, RechnungStatus, RechnungKategorie, Position, ArbeitPosition, MaterialPosition } from '../../types';

interface RechnungDetailProps {
  rechnung: Rechnung;
  customer: Customer | undefined;
  onClose: () => void;
  onUpdate: (upd: Rechnung) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (r: Rechnung) => void;
  /** Anzahlungsrechnung only: creates the Schlussrechnung that deducts this Anzahlung. */
  onCreateSchlussrechnung?: (anzahlung: Rechnung) => Promise<void>;
  /** Number of an existing Schlussrechnung for this Anzahlung, if any. */
  schlussrechnungNumber?: number;
}

type StatusMeta = { c: string; l: string };
const ST_META: Record<RechnungStatus, StatusMeta> = {
  entwurf:   { c: 'var(--label2)', l: 'Entwurf'   },
  versendet: { c: 'var(--orange)', l: 'Versendet' },
  bezahlt:   { c: 'var(--green)',  l: 'Bezahlt'   },
  storniert: { c: 'var(--red)',    l: 'Storniert' },
};

const fCHF = (n: number) => n.toFixed(2);

const KATEGORIE_OPTS: [RechnungKategorie, string][] = [
  ['reparatur',  'Reparatur'],
  ['karosserie', 'Karosserie'],
  ['inspektion', 'Inspektion'],
  ['service',    'Service'],
];
const KATEGORIE_LABEL: Record<RechnungKategorie, string> = {
  reparatur: 'Reparatur', karosserie: 'Karosserie', inspektion: 'Inspektion', service: 'Service',
};

function calcFaelligAm(createdAt: string, days: string): string {
  const n = parseInt(days);
  if (isNaN(n) || n <= 0) return '';
  const d = new Date(createdAt);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

const HDR: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: 'var(--label3)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 2, display: 'block',
  textShadow: '0 1px 3px rgba(0,0,0,0.30)',
};

export default function RechnungDetail({ rechnung, customer, onClose, onUpdate, onDelete, onEdit, onCreateSchlussrechnung, schlussrechnungNumber }: RechnungDetailProps) {
  const [saving, setSaving] = useState(false);
  const [creatingSchluss, setCreatingSchluss] = useState(false);
  const [positionen, setPositionen] = useState<Position[]>(() => rechnung.positionen ?? []);
  const [zahlungsFrist, setZahlungsFrist] = useState(rechnung.zahlungsFrist ?? '10');
  const [kategorie, setKategorie] = useState<RechnungKategorie | ''>(rechnung.kategorie ?? '');
  const [kleinteilManuell, setKleinteilManuell] = useState<boolean | null>(rechnung.kleinteilManuell ?? null);
  const [dirty, setDirty] = useState(false);
  /** View mode (default): positions, prices, Auftragsart, Kleinteile and Zahlungsziel
      are read-only; only the status stays tappable. "Bearbeiten" unlocks inline
      editing, "Fertig" saves and locks again. */
  const [editing, setEditing] = useState(false);

  const [addingTyp, setAddingTyp] = useState<'arbeit' | 'material' | null>(null);
  const [newBeschreibung, setNewBeschreibung] = useState('');
  const [newZE, setNewZE] = useState('');
  const [newMenge, setNewMenge] = useState('1');
  const [newPreis, setNewPreis] = useState('');

  // rechnung prop can change (e.g. after editing) while this component stays
  // mounted — resync local Zahlungsfrist so the countdown never shows stale data.
  useEffect(() => {
    setZahlungsFrist(rechnung.zahlungsFrist ?? '10');
    setKategorie(rechnung.kategorie ?? '');
    setKleinteilManuell(rechnung.kleinteilManuell ?? null);
  }, [rechnung.id, rechnung.zahlungsFrist, rechnung.kategorie, rechnung.kleinteilManuell]);

  const sc = ST_META[rechnung.status] ?? ST_META.entwurf;
  const faelligAm = calcFaelligAm(rechnung.createdAt, zahlungsFrist);
  const isAnzahlung = rechnung.art === 'anzahlung';
  const isSchluss = rechnung.art === 'schluss';
  const docName = rechnungDocName(rechnung);

  const isOverdue = faelligAm
    && rechnung.status === 'versendet'
    && new Date(faelligAm) < new Date();

  function handleZahlungsFristChange(val: string) {
    setZahlungsFrist(val);
    setDirty(true);
  }

  function handleKategorieChange(val: RechnungKategorie | '') {
    setKategorie(val);
    setDirty(true);
  }

  function handleKleinteilToggle(checked: boolean) {
    setKleinteilManuell(checked);
    setDirty(true);
  }

  function resetKleinteilAuto() {
    setKleinteilManuell(null);
    setDirty(true);
  }

  /* ── live totals from local state ── */
  const anzProzent = rechnung.anzahlungProzent;
  const { totalMaterial: totM, totalArbeit: totA, totalZE: totZE, kleinteil, zwischensumme: total, gesamttotal, rechnungstotal, restbetrag, abzugAnzahlung, kleinteilApplied } =
    computeRechnungTotals(positionen, kategorie || undefined, kleinteilManuell, anzProzent, parseFloat(rechnung.anzahlungBetrag ?? '') || undefined);
  // Versandkosten / Pauschalen: part of totM, shown on their own.
  const fest = festpreisSummen(positionen);

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
    setDirty(true);
    resetNewPos();
  }

  function buildPayload(): Rechnung {
    return {
      ...rechnung,
      positionen,
      totalBetrag: rechnungstotal.toFixed(2),
      totalArbeit: totA.toFixed(2),
      totalMaterial: totM.toFixed(2),
      totalZE: totZE,
      zahlungsFrist,
      faelligAm,
      kategorie: kategorie || undefined,
      kleinteilManuell,
    };
  }
  /* Inline edits save themselves (see OfferteDetail): only the edited fields are
     compared, the write takes the current rechnung with them. */
  const autoSave = useAutoSave(
    dirty ? { positionen, zahlungsFrist, kategorie, kleinteilManuell } : null,
    () => onUpdate(buildPayload()),
  );
  /** The edit form starts from the inline edits, stored first so it can't overwrite them. */
  async function formularOeffnen() {
    if (!dirty) { onEdit(rechnung); return; }
    if (await autoSave.flush()) onEdit(buildPayload());
  }
  /** Leaves edit mode once the inline edits are stored; a failed save keeps it open. */
  async function fertig() {
    if (dirty && !(await autoSave.flush())) return;
    resetNewPos();
    setEditing(false);
  }
  useEffect(() => {
    if (autoSave.status === 'saved') setDirty(false);
  }, [autoSave.status]);

  return (
    <Sheet
      title={`${docName} #${rechnung.rechnungNumber}`}
      onClose={onClose}
      full
      back
      barRight={editing
        ? <button onClick={fertig} disabled={autoSave.status === 'saving'} className="bar-btn" style={{ fontWeight: 700 }}>Fertig</button>
        : <button onClick={() => setEditing(true)} className="bar-btn">Bearbeiten</button>}
    >
      {isOverdue && (
        <div className="alert-banner alert-danger" style={{ marginBottom: 10 }}>
          <span>⚠️</span><span className="sf-subhead">Rechnung überfällig</span>
        </div>
      )}

      <DocSummary
        statusLabel={sc.l} statusColor={sc.c}
        title={rechnung.titel}
        amount={`CHF ${fCHF(rechnungstotal)}`}
        amountLabel={isAnzahlung ? 'Anzahlung' : isSchluss ? 'Restbetrag' : 'Total'}
        meta={[
          customer && <><strong style={{ color: 'var(--label)' }}>{customer.vorname} {customer.nachname}</strong>{[customer.telefon, customer.kennzeichen].filter(Boolean).map((v) => ` · ${v}`).join('')}</>,
          faelligAm && <span style={{ color: isOverdue ? 'var(--red)' : undefined }}>Zahlbar bis {formatDateCH(faelligAm)}{isOverdue ? ' (überfällig)' : ''}</span>,
        ]}
      >
        {(Object.entries(ST_META) as [RechnungStatus, StatusMeta][]).map(([s, meta]) => (
          <button
            key={s}
            onClick={async () => { setSaving(true); await onUpdate({ ...rechnung, status: s }); setSaving(false); }}
            disabled={saving}
            className={`pill-btn ${rechnung.status === s ? 'pill-btn-active' : 'pill-btn-inactive'}`}
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            {saving && rechnung.status === s ? <Spinner size={12} /> : meta.l}
          </button>
        ))}
      </DocSummary>

      {editing && (
        <div className="edit-banner no-print">
          <div className="edit-banner-txt">
            Bearbeitungsmodus
            <small>Positionen, Preise und Zahlungsziel sind bearbeitbar und werden automatisch gespeichert.</small>
          </div>
          <button onClick={formularOeffnen} className="mf-btn-cancel">Titel, Kunde &amp; Details…</button>
        </div>
      )}

      {isAnzahlung ? (
        <div className="glass-panel doc-terms">
          <div className="ab-panel-title">Anzahlungsrechnung · {anzProzent ?? 50}% Vorkasse</div>
          <div className="sf-subhead" style={{ color: 'var(--label2)' }}>
            {rechnung.zahlungsbedingung || 'Vorkasse (Bar, TWINT, E-Banking)'}
          </div>
        </div>
      ) : (<>
      {isSchluss && (
        <div className="glass-panel doc-terms">
          <div className="ab-panel-title">{schlussReferenz(rechnung)}</div>
          <div className="sf-subhead" style={{ color: 'var(--label2)' }}>
            Alle Positionen der Offerte; die geleistete Anzahlung von CHF {fCHF(abzugAnzahlung)} wird abgezogen.
          </div>
        </div>
      )}
      <p className="section-header">Auftragsart</p>
      {editing ? (
        <div className="h-scroll" style={{ marginBottom: 16 }}>
          {KATEGORIE_OPTS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => handleKategorieChange(kategorie === k ? '' : k)}
              className={`pill-btn ${kategorie === k ? 'pill-btn-active' : 'pill-btn-inactive'}`}
            >
              {l}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <span className="pos-chip" style={{ fontSize: 14, padding: '5px 12px' }}>{kategorie ? KATEGORIE_LABEL[kategorie] : 'Keine Auftragsart'}</span>
        </div>
      )}

      <div style={{ background: 'rgba(52,199,89,0.09)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid rgba(52,199,89,0.22)' }}>
        <span style={{ fontSize: 16, color: 'var(--green)' }}>✓</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Zahlungsziel:</span>
        {editing ? (
          <input
            type="number"
            value={zahlungsFrist}
            onChange={(e) => handleZahlungsFristChange(e.target.value)}
            min={1}
            style={{
              width: 48, padding: '3px 6px', fontSize: 15, fontWeight: 700, color: '#ffffff',
              background: 'var(--input-bg)', border: '1.5px solid rgba(52,199,89,0.55)',
              borderRadius: 6, textAlign: 'center', outline: 'none',
            }}
          />
        ) : <span className="ro-value" style={{ fontSize: 15 }}>{zahlungsFrist || '—'}</span>}
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Tage netto</span>
      </div>
      </>)}

      {/* ── Positionen – read-only; inline editable in edit mode ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
        <p className="section-header" style={{ margin: 0 }}>Positionen</p>
        {(dirty || autoSave.status !== 'idle') && (
          <span style={{ marginRight: 20 }}><SaveStatus status={autoSave.status} onRetry={autoSave.retry} /></span>
        )}
      </div>

      <div className="inset-grouped-list" style={{ marginBottom: 16, marginTop: 8 }}>
        {positionen.map((pos, i) => (
          <div
            key={i}
            className="pos-line"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderBottom: '0.5px solid var(--sep)',
              minHeight: 52,
            }}
          >
            {/* Description + type badge */}
            <div className="pos-line-desc" style={{ flex: 1, minWidth: 0 }}>
              <div className="sf-subhead" style={{ overflowWrap: 'anywhere' }}>
                {positionsText(pos)}
              </div>
              <div style={{ fontSize: 10, color: pos.typ === 'material' && pos.art === 'versand' ? 'var(--orange)' : 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                {pos.typ === 'arbeit' ? 'Arbeit' : <>{positionsArt(pos)}{pos.art ? ' · ohne Marge' : ''} <PartLink url={pos.link} /></>}
              </div>
            </div>

            {/* Read-only values; inline inputs only in edit mode */}
            {!editing ? <PosWerte pos={pos} /> : pos.typ === 'arbeit' ? (
              <div className="pos-line-inputs" style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
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
              <div className="pos-line-inputs" style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
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

            {/* Live line total */}
            <div className="pos-line-total" style={{
              fontWeight: 700, fontSize: 14,
              color: pos.typ === 'arbeit' ? 'var(--blue)' : 'var(--green)',
              flexShrink: 0, minWidth: 68, textAlign: 'right',
              letterSpacing: '-0.2px',
            }}>
              {pos.typ === 'arbeit' ? '—' : `CHF ${fCHF(parseFloat(pos.preis || '0'))}`}
            </div>

            {/* Delete position (edit mode only) */}
            {editing && (
              <button
                onClick={() => removePosition(i)}
                className="del-btn-visible"
                title="Position löschen"
                aria-label="Position löschen"
              >
                <SFXmark />
              </button>
            )}
          </div>
        ))}

        {kleinteilApplied && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderBottom: '0.5px solid var(--sep)',
              minHeight: 52,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sf-subhead">{KLEINTEIL_LABEL}</div>
              <div style={{ fontSize: 10, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                {kleinteilManuell != null
                  ? 'Manuell aktiviert'
                  : `Automatisch · ${kategorie ? KATEGORIE_LABEL[kategorie] : '—'}`}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--blue)', flexShrink: 0, minWidth: 68, textAlign: 'right', letterSpacing: '-0.2px' }}>
              CHF {fCHF(KLEINTEIL_BETRAG)}
            </div>
          </div>
        )}

        {/* ── Kleinteilepauschale: manual override (edit mode only) ── */}
        {editing && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '0.5px solid var(--sep)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={kleinteilApplied}
              onChange={(e) => handleKleinteilToggle(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--blue)' }}
            />
            <span className="sf-subhead">Kleinteilepauschale hinzufügen</span>
          </label>
          {kleinteilManuell != null && (
            <button
              onClick={resetKleinteilAuto}
              className="pill-btn pill-btn-inactive"
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              Automatisch
            </button>
          )}
        </div>}

        {/* ── Add new position (edit mode only) ── */}
        {editing && <div style={{ padding: '10px 16px' }}>
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
        </div>}

        {/* ── Totals breakdown ── */}
        <div style={{ borderTop: '0.5px solid var(--sep)' }}>
          {/* Row 1: Summe — Material (price col) + Arbeit (ZE col) side by side */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>Summe</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Material</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>CHF {fCHF(totM - fest.versand - fest.pauschalen)}</div>
              </div>
              {fest.pauschalen > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Pauschalen</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>CHF {fCHF(fest.pauschalen)}</div>
                </div>
              )}
              {fest.versand > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Versand</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>CHF {fCHF(fest.versand)}</div>
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>
                  Arbeit{totZE > 0 ? ` · ${totZE} ZE` : ''}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>CHF {fCHF(totA)}</div>
              </div>
              {kleinteil > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Kleinteil</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>CHF {fCHF(kleinteil)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Zwischensumme — on an Anzahlung the full amount of all positions,
              of which the share below is due now */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>{anzProzent || isSchluss ? 'Gesamtbetrag gemäss Offerte (100%)' : 'Zwischensumme'}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>CHF {fCHF(anzProzent || isSchluss ? gesamttotal : total)}</div>
          </div>

          {/* Schlussrechnung: the already paid Anzahlung is deducted */}
          {isSchluss && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
              <div style={{ fontSize: 13, color: 'var(--label2)' }}>
                abzüglich Anzahlung{rechnung.anzahlungRechnungNumber != null ? ` (Anzahlungsrechnung #${rechnung.anzahlungRechnungNumber})` : ''}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>– CHF {fCHF(abzugAnzahlung)}</div>
            </div>
          )}

          {/* Anzahlung: the remaining share is deducted here and billed with the Schlussrechnung */}
          {anzProzent ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
              <div style={{ fontSize: 13, color: 'var(--label2)' }}>Abzug Restbetrag {100 - anzProzent}% (folgt mit Schlussrechnung)</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>– CHF {fCHF(restbetrag)}</div>
            </div>
          ) : null}

          {/* Row 3: Rechnungstotal (Swiss-rounded to 0.05 CHF) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,122,255,0.06)' }}>
            <div>
              <div className="sf-headline">{anzProzent ? `Anzahlung ${anzProzent}%` : isSchluss ? 'Restbetrag (zu bezahlen)' : 'Rechnungstotal'}</div>
              <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>gerundet auf 5 Rp.</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--blue)', letterSpacing: '-0.5px' }}>
              CHF {fCHF(rechnungstotal)}
            </div>
          </div>
        </div>
      </div>

      {(isAnzahlung || rechnung.notizen) && (
        <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16, whiteSpace: 'pre-line' }}>
          {isAnzahlung ? mitMaterialHinweis(rechnung.notizen) : rechnung.notizen}
        </div>
      )}

      {/* ── Aktionen: one card (screen only). Anzahlung → Schlussrechnung is the next step. ── */}
      <DocActions
        primary={isAnzahlung && onCreateSchlussrechnung ? {
          key: 'schluss', label: 'Schlussrechnung erstellen', sub: `Restbetrag CHF ${fCHF(restbetrag)}${schlussrechnungNumber != null ? ` · #${schlussrechnungNumber} existiert bereits` : ''}`,
          busy: creatingSchluss,
          onClick: async () => {
            if (schlussrechnungNumber != null && !window.confirm(`Für diese Anzahlung existiert bereits Schlussrechnung #${schlussrechnungNumber}. Trotzdem eine weitere erstellen?`)) return;
            setCreatingSchluss(true);
            try { await onCreateSchlussrechnung(rechnung); } finally { setCreatingSchluss(false); }
          },
        } : undefined}
        documents={[
          { key: 'pdf', label: `${docName} PDF`, tone: 'green', onClick: () => exportRechnungPDF(rechnung, customer) },
          { key: 'print', label: 'Drucken', tone: 'secondary', onClick: () => printWithFilename(buildDocumentFilename(customer, docName, rechnung.rechnungNumber ?? '')) },
        ]}
        hint="PDFs werden zusätzlich auf Google Drive abgelegt."
        manage={[
          { key: 'del', label: `${docName} löschen`, tone: 'destructive', onClick: async () => { if (window.confirm(`${docName} löschen?`)) await onDelete(rechnung.id); } },
        ]}
      />
      <div className="doc-foot">Erstellt: {formatDateCH(rechnung.createdAt)} · {docName} #{rechnung.rechnungNumber}</div>
    </Sheet>
  );
}
