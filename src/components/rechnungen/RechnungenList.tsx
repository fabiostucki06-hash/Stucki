import { SFChevron } from '../Icons';
import { exportRechnungPDF } from '../../lib/pdf-rechnung';
import type { Customer, Rechnung, RechnungStatus } from '../../types';

interface RechnungenListProps {
  rechnungen: Rechnung[];
  customers: Customer[];
  onRechnungClick: (r: Rechnung) => void;
  onEdit: (r: Rechnung) => void;
  onNew: () => void;
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

export default function RechnungenList({ rechnungen, customers, onRechnungClick, onEdit, onNew }: RechnungenListProps) {
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
        <h1 className="sf-title1" style={{ paddingTop: 8 }}>Rechnungen</h1>
        <button onClick={onNew} className="btn-tinted">+ Neue</button>
      </div>

      {!rechnungen.length && (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 16, color: 'var(--label2)' }}>Noch keine Rechnungen.</div>
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
              {grp.map((rec) => {
                const c = customers.find((x) => x.id === rec.customerId);
                return (
                  <div key={rec.id} className="list-row" onClick={() => onRechnungClick(rec)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>Rechnung #{rec.rechnungNumber}</div>
                      <div style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>
                        {c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde'}
                      </div>
                      {rec.totalBetrag && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginTop: 1 }}>
                          CHF {rec.totalBetrag}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); exportRechnungPDF(rec, c); }}
                      className="excel-btn"
                      title="PDF herunterladen"
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
                        {new Date(rec.createdAt).toLocaleDateString('de-CH')}
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
