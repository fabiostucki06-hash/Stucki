import { SFChevron } from '../Icons';
import { exportOfferteExcel } from '../../lib/excel';
import type { Customer, Offerte, OfferteStatus } from '../../types';

interface OfferteListProps {
  offerten: Offerte[];
  customers: Customer[];
  onOfferteClick: (o: Offerte) => void;
  onNew: () => void;
}

const STATUS_LABELS: Record<OfferteStatus, string> = { entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const STATUS_COLORS: Record<OfferteStatus, string> = { entwurf: 'var(--label2)', versendet: 'var(--orange)', angenommen: 'var(--green)', abgelehnt: 'var(--red)' };

export default function OfferteList({ offerten, customers, onOfferteClick, onNew }: OfferteListProps) {
  const sortByName = (a: Offerte, b: Offerte) => {
    const ca = customers.find((x) => x.id === a.customerId);
    const cb = customers.find((x) => x.id === b.customerId);
    const na = ca ? `${ca.nachname} ${ca.vorname}`.toLowerCase() : 'zzz';
    const nb = cb ? `${cb.nachname} ${cb.vorname}`.toLowerCase() : 'zzz';
    return na < nb ? -1 : na > nb ? 1 : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 className="sf-title1" style={{ paddingTop: 8 }}>Offerten</h1>
        <button onClick={onNew} className="btn-tinted">+ Neue</button>
      </div>

      {!offerten.length && (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 16, color: 'var(--label2)' }}>Noch keine Offerten.</div>
        </div>
      )}

      {(['entwurf', 'versendet', 'angenommen', 'abgelehnt'] as OfferteStatus[]).map((st) => {
        const grp = offerten.filter((o) => o.status === st).sort(sortByName);
        if (!grp.length) return null;
        return (
          <div key={st}>
            <p className="section-header" style={{ paddingLeft: 0, color: STATUS_COLORS[st] }}>{STATUS_LABELS[st]} ({grp.length})</p>
            <div className="inset-grouped-list" style={{ marginBottom: 4 }}>
              {grp.map((off) => {
                const c = customers.find((x) => x.id === off.customerId);
                return (
                  <div key={off.id} className="list-row" onClick={() => onOfferteClick(off)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>Offerte #{off.offertNumber}</div>
                      <div style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>{c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde'}</div>
                      {off.totalBetrag && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginTop: 1 }}>CHF {off.totalBetrag}</div>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); exportOfferteExcel(off, c); }} className="excel-btn" title="Excel herunterladen">XLS</button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--label3)' }}>{new Date(off.createdAt).toLocaleDateString('de-CH')}</div>
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
