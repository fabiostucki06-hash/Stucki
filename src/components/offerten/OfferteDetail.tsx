import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Spinner from '../ui/Spinner';
import { exportOfferteExcel } from '../../lib/excel';
import type { Customer, Offerte, OfferteStatus } from '../../types';

interface OfferteDetailProps {
  offerte: Offerte;
  customer: Customer | undefined;
  onClose: () => void;
  onUpdate: (upd: Offerte) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (off: Offerte) => void;
  onCreateAuftrag?: (offerte: Offerte, acceptedIndices: number[]) => Promise<void>;
  onCreateRechnung?: (offerte: Offerte, acceptedIndices: number[]) => Promise<void>;
}

type StatusMeta = { c: string; l: string };
const ST_META: Record<OfferteStatus, StatusMeta> = {
  entwurf:    { c: 'var(--label2)', l: 'Entwurf'    },
  versendet:  { c: 'var(--orange)', l: 'Versendet'  },
  angenommen: { c: 'var(--green)',  l: 'Angenommen' },
  abgelehnt:  { c: 'var(--red)',    l: 'Abgelehnt'  },
};

export default function OfferteDetail({ offerte, customer, onClose, onUpdate, onDelete, onEdit, onCreateAuftrag, onCreateRechnung }: OfferteDetailProps) {
  const [saving, setSaving] = useState(false);
  const [creatingAuftrag, setCreatingAuftrag] = useState(false);
  const [creatingRechnung, setCreatingRechnung] = useState(false);
  const positions = offerte.positionen ?? [];
  const [posAccepted, setPosAccepted] = useState<boolean[]>(() => positions.map(() => true));

  const sc = ST_META[offerte.status] ?? ST_META.entwurf;
  const isExpired = offerte.gueltigBis && new Date(offerte.gueltigBis) < new Date();

  const acceptedCount = posAccepted.filter(Boolean).length;

  const acceptedArbeit = positions.filter((p, i) => posAccepted[i] && p.typ === 'arbeit')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const acceptedMaterial = positions.filter((p, i) => posAccepted[i] && p.typ === 'material')
    .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
  const acceptedTotal = acceptedArbeit + acceptedMaterial;

  function togglePos(i: number, val: boolean) {
    setPosAccepted((prev) => { const n = [...prev]; n[i] = val; return n; });
  }

  function getAcceptedIndices() {
    return posAccepted.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
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
      title={`Offerte #${offerte.offertNumber}`}
      onClose={onClose}
      full
      barRight={<button onClick={() => onEdit(offerte)} className="bar-btn">Bearbeiten</button>}
    >
      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--label2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: sc.c, letterSpacing: '0.34px' }}>{sc.l}</div>
        {offerte.titel && <div style={{ fontSize: 15, color: 'var(--label2)', marginTop: 4 }}>{offerte.titel}</div>}
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
            onClick={async () => { setSaving(true); await onUpdate({ ...offerte, status: s }); setSaving(false); }}
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
          Gültig bis: {new Date(offerte.gueltigBis).toLocaleDateString('de-CH')}{isExpired ? ' (abgelaufen)' : ''}
        </div>
      )}

      <div style={{ background: 'rgba(52,199,89,0.09)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, border: '0.5px solid rgba(52,199,89,0.22)' }}>
        <span style={{ fontSize: 16, color: 'var(--green)' }}>✓</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>Zahlungsziel: 30 Tage netto</span>
      </div>

      {/* ── Positionen mit Accept/Reject ── */}
      <p className="section-header">Positionen</p>
      <div className="inset-grouped-list" style={{ marginBottom: 8 }}>
        {positions.map((pos, i) => {
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
              <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="sf-subhead">{pos.beschreibung}</div>
                  <div style={{ fontSize: 11, color: 'var(--label3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {pos.typ === 'arbeit' ? 'Arbeit' : 'Material'}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--label)', flexShrink: 0 }}>
                  CHF {(parseFloat(pos.preis || '0')).toFixed(2)}
                </div>
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

        {/* Accepted subtotal */}
        {positions.length > 0 && (
          <div className="list-row" style={{ cursor: 'default', background: 'rgba(0,122,255,0.06)', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
              <div className="sf-headline" style={{ flex: 1 }}>
                Total Angenommen
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--label3)', marginLeft: 6 }}>
                  ({acceptedCount}/{positions.length})
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)' }}>
                CHF {acceptedTotal.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Aktionen: Auftrag / Rechnung erstellen ── */}
      {positions.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {onCreateAuftrag && (
            <button
              onClick={handleCreateAuftrag}
              disabled={creatingAuftrag || creatingRechnung || acceptedCount === 0}
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
              disabled={creatingAuftrag || creatingRechnung || acceptedCount === 0}
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

      {offerte.notizen && <div style={{ background: 'var(--fill3)', borderRadius: 12, padding: '12px 14px', fontSize: 15, color: 'var(--label2)', marginBottom: 16 }}>{offerte.notizen}</div>}

      <button onClick={() => exportOfferteExcel(offerte, customer)} className="btn-system btn-green" style={{ marginBottom: 12 }}>Excel exportieren</button>
      <button onClick={async () => { if (window.confirm('Offerte löschen?')) await onDelete(offerte.id); }} className="btn-system btn-destructive">Offerte löschen</button>
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--label3)', textAlign: 'center' }}>Erstellt: {new Date(offerte.createdAt).toLocaleDateString('de-CH')} · Offerte #{offerte.offertNumber}</div>
    </Sheet>
  );
}
