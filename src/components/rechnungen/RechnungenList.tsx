import { SFChevron } from '../Icons';
import { exportRechnungPDF } from '../../lib/pdf-rechnung';
import { formatDateCH } from '../../lib/utils';
import { rechnungDocName } from '../../lib/rechnung-totals';
import type { Customer, Rechnung, RechnungStatus } from '../../types';

interface RechnungenListProps {
  rechnungen: Rechnung[];
  customers: Customer[];
  onRechnungClick: (r: Rechnung) => void;
  onEdit: (r: Rechnung) => void;
  onNew?: () => void;
  /** Opens the PDF import (Rechnung from an uploaded PDF). */
  onImportPdf?: () => void;
  /** 'anzahlung' / 'schluss' list only the 50% Vorkasse invoices or the
      Schlussrechnungen (own menu items); the default list shows every other invoice. */
  variant?: 'standard' | 'anzahlung' | 'schluss';
}

const STATUS_LABELS: Record<RechnungStatus, string> = {
  entwurf:   'Entwurf',
  versendet: 'Versendet',
  bezahlt:   'Bezahlt',
  storniert: 'Storniert',
};
const STATUS_COLORS: Record<RechnungStatus, string> = {
  entwurf:   'var(--label2)',
  versendet: 'var(--orange)',
  bezahlt:   'var(--green)',
  storniert: 'var(--red)',
};

export default function RechnungenList({ rechnungen: all, customers, onRechnungClick, onEdit, onNew, onImportPdf, variant = 'standard' }: RechnungenListProps) {
  const isAnz = variant === 'anzahlung';
  const isSchluss = variant === 'schluss';
  const rechnungen = all.filter((r) => (r.art === 'anzahlung' || r.art === 'schluss' ? r.art : 'standard') === variant);
  const titel = isAnz ? 'Anzahlungsrechnungen' : isSchluss ? 'Schlussrechnungen' : 'Rechnungen';
  const sortByName = (a: Rechnung, b: Rechnung) => {
    const ca = customers.find((x) => x.id === a.customerId);
    const cb = customers.find((x) => x.id === b.customerId);
    const na = ca ? `${ca.nachname} ${ca.vorname}`.toLowerCase() : 'zzz';
    const nb = cb ? `${cb.nachname} ${cb.vorname}`.toLowerCase() : 'zzz';
    return na < nb ? -1 : na > nb ? 1 : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 className="sf-title1" style={{ paddingTop: 8 }}>{titel}</h1>
        {(onNew || onImportPdf) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {onImportPdf && <button onClick={onImportPdf} className="btn-tinted">PDF importieren</button>}
            {onNew && <button onClick={onNew} className="btn-tinted">+ Neue</button>}
          </div>
        )}
      </div>

      {!rechnungen.length && (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 16, color: 'var(--label2)' }}>Noch keine {titel}.</div>
          {(isAnz || isSchluss) && (
            <div style={{ fontSize: 13, color: 'var(--label3)', marginTop: 6 }}>
              {isAnz
                ? 'Anzahlungsrechnungen werden in einer angenommenen Offerte erstellt.'
                : 'Schlussrechnungen werden aus einer Anzahlungsrechnung erstellt.'}
            </div>
          )}
        </div>
      )}

      {(['entwurf', 'versendet', 'bezahlt', 'storniert'] as RechnungStatus[]).map((st) => {
        const grp = rechnungen.filter((r) => r.status === st).sort(sortByName);
        if (!grp.length) return null;
        return (
          <div key={st}>
            <p className="section-header" style={{ paddingLeft: 0, color: STATUS_COLORS[st] }}>
              {STATUS_LABELS[st]} ({grp.length})
            </p>
            <div className="inset-grouped-list" style={{ marginBottom: 4 }}>
              {/* Column labels for the desktop table layout (hidden on touch). */}
              <div className="doc-table-head" aria-hidden="true"><span className="doc-row-title">Dokument</span><span className="doc-row-sub">Kunde</span><span className="doc-row-amount">Betrag</span></div>
              {grp.map((rec) => {
                const c = customers.find((x) => x.id === rec.customerId);
                return (
                  <div key={rec.id} className="list-row" tabIndex={0} onClick={() => onRechnungClick(rec)}>
                    <div className="doc-row-main" style={{ flex: 1 }}>
                      <div className="doc-row-title" style={{ fontWeight: 600, fontSize: 16 }}>{rechnungDocName(rec)} #{rec.rechnungNumber}</div>
                      <div className="doc-row-sub" style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>
                        {c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde'}
                      </div>
                      {rec.totalBetrag && (
                        <div className="doc-row-amount" style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginTop: 1 }}>
                          CHF {rec.totalBetrag}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportRechnungPDF(rec, c);
                      }}
                      className="excel-btn"
                      title="Drucken / PDF exportieren"
                    >
                      PDF
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(rec); }}
                      className="excel-btn"
                      style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--blue)', border: '1px solid rgba(0,122,255,0.25)' }}
                      title="Bearbeiten"
                    >
                      ✎
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--label3)' }}>
                        {formatDateCH(rec.createdAt)}
                      </div>
                      <span style={{ color: 'var(--label3)' }}><SFChevron /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
