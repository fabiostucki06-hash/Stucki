import { SFChevron } from '../Icons';
import { exportOffertePDF, exportAuftragsbestaetigungPDF } from '../../lib/pdf-offerte';
import { formatDateCH } from '../../lib/utils';
import { ActiveOfferteBadge, ActiveOfferteToggle } from './ActiveOfferte';
import { useActiveOfferte } from '../../hooks/useActiveOfferte';
import { useSettings } from '../../hooks/useSettings';
import { offerteNr } from '../../lib/offerte-docs';
import type { Customer, Offerte, OfferteStatus } from '../../types';

/** 'alle' = every Offerte, 'material' = only Materialofferten,
    'ab' = accepted Offerten as Auftragsbestätigungen. */
export type OfferteListVariant = 'alle' | 'material' | 'ab';

interface OfferteListProps {
  offerten: Offerte[];
  customers: Customer[];
  onOfferteClick: (o: Offerte) => void;
  onEdit: (o: Offerte) => void;
  onNew: () => void;
  variant?: OfferteListVariant;
}

const STATUS_LABELS: Record<OfferteStatus, string> = { entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const STATUS_COLORS: Record<OfferteStatus, string> = { entwurf: 'var(--label2)', versendet: 'var(--orange)', angenommen: 'var(--green)', abgelehnt: 'var(--red)' };

const TITLES: Record<OfferteListVariant, string> = { alle: 'Offerten', material: 'Materialofferten', ab: 'Auftragsbestätigungen' };
const EMPTY: Record<OfferteListVariant, { icon: string; text: string }> = {
  alle: { icon: '📄', text: 'Noch keine Offerten.' },
  material: { icon: '📦', text: 'Noch keine Materialofferten. Eine Materialofferte wird in einer Offerte über „Materialofferte erstellen“ angelegt.' },
  ab: { icon: '✅', text: 'Noch keine Auftragsbestätigungen. Sobald eine Offerte angenommen ist, erscheint sie hier.' },
};

interface Group { key: string; label: string; color: string; items: Offerte[] }

export default function OfferteList({ offerten, customers, onOfferteClick, onEdit, onNew, variant = 'alle' }: OfferteListProps) {
  const active = useActiveOfferte(offerten);
  const { signature } = useSettings();
  const isAB = variant === 'ab';

  const sortByName = (a: Offerte, b: Offerte) => {
    const ca = customers.find((x) => x.id === a.customerId);
    const cb = customers.find((x) => x.id === b.customerId);
    const na = ca ? `${ca.nachname} ${ca.vorname}`.toLowerCase() : 'zzz';
    const nb = cb ? `${cb.nachname} ${cb.vorname}`.toLowerCase() : 'zzz';
    return na < nb ? -1 : na > nb ? 1 : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const list = variant === 'material' ? offerten.filter((o) => o.art === 'material')
    : isAB ? offerten.filter((o) => o.status === 'angenommen')
    : offerten;

  // AB: grouped by whether the customer has signed; otherwise by status.
  const groups: Group[] = isAB
    ? [
        { key: 'offen', label: 'Unterschrift ausstehend', color: 'var(--orange)', items: list.filter((o) => !o.ab?.unterschrift) },
        { key: 'unterschrieben', label: 'Unterschrieben', color: 'var(--green)', items: list.filter((o) => !!o.ab?.unterschrift) },
      ]
    : (['entwurf', 'versendet', 'angenommen', 'abgelehnt'] as OfferteStatus[]).map((st) => (
        { key: st, label: STATUS_LABELS[st], color: STATUS_COLORS[st], items: list.filter((o) => o.status === st) }
      ));

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 className="sf-title1" style={{ paddingTop: 8 }}>{TITLES[variant]}</h1>
        {/* Materialofferten and ABs are derived from an existing Offerte, not created from scratch. */}
        {variant === 'alle' && <button onClick={onNew} className="btn-tinted">+ Neue</button>}
      </div>

      {!list.length && (
        <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{EMPTY[variant].icon}</div>
          <div style={{ fontSize: 16, color: 'var(--label2)' }}>{EMPTY[variant].text}</div>
        </div>
      )}

      {groups.map(({ key, label, color, items }) => {
        const grp = [...items].sort(sortByName);
        if (!grp.length) return null;
        return (
          <div key={key}>
            <p className="section-header" style={{ paddingLeft: 0, color }}>{label} ({grp.length})</p>
            <div className="inset-grouped-list" style={{ marginBottom: 4 }}>
              {grp.map((off) => {
                const c = customers.find((x) => x.id === off.customerId);
                const docName = isAB ? 'Auftragsbestätigung' : off.art === 'material' ? 'Materialofferte' : 'Offerte';
                return (
                  <div key={off.id} className={`list-row${off.id === active?.id ? ' ao-active' : ''}`} onClick={() => onOfferteClick(off)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {docName} #{offerteNr(off)}
                        {off.id === active?.id && <ActiveOfferteBadge />}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>{c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde'}</div>
                      {isAB && off.ab?.fertigstellung && <div style={{ fontSize: 13, color: 'var(--label2)', marginTop: 1 }}>Fertigstellung: {off.ab.fertigstellung}</div>}
                      {off.totalBetrag && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginTop: 1 }}>CHF {off.totalBetrag}</div>}
                    </div>
                    {!isAB && <ActiveOfferteToggle offerte={off} />}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (isAB) exportAuftragsbestaetigungPDF(off, c, signature); else exportOffertePDF(off, c); }}
                      className="excel-btn"
                      title="PDF herunterladen"
                    >PDF</button>
                    {!isAB && <button onClick={(e) => { e.stopPropagation(); onEdit(off); }} className="excel-btn" style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--blue)', border: '1px solid rgba(0,122,255,0.25)' }} title="Bearbeiten">✎</button>}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--label3)' }}>{formatDateCH(isAB && off.ab?.datum ? off.ab.datum : off.createdAt)}</div>
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
