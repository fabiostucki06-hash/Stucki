import { setPauschalen } from '../../lib/settings';
import { DEFAULT_PAUSCHALEN } from '../../lib/sonderpositionen';
import { useSettings } from '../../hooks/useSettings';
import { SFPlus, SFXmark } from '../Icons';
import type { Pauschale } from '../../types';

/* Einstellungen → Werkstatt → Pauschalen: the flat-rate packages offered under
   "+ Pauschale…" in every Offerte / Rechnung. Changes are stored right away
   and synced to the user's other devices (settingsSync). */

const neueId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export default function PauschalenSection() {
  const { pauschalen } = useSettings();

  const update = (i: number, patch: Partial<Pauschale>) =>
    setPauschalen(pauschalen.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => setPauschalen(pauschalen.filter((_, j) => j !== i));
  const add = () => setPauschalen([...pauschalen, { id: neueId(), name: '', preis: '' }]);
  /** Shows the price as "60.00" once the field is left. */
  const formatPreis = (i: number) => {
    const n = parseFloat(pauschalen[i].preis);
    if (Number.isFinite(n)) update(i, { preis: n.toFixed(2) });
  };
  const fehlendeStandards = DEFAULT_PAUSCHALEN.filter((d) => !pauschalen.some((b) => b.id === d.id));

  return (
    <div>
      {pauschalen.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--label3)', margin: '0 0 8px' }}>Keine Pauschalen erfasst.</p>
      )}
      {pauschalen.map((b, i) => (
        <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 36px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            className="cf-input" value={b.name} placeholder="Bezeichnung, z.B. Radwechsel"
            onChange={(e) => update(i, { name: e.target.value })} aria-label="Bezeichnung der Pauschale"
          />
          <input
            className="cf-input" type="number" inputMode="decimal" min={0} step="0.05"
            value={b.preis} placeholder="CHF" style={{ textAlign: 'right' }}
            onChange={(e) => update(i, { preis: e.target.value })} onBlur={() => formatPreis(i)}
            aria-label={`Festpreis ${b.name || 'Pauschale'} in CHF`}
          />
          <button
            type="button" className="del-btn-visible" onClick={() => remove(i)}
            title="Pauschale löschen" aria-label={`Pauschale ${b.name} löschen`}
            style={{ width: 36, height: 36 }}
          >
            <SFXmark />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn-system btn-primary" style={{ height: 44, fontSize: 15, width: 'auto', flex: '1 1 180px' }} onClick={add}>
          <SFPlus size={13} /> Pauschale hinzufügen
        </button>
        {fehlendeStandards.length > 0 && (
          <button
            type="button" className="btn-system btn-secondary" style={{ height: 44, fontSize: 15, width: 'auto', flex: '1 1 180px' }}
            onClick={() => setPauschalen([...pauschalen, ...fehlendeStandards])}
          >
            Standard wiederherstellen
          </button>
        )}
      </div>
    </div>
  );
}
