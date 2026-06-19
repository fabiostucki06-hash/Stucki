import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { exportRechnungPDF } from '../../lib/pdf-rechnung';
import type { Customer, Rechnung, RechnungStatus } from '../../types';

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

export default function RechnungDetail({ rechnung, customer, onClose, onUpdate, onDelete, onEdit }: RechnungDetailProps) {
  const [saving, setSaving] = useState(false);
  const sc = ST_META[rechnung.status] ?? ST_META.entwurf;

  const isOverdue = rechnung.faelligAm
    && rechnung.status === 'versendet'
    && new Date(rechnung.faelligAm) < new Date();

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

      {rechnung.faelligAm && (
        <div className="sf-subhead" style={{ color: isOverdue ? 'var(--red)' : 'var(--label2)', marginBottom: 12 }}>
          Zahlbar bis: {new Date(rechnung.faelligAm).toLocaleDateString('de-CH')}{isOverdue ? ' (überfällig)' : ''}
        </div>
      )}

      {rechnung.zahlungsFrist && (
        <div style={{ background: 'rgba(52,199,89,0.09)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid rgba(52,199,89,0.22)' }}>
          <span style={{ fontSize: 16, color: 'var(--green)' }}>✓</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Zahlungsziel: {rechnung.zahlungsFrist} Tage netto</span>
        </div>
      )}

      <p className="section-header">Positionen</p>
      <div className="inset-grouped-list" style={{ marginBottom: 16 }}>
        {(rechnung.positionen ?? []).map((pos, i) => (
          <div key={i} className="list-row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <div className="sf-subhead">{pos.beschreibung}</div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--label)' }}>
              CHF {fCHF(parseFloat(pos.preis || '0'))}
            </div>
          </div>
        ))}
        <div className="list-row" style={{ cursor: 'default', background: 'rgba(0,122,255,0.06)' }}>
          <div className="sf-headline">Total</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)' }}>
            CHF {fCHF(parseFloat(rechnung.totalBetrag || '0'))}
          </div>
        </div>
      </div>

      {rechnung.notizen && (
        <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16 }}>
          {rechnung.notizen}
        </div>
      )}

      <button onClick={() => exportRechnungPDF(rechnung, customer)} className="btn-system btn-green" style={{ marginBottom: 12 }}>
        PDF exportieren
      </button>
      <button
        onClick={async () => { if (window.confirm('Rechnung löschen?')) await onDelete(rechnung.id); }}
        className="btn-system btn-destructive"
      >
        Rechnung löschen
      </button>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--label3)', textAlign: 'center' }}>
        Erstellt: {new Date(rechnung.createdAt).toLocaleDateString('de-CH')} · Rechnung #{rechnung.rechnungNumber}
      </div>
    </Sheet>
  );
}
