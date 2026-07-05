import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { SFPlus } from '../Icons';
import { printRechnung } from '../../lib/print-rechnung';
import { computeRechnungTotals, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from '../../lib/rechnung-totals';
import { formatDateCH } from '../../lib/utils';
import type { Customer, Rechnung, RechnungStatus, Position, ArbeitPosition, MaterialPosition } from '../../types';

interface RechnungDetailProps {
  rechnung: Rechnung;
  customer: Customer | undefined;
  onClose: () => void;
  onUpdate: (upd: Rechnung) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (r: Rechnung) => void;
}

type StatusMeta = { c: string; l: string };
const ST_META: Record<RechnungStatus, StatusMeta> = {
  entwurf:   { c: 'var(--label2)', l: 'Entwurf'   },
  versendet: { c: 'var(--orange)', l: 'Versendet' },
  bezahlt:   { c: 'var(--green)',  l: 'Bezahlt'   },
  storniert: { c: 'var(--red)',    l: 'Storniert' },
};

const fCHF = (n: number) => n.toFixed(2);

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

export default function RechnungDetail({ rechnung, customer, onClose, onUpdate, onDelete, onEdit }: RechnungDetailProps) {
  const [saving, setSaving] = useState(false);
  const [posSaving, setPosSaving] = useState(false);
  const [positionen, setPositionen] = useState<Position[]>(() => rechnung.positionen ?? []);
  const [zahlungsFrist, setZahlungsFrist] = useState(rechnung.zahlungsFrist ?? '30');
  const [dirty, setDirty] = useState(false);

  const [addingTyp, setAddingTyp] = useState<'arbeit' | 'material' | null>(null);
  const [newBeschreibung, setNewBeschreibung] = useState('');
  const [newZE, setNewZE] = useState('');
  const [newAW, setNewAW] = useState('80');
  const [newMenge, setNewMenge] = useState('1');
  const [newPreis, setNewPreis] = useState('');

  const sc = ST_META[rechnung.status] ?? ST_META.entwurf;
  const faelligAm = calcFaelligAm(rechnung.createdAt, zahlungsFrist);

  const isOverdue = faelligAm
    && rechnung.status === 'versendet'
    && new Date(faelligAm) < new Date();

  function handleZahlungsFristChange(val: string) {
    setZahlungsFrist(val);
    setDirty(true);
  }

  /* ── live totals from local state ── */
  const { totalMaterial: totM, totalArbeit: totA, totalZE: totZE, zwischensumme: total, rechnungstotal, kleinteilApplied } =
    computeRechnungTotals(positionen);

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
    setDirty(true);
    resetNewPos();
  }

  async function savePositionen() {
    setPosSaving(true);
    try {
      await onUpdate({
        ...rechnung,
        positionen,
        totalBetrag: rechnungstotal.toFixed(2),
        totalArbeit: totA.toFixed(2),
        totalMaterial: totM.toFixed(2),
        totalZE: totZE,
        zahlungsFrist,
        faelligAm,
      });
      setDirty(false);
      showToast('Positionen gespeichert', 'success');
    } catch {
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setPosSaving(false);
    }
  }

  return (
    <Sheet
      title={`Rechnung #${rechnung.rechnungNumber}`}
      onClose={onClose}
      full
      barRight={<button onClick={() => onEdit(rechnung)} className="bar-btn">Bearbeiten</button>}
    >
      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: sc.c, letterSpacing: '-0.3px' }}>{sc.l}</div>
        {rechnung.titel && <div style={{ fontSize: 15, color: 'var(--label2)', marginTop: 4 }}>{rechnung.titel}</div>}
      </div>

      {isOverdue && (
        <div className="alert-banner alert-danger" style={{ marginBottom: 12 }}>
          <span>⚠️</span><span className="sf-subhead">Rechnung überfällig</span>
        </div>
      )}

      <p className="section-header">Status ändern</p>
      <div className="h-scroll" style={{ marginBottom: 20 }}>
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

      {faelligAm && (
        <div className="sf-subhead" style={{ color: isOverdue ? 'var(--red)' : 'var(--label2)', marginBottom: 12 }}>
          Zahlbar bis: {formatDateCH(faelligAm)}{isOverdue ? ' (überfällig)' : ''}
        </div>
      )}

      <div style={{ background: 'rgba(52,199,89,0.09)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid rgba(52,199,89,0.22)' }}>
        <span style={{ fontSize: 16, color: 'var(--green)' }}>✓</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Zahlungsziel:</span>
        <input
          type="number"
          value={zahlungsFrist}
          onChange={(e) => handleZahlungsFristChange(e.target.value)}
          min={1}
          style={{
            width: 48, padding: '3px 6px', fontSize: 15, fontWeight: 600, color: 'var(--green)',
            background: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(52,199,89,0.3)',
            borderRadius: 6, textAlign: 'center', outline: 'none',
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Tage netto</span>
      </div>

      {/* ── Positionen – inline editable ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
        <p className="section-header" style={{ margin: 0 }}>Positionen</p>
        {dirty && (
          <button
            onClick={savePositionen}
            disabled={posSaving}
            className="mf-btn-save"
            style={{ marginRight: 20, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {posSaving ? <><Spinner size={11} /> Speichern…</> : '✓ Speichern'}
          </button>
        )}
      </div>

      <div className="inset-grouped-list" style={{ marginBottom: 16, marginTop: 8 }}>
        {positionen.map((pos, i) => (
          <div
            key={i}
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sf-subhead" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pos.beschreibung}
              </div>
              <div style={{ fontSize: 10, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                {pos.typ === 'arbeit' ? 'Arbeit' : 'Material'}
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

            {/* Live line total */}
            <div style={{
              fontWeight: 700, fontSize: 14,
              color: pos.typ === 'arbeit' ? 'var(--blue)' : 'var(--green)',
              flexShrink: 0, minWidth: 68, textAlign: 'right',
              letterSpacing: '-0.2px',
            }}>
              CHF {fCHF(parseFloat(pos.preis || '0'))}
            </div>
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
                Automatisch · ZE &gt; 100
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--blue)', flexShrink: 0, minWidth: 68, textAlign: 'right', letterSpacing: '-0.2px' }}>
              CHF {fCHF(KLEINTEIL_BETRAG)}
            </div>
          </div>
        )}

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

        {/* ── Totals breakdown ── */}
        <div style={{ borderTop: '0.5px solid var(--sep)' }}>
          {/* Row 1: Summe — Material (price col) + Arbeit (ZE col) side by side */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>Summe</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Material</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>CHF {fCHF(totM)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>
                  Arbeit{totZE > 0 ? ` · ${totZE} ZE` : ''}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>CHF {fCHF(totA)}</div>
              </div>
            </div>
          </div>

          {/* Row 2: Zwischensumme */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>Zwischensumme</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>CHF {fCHF(total)}</div>
          </div>

          {/* Row 3: Rechnungstotal (Swiss-rounded to 0.05 CHF) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,122,255,0.06)' }}>
            <div>
              <div className="sf-headline">Rechnungstotal</div>
              <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>gerundet auf 5 Rp.</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--blue)', letterSpacing: '-0.5px' }}>
              CHF {fCHF(rechnungstotal)}
            </div>
          </div>
        </div>
      </div>

      {rechnung.notizen && (
        <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16 }}>
          {rechnung.notizen}
        </div>
      )}

      <button
        onClick={() => printRechnung(rechnung, customer)}
        className="btn-system btn-green"
        style={{ marginBottom: 12 }}
      >
        Drucken / PDF exportieren
      </button>
      <button
        onClick={async () => { if (window.confirm('Rechnung löschen?')) await onDelete(rechnung.id); }}
        className="btn-system btn-destructive"
      >
        Rechnung löschen
      </button>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--label3)', textAlign: 'center' }}>
        Erstellt: {formatDateCH(rechnung.createdAt)} · Rechnung #{rechnung.rechnungNumber}
      </div>
    </Sheet>
  );
}
