import { useState } from 'react';
import { SFCheckmark, SFPlus, SFTrash } from '../Icons';
import { formatDateCH } from '../../lib/utils';
import { todayISO } from '../../lib/offerte-docs';
import {
  formatKm, neueServiceId, serviceErledigt, serviceZuruecksetzen, serviceZustand, standardServicePlan,
  type ServiceZustand,
} from '../../lib/vehicles';
import type { ServiceItem, Vehicle } from '../../types';

const ZUSTAND: Record<ServiceZustand, { label: string; cls: string }> = {
  ueberfaellig: { label: 'Fällig',            cls: 'sp-badge-red' },
  bald:         { label: 'Bald fällig',       cls: 'sp-badge-orange' },
  faellig:      { label: 'In Zukunft fällig', cls: 'sp-badge-blue' },
  gemacht:      { label: 'Gemacht',           cls: 'sp-badge-green' },
};
const RANG: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, faellig: 2, gemacht: 3 };

type Filter = 'alle' | 'offen' | 'gemacht';

/** "15'000 km / 12 Mt." */
const intervallText = (i: ServiceItem) =>
  [i.intervallKm ? `${formatKm(i.intervallKm)} km` : '', i.intervallMonate ? `${i.intervallMonate} Mt.` : ''].filter(Boolean).join(' / ');

const datumKm = (datum?: string, km?: string) =>
  [datum ? formatDateCH(datum) : '', km ? `${formatKm(km)} km` : ''].filter(Boolean).join(' · ');

interface ServicePlanProps {
  vehicle: Vehicle;
  /** Stores the vehicle with the changed plan / mileage. */
  onSave: (v: Vehicle) => Promise<void>;
}

/** Service-Wartungsplan of a vehicle: standard service items and wear parts,
    ticked off per visit ("Gemacht") or marked as upcoming ("In Zukunft fällig").
    Due dates / mileages follow from the last service plus the interval. */
export default function ServicePlan({ vehicle, onSave }: ServicePlanProps) {
  const items = vehicle.service ?? [];
  const [filter, setFilter] = useState<Filter>('alle');
  const [editId, setEditId] = useState<string | null>(null);
  const [km, setKm] = useState(vehicle.km ?? '');
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<Vehicle>) {
    if (busy) return;
    setBusy(true);
    try { await onSave({ ...vehicle, ...patch }); }
    catch { /* toast shown by the context */ }
    finally { setBusy(false); }
  }
  const setItems = (service: ServiceItem[]) => save({ service });
  const setItem = (it: ServiceItem) => setItems(items.map((x) => (x.id === it.id ? it : x)));

  // The current mileage is entered at the visit; it dates every item ticked off.
  const kmAktuell = km.trim() || vehicle.km;
  function saveKm() {
    if (km.trim() !== (vehicle.km ?? '')) void save({ km: km.trim() || undefined });
  }

  function toggleGemacht(it: ServiceItem) {
    if (it.status === 'gemacht') void setItem(serviceZuruecksetzen(it));
    else void save({ km: kmAktuell || undefined, service: items.map((x) => (x.id === it.id ? serviceErledigt(it, todayISO(), kmAktuell) : x)) });
  }
  function setFaellig(it: ServiceItem) {
    if (it.status !== 'faellig') void setItem({ ...it, status: 'faellig' });
  }

  function addItem() {
    const it: ServiceItem = { id: neueServiceId(), name: 'Neue Position', status: 'faellig' };
    void setItems([...items, it]);
    setEditId(it.id);
    setFilter('alle');
  }

  const mitZustand = items.map((item) => ({ item, zustand: serviceZustand(item, vehicle.km) }));
  const zaehler = (z: ServiceZustand) => mitZustand.filter((x) => x.zustand === z).length;
  const sichtbar = mitZustand
    .filter((x) => filter === 'alle' || (filter === 'gemacht' ? x.zustand === 'gemacht' : x.zustand !== 'gemacht'))
    .sort((a, b) => RANG[a.zustand] - RANG[b.zustand]);

  return (
    <div className="glass-panel sp" style={{ padding: 12, marginBottom: 16 }}>
      <div className="sp-head">
        <div className="cf-field" style={{ flex: '1 1 140px' }}>
          <label className="cf-label">KM-Stand heute</label>
          <input
            className="cf-input" type="number" inputMode="numeric" value={km} placeholder="85000"
            onChange={(e) => setKm(e.target.value)} onBlur={saveKm}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        {items.length > 0 && (
          <div className="sp-counts">
            {zaehler('ueberfaellig') > 0 && <span className="sp-badge sp-badge-red">{zaehler('ueberfaellig')} fällig</span>}
            {zaehler('bald') > 0 && <span className="sp-badge sp-badge-orange">{zaehler('bald')} bald</span>}
            <span className="sp-badge sp-badge-green">{zaehler('gemacht')} gemacht</span>
          </div>
        )}
      </div>

      {!items.length ? (
        <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
          <p className="sf-footnote" style={{ color: 'var(--label2)', marginBottom: 12 }}>
            Noch kein Wartungsplan. Der Standardplan enthält Öl, Filter, Bremsflüssigkeit, Zahnriemen, MFK u.a. mit üblichen Intervallen – alles anpassbar.
          </p>
          <button className="btn-system btn-primary" disabled={busy} onClick={() => setItems(standardServicePlan())}>Standard-Wartungsplan anlegen</button>
          <button className="sp-add" disabled={busy} onClick={addItem}><SFPlus size={12} /> Eigene Position</button>
        </div>
      ) : (
        <>
          <div className="sp-filter" role="tablist">
            {([['alle', 'Alle'], ['offen', 'Fällig / anstehend'], ['gemacht', 'Gemacht']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>

          <div className="sp-list">
            {sichtbar.map(({ item, zustand }) => (
              <div key={item.id} className={`sp-item sp-item-${zustand}`}>
                <div className="sp-item-top">
                  <span className="sp-name">{item.name}</span>
                  <span className={`sp-badge ${ZUSTAND[zustand].cls}`}>{ZUSTAND[zustand].label}</span>
                </div>
                <div className="sp-meta">
                  {intervallText(item) && <span>Intervall {intervallText(item)}</span>}
                  {(item.letztesDatum || item.letzteKm) && <span>Zuletzt {datumKm(item.letztesDatum, item.letzteKm)}</span>}
                  {(item.faelligDatum || item.faelligKm) && <span className="sp-next">Nächste {datumKm(item.faelligDatum, item.faelligKm)}</span>}
                  {item.notiz && <span>{item.notiz}</span>}
                </div>
                <div className="sp-actions">
                  <button className={`sp-check sp-check-green${item.status === 'gemacht' ? ' on' : ''}`} aria-pressed={item.status === 'gemacht'} disabled={busy} onClick={() => toggleGemacht(item)}>
                    <span className="sp-box">{item.status === 'gemacht' && <SFCheckmark />}</span>Gemacht
                  </button>
                  <button className={`sp-check sp-check-blue${item.status === 'faellig' ? ' on' : ''}`} aria-pressed={item.status === 'faellig'} disabled={busy} onClick={() => setFaellig(item)}>
                    <span className="sp-box">{item.status === 'faellig' && <SFCheckmark />}</span>In Zukunft fällig
                  </button>
                  <button className="sp-edit" onClick={() => setEditId(editId === item.id ? null : item.id)}>{editId === item.id ? 'Schliessen' : 'Bearbeiten'}</button>
                </div>
                {editId === item.id && (
                  <ServiceItemEditor
                    item={item} busy={busy}
                    onSave={(it) => { void setItem(it); setEditId(null); }}
                    onDelete={() => { if (window.confirm(`"${item.name}" aus dem Wartungsplan entfernen?`)) { void setItems(items.filter((x) => x.id !== item.id)); setEditId(null); } }}
                  />
                )}
              </div>
            ))}
            {!sichtbar.length && <div className="sf-footnote" style={{ color: 'var(--label3)', textAlign: 'center', padding: '12px 0' }}>Keine Positionen.</div>}
          </div>
          <button className="sp-add" disabled={busy} onClick={addItem}><SFPlus size={12} /> Position hinzufügen</button>
        </>
      )}
    </div>
  );
}

function ServiceItemEditor({ item, busy, onSave, onDelete }: { item: ServiceItem; busy: boolean; onSave: (it: ServiceItem) => void; onDelete: () => void }) {
  const [f, setF] = useState({
    name: item.name,
    intervallKm: item.intervallKm ? String(item.intervallKm) : '',
    intervallMonate: item.intervallMonate ? String(item.intervallMonate) : '',
    letztesDatum: item.letztesDatum ?? '',
    letzteKm: item.letzteKm ?? '',
    faelligDatum: item.faelligDatum ?? '',
    faelligKm: item.faelligKm ?? '',
    notiz: item.notiz ?? '',
  });
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (v: string) => (parseInt(v, 10) > 0 ? parseInt(v, 10) : undefined);
  const opt = (v: string) => v.trim() || undefined;

  function submit() {
    if (!f.name.trim()) return;
    onSave({
      ...item,
      name: f.name.trim(),
      intervallKm: num(f.intervallKm),
      intervallMonate: num(f.intervallMonate),
      letztesDatum: opt(f.letztesDatum),
      letzteKm: opt(f.letzteKm),
      faelligDatum: opt(f.faelligDatum),
      faelligKm: opt(f.faelligKm),
      notiz: opt(f.notiz),
    });
  }

  const historie = [...(item.historie ?? [])].reverse();

  return (
    <div className="sp-editor">
      <div className="cf-field">
        <label className="cf-label">Bezeichnung</label>
        <input className="cf-input" value={f.name} onChange={s('name')} />
      </div>
      <div className="cf-grid-2">
        <div className="cf-field"><label className="cf-label">Intervall km</label><input className="cf-input" type="number" inputMode="numeric" value={f.intervallKm} onChange={s('intervallKm')} placeholder="15000" /></div>
        <div className="cf-field"><label className="cf-label">Intervall Monate</label><input className="cf-input" type="number" inputMode="numeric" value={f.intervallMonate} onChange={s('intervallMonate')} placeholder="12" /></div>
        <div className="cf-field"><label className="cf-label">Zuletzt am</label><input className="cf-input" type="date" value={f.letztesDatum} onChange={s('letztesDatum')} /></div>
        <div className="cf-field"><label className="cf-label">Zuletzt bei km</label><input className="cf-input" type="number" inputMode="numeric" value={f.letzteKm} onChange={s('letzteKm')} /></div>
        <div className="cf-field"><label className="cf-label">Fällig am</label><input className="cf-input" type="date" value={f.faelligDatum} onChange={s('faelligDatum')} /></div>
        <div className="cf-field"><label className="cf-label">Fällig bei km</label><input className="cf-input" type="number" inputMode="numeric" value={f.faelligKm} onChange={s('faelligKm')} /></div>
      </div>
      <div className="cf-field">
        <label className="cf-label">Notiz</label>
        <input className="cf-input" value={f.notiz} onChange={s('notiz')} placeholder="z.B. 5W-30, Longlife" />
      </div>
      {historie.length > 0 && (
        <div className="sp-history">
          <span className="cf-label">Verlauf</span>
          {historie.map((h, i) => <div key={i}>✓ {datumKm(h.datum, h.km)}</div>)}
        </div>
      )}
      <div className="sp-editor-actions">
        <button className="sp-del" onClick={onDelete} disabled={busy} title="Entfernen"><SFTrash /> Entfernen</button>
        <button className="cf-btn-save" onClick={submit} disabled={busy || !f.name.trim()}>Sichern</button>
      </div>
    </div>
  );
}
