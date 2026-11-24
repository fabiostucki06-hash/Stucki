import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { DocActions, DocSummary } from '../ui/DocActions';
import { SFWarning } from '../Icons';
import { PartLink, PosWerte } from '../ui/DocForm';
import { exportRechnungPDF } from '../../lib/pdf-rechnung';
import { computeRechnungTotals, rechnungDocName, schlussReferenz, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from '../../lib/rechnung-totals';
import { mitMaterialHinweis } from '../../lib/offerte-docs';
import { festpreisSummen, positionsArt, positionsText } from '../../lib/sonderpositionen';
import { formatDateCH, buildDocumentFilename, printWithFilename } from '../../lib/utils';
import type { Customer, Rechnung, RechnungStatus, RechnungKategorie, Position } from '../../types';

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

export default function RechnungDetail({ rechnung, customer, onClose, onUpdate, onDelete, onEdit, onCreateSchlussrechnung, schlussrechnungNumber }: RechnungDetailProps) {
  const [saving, setSaving] = useState(false);
  const [creatingSchluss, setCreatingSchluss] = useState(false);
  /* Read-only view: only the status stays tappable. "Bearbeiten" opens the full
     edit form (RechnungForm), which edits positions, Auftragsart, Kleinteile and
     Zahlungsziel and saves itself. Everything shown here follows the prop. */
  const positionen: Position[] = rechnung.positionen ?? [];
  const zahlungsFrist = rechnung.zahlungsFrist ?? '10';
  const kategorie: RechnungKategorie | '' = rechnung.kategorie ?? '';
  const kleinteilManuell: boolean | null = rechnung.kleinteilManuell ?? null;

  const sc = ST_META[rechnung.status] ?? ST_META.entwurf;
  const faelligAm = calcFaelligAm(rechnung.createdAt, zahlungsFrist);
  const isAnzahlung = rechnung.art === 'anzahlung';
  const isSchluss = rechnung.art === 'schluss';
  const docName = rechnungDocName(rechnung);

  const isOverdue = faelligAm
    && rechnung.status === 'versendet'
    && new Date(faelligAm) < new Date();

  /* ── live totals from local state ── */
  const anzProzent = rechnung.anzahlungProzent;
  const { totalMaterial: totM, totalArbeit: totA, totalZE: totZE, kleinteil, zwischensumme: total, gesamttotal, rechnungstotal, restbetrag, abzugAnzahlung, kleinteilApplied } =
    computeRechnungTotals(positionen, kategorie || undefined, kleinteilManuell, anzProzent, parseFloat(rechnung.anzahlungBetrag ?? '') || undefined);
  // Versandkosten / Pauschalen: part of totM, shown on their own.
  const fest = festpreisSummen(positionen);

  return (
    <Sheet
      title={`${docName} #${rechnung.rechnungNumber}`}
      onClose={onClose}
      full
      back
      barRight={<button onClick={() => onEdit(rechnung)} className="bar-btn">Bearbeiten</button>}
    >
      {isOverdue && (
        <div className="alert-banner alert-danger" style={{ marginBottom: 10 }}>
          <span className="alert-icon"><SFWarning /></span><span className="sf-subhead">Rechnung überfällig</span>
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
      <div style={{ marginBottom: 16 }}>
        <span className="pos-chip" style={{ fontSize: 14, padding: '5px 12px' }}>{kategorie ? KATEGORIE_LABEL[kategorie] : 'Keine Auftragsart'}</span>
      </div>

      <div style={{ padding: '2px 2px 0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--label2)' }}>
        <span>Zahlungsziel</span>
        <span style={{ color: 'var(--label)', fontWeight: 600 }}>{zahlungsFrist || '—'}</span>
        <span>Tage netto</span>
      </div>
      </>)}

      {/* ── Positionen – read-only; edited in the full form (Bearbeiten) ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 0 }}>
        <p className="section-header" style={{ margin: 0 }}>Positionen</p>
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

            <PosWerte pos={pos} />

            {/* Live line total */}
            <div className="pos-line-total" style={{
              fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums',
              color: 'var(--label)',
              flexShrink: 0, minWidth: 68, textAlign: 'right',
              letterSpacing: '-0.2px',
            }}>
              {pos.typ === 'arbeit' ? '—' : `CHF ${fCHF(parseFloat(pos.preis || '0'))}`}
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
                {kleinteilManuell != null
                  ? 'Manuell aktiviert'
                  : `Automatisch · ${kategorie ? KATEGORIE_LABEL[kategorie] : '—'}`}
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--label)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 68, textAlign: 'right', letterSpacing: '-0.2px' }}>
              CHF {fCHF(KLEINTEIL_BETRAG)}
            </div>
          </div>
        )}

        {/* ── Totals breakdown ── */}
        <div style={{ borderTop: '0.5px solid var(--sep)' }}>
          {/* Row 1: Summe — Material (price col) + Arbeit (ZE col) side by side */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '0.5px solid var(--sep)' }}>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>Summe</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--label3)', marginBottom: 1 }}>Material</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>CHF {fCHF(totM - fest.versand - fest.pauschalen)}</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)', fontVariantNumeric: 'tabular-nums' }}>CHF {fCHF(totA)}</div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)' }}>
            <div>
              <div className="sf-headline">{anzProzent ? `Anzahlung ${anzProzent}%` : isSchluss ? 'Restbetrag (zu bezahlen)' : 'Rechnungstotal'}</div>
              <div style={{ fontSize: 10, color: 'var(--label3)', marginTop: 1 }}>gerundet auf 5 Rp.</div>
            </div>
            <div style={{ fontWeight: 650, fontSize: 20, color: 'var(--label)', letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
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
