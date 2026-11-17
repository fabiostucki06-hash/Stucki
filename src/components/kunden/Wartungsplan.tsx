import { useState } from 'react';
import Sheet from '../ui/Sheet';
import { SFCheckmark, SFChevron, SFClock, SFPlus } from '../Icons';
import { formatDateCH } from '../../lib/utils';
import { todayISO } from '../../lib/offerte-docs';
import {
  formatKm, neueServiceId, serviceErledigt, serviceZuruecksetzen, serviceZustand, standardWartungsplan,
  type ServiceZustand,
} from '../../lib/vehicles';
import type { ServiceItem, Vehicle } from '../../types';

/** Status groups, in display order. "Fällig" = overdue or due soon. */
type Gruppe = 'faellig' | 'geplant' | 'erledigt';
const GRUPPE_VON: Record<ServiceZustand, Gruppe> = { ueberfaellig: 'faellig', bald: 'faellig', faellig: 'geplant', gemacht: 'erledigt' };
const GRUPPEN: { key: Gruppe; label: string }[] = [
  { key: 'faellig',  label: 'Fällig' },
  { key: 'geplant',  label: 'In Zukunft fällig' },
  { key: 'erledigt', label: 'Erledigt' },
];
const RANG: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, faellig: 2, gemacht: 3 };

/** "05/2027" */
const monatJahr = (iso: string) => { const [y, m] = iso.split('-'); return `${m}/${y}`; };

/** "Alle 15'000 km / 12 Mt." */
const intervallText = (i: ServiceItem) => {
  const t = [i.intervallKm ? `${formatKm(i.intervallKm)} km` : '', i.intervallMonate ? `${i.intervallMonate} Mt.` : ''].filter(Boolean).join(' / ');
  return t ? `Alle ${t}` : '';
};

const datumKm = (datum?: string, km?: string) =>
  [datum ? formatDateCH(datum) : '', km ? `${formatKm(km)} km` : ''].filter(Boolean).join(' · ');

interface WartungsplanProps {
  vehicle: Vehicle;
  /** Stores the vehicle with the changed plan / mileage. */
  onSave: (v: Vehicle) => Promise<void>;
}

/** Wartungsplan of a vehicle: standard service items and wear parts, grouped
    by status. One tap ticks an item off ("Gemacht") or flags it again for the
    future ("In Zukunft fällig"); intervals and details are edited in a sheet.
    Due dates / mileages follow from the last service plus the interval. */
export default function Wartungsplan({ vehicle, onSave }: WartungsplanProps) {
  const items = vehicle.service ?? [];
  const [edit, setEdit] = useState<{ item: ServiceItem; neu: boolean } | null>(null);
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

  // The current mileage is entered at the visit; it dates every item ticked off.
  const kmAktuell = km.trim() || vehicle.km;
  function saveKm() {
    if (km.trim() !== (vehicle.km ?? '')) void save({ km: km.trim() || undefined });
  }

  /** Checked items are undone, everything else (incl. a done item that is due
      again) is ticked off today at the current mileage. */
  function toggleGemacht(it: ServiceItem, zustand: ServiceZustand) {
    const neu = zustand === 'gemacht' ? serviceZuruecksetzen(it) : serviceErledigt(it, todayISO(), kmAktuell);
    void save({ km: kmAktuell || undefined, service: items.map((x) => (x.id === it.id ? neu : x)) });
  }
  const vormerken = (it: ServiceItem) => setItems(items.map((x) => (x.id === it.id ? { ...it, status: 'faellig' } : x)));

  function speichern(it: ServiceItem) {
    void setItems(edit?.neu ? [...items, it] : items.map((x) => (x.id === it.id ? it : x)));
    setEdit(null);
  }
  function entfernen(it: ServiceItem) {
    if (!window.confirm(`"${it.name}" aus dem Wartungsplan entfernen?`)) return;
    void setItems(items.filter((x) => x.id !== it.id));
    setEdit(null);
  }
  const neuePosition = () => setEdit({ item: { id: neueServiceId(), name: '', status: 'faellig' }, neu: true });

  const mitZustand = items
    .map((item) => ({ item, zustand: serviceZustand(item, vehicle.km) }))
    .sort((a, b) => RANG[a.zustand] - RANG[b.zustand]);

  const sheet = edit && (
    <WartungsplanEditor
      item={edit.item} neu={edit.neu} busy={busy}
      onSave={speichern} onDelete={() => entfernen(edit.item)} onClose={() => setEdit(null)}
    />
  );

  if (!items.length) {
    return (
      <div className="sp sp-empty">
        <p>Noch kein Wartungsplan. Der Standard-Wartungsplan enthält Öl, Filter, Bremsflüssigkeit, Zahnriemen, MFK u.a. mit üblichen Intervallen – alles anpassbar.</p>
        <button className="btn-system btn-primary" disabled={busy} onClick={() => setItems(standardWartungsplan())}>Standard-Wartungsplan anlegen</button>
        <button className="sp-text-btn" disabled={busy} onClick={neuePosition}><SFPlus size={12} /> Eigene Position</button>
        {sheet}
      </div>
    );
  }

  return (
    <div className="sp">
      <div className="sp-bar">
        <label className="sp-km">
          <span>KM-Stand heute</span>
          <input
            className="cf-input" type="number" inputMode="numeric" value={km} placeholder="85000" autoComplete="off"
            onChange={(e) => setKm(e.target.value)} onBlur={saveKm}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <button className="sp-text-btn" disabled={busy} onClick={neuePosition}><SFPlus size={12} /> Position</button>
      </div>

      {GRUPPEN.map(({ key, label }) => {
        const rows = mitZustand.filter((x) => GRUPPE_VON[x.zustand] === key);
        if (!rows.length) return null;
        const dot = key === 'erledigt' ? 'var(--green)'
          : key === 'geplant' ? 'var(--label3)'
          : rows.some((x) => x.zustand === 'ueberfaellig') ? 'var(--red)' : 'var(--orange)';
        return (
          <section key={key} className="sp-group" aria-label={label}>
            <h4 className="sp-group-head">
              <span className="dot" style={{ background: dot }} />
              {label}
              <span className="sp-group-count">{rows.length}</span>
            </h4>
            <ul className="sp-list">
              {rows.map(({ item, zustand }) => (
                <WartungsplanZeile
                  key={item.id} item={item} zustand={zustand} busy={busy}
                  onToggle={() => toggleGemacht(item, zustand)}
                  onVormerken={() => vormerken(item)}
                  onOpen={() => setEdit({ item, neu: false })}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {sheet}
    </div>
  );
}

interface ZeileProps {
  item: ServiceItem;
  zustand: ServiceZustand;
  busy: boolean;
  onToggle: () => void;
  onVormerken: () => void;
  onOpen: () => void;
}

/** Checklist row: check circle · name + interval · next due (right). */
function WartungsplanZeile({ item, zustand, busy, onToggle, onVormerken, onOpen }: ZeileProps) {
  const done = zustand === 'gemacht';
  const offen = zustand === 'ueberfaellig' || zustand === 'bald';
  const sub = done && (item.letztesDatum || item.letzteKm)
    ? `Gemacht ${datumKm(item.letztesDatum, item.letzteKm)}`
    : [intervallText(item), item.notiz].filter(Boolean).join(' · ');
  const faellig = [
    item.faelligKm ? `${formatKm(item.faelligKm)} km` : '',
    item.faelligDatum ? monatJahr(item.faelligDatum) : '',
  ].filter(Boolean);

  return (
    <li className={`sp-row sp-row-${zustand}`}>
      <button
        className={`sp-check${done ? ' on' : ''}`} disabled={busy} onClick={onToggle}
        aria-pressed={done} aria-label={`${item.name}: ${done ? 'Gemacht rückgängig' : 'Gemacht'}`}
        title={done ? 'Gemacht – rückgängig machen' : 'Als gemacht abhaken'}
      >
        <span className="sp-circle">{done && <SFCheckmark />}</span>
      </button>

      <button className="sp-main" onClick={onOpen} aria-label={`${item.name} bearbeiten`}>
        <span className="sp-text">
          <span className="sp-name">{item.name}</span>
          {sub && <span className="sp-sub">{sub}</span>}
        </span>
        <span className="sp-due">
          {offen && (
            <span className={`sp-badge ${zustand === 'ueberfaellig' ? 'sp-badge-red' : 'sp-badge-orange'}`}>
              {zustand === 'ueberfaellig' ? 'Überfällig' : 'Bald fällig'}
            </span>
          )}
          {!offen && faellig.length > 0 && <span className="sp-due-label">{done ? 'Nächste' : 'Fällig'}</span>}
          {faellig.map((t) => <span key={t} className="sp-due-val">{t}</span>)}
        </span>
        <span className="sp-chevron" aria-hidden="true"><SFChevron size={14} /></span>
      </button>

      {done && (
        <button className="sp-flag" disabled={busy} onClick={onVormerken} aria-label={`${item.name}: In Zukunft fällig`} title="In Zukunft fällig">
          <SFClock size={16} />
        </button>
      )}
    </li>
  );
}

interface EditorProps {
  item: ServiceItem;
  neu: boolean;
  busy: boolean;
  onSave: (it: ServiceItem) => void;
  onDelete: () => void;
  onClose: () => void;
}

function WartungsplanEditor({ item, neu, busy, onSave, onDelete, onClose }: EditorProps) {
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
  const ok = !!f.name.trim() && !busy;

  function submit() {
    if (!ok) return;
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
    <Sheet
      title={neu ? 'Neue Position' : 'Position bearbeiten'} onClose={onClose}
      barRight={<button className="bar-btn" onClick={onClose}>Abbrechen</button>}
    >
      <form className="sp-editor" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="cf-field">
          <label className="cf-label" htmlFor="sp-name">Bezeichnung</label>
          <input id="sp-name" className="cf-input" value={f.name} onChange={s('name')} placeholder="z.B. Motoröl & Ölfilter" autoFocus={neu} />
        </div>

        <p className="sp-editor-head">Intervall</p>
        <div className="cf-grid-2">
          <div className="cf-field"><label className="cf-label" htmlFor="sp-ikm">Alle … km</label><input id="sp-ikm" className="cf-input" type="number" inputMode="numeric" value={f.intervallKm} onChange={s('intervallKm')} placeholder="15000" /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-imt">Alle … Monate</label><input id="sp-imt" className="cf-input" type="number" inputMode="numeric" value={f.intervallMonate} onChange={s('intervallMonate')} placeholder="12" /></div>
        </div>

        <p className="sp-editor-head">Zuletzt gemacht</p>
        <div className="cf-grid-2">
          <div className="cf-field"><label className="cf-label" htmlFor="sp-ld">Datum</label><input id="sp-ld" className="cf-input" type="date" value={f.letztesDatum} onChange={s('letztesDatum')} /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-lkm">KM-Stand</label><input id="sp-lkm" className="cf-input" type="number" inputMode="numeric" value={f.letzteKm} onChange={s('letzteKm')} /></div>
        </div>

        <p className="sp-editor-head">Nächste Fälligkeit</p>
        <div className="cf-grid-2">
          <div className="cf-field"><label className="cf-label" htmlFor="sp-fd">Datum</label><input id="sp-fd" className="cf-input" type="date" value={f.faelligDatum} onChange={s('faelligDatum')} /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-fkm">KM-Stand</label><input id="sp-fkm" className="cf-input" type="number" inputMode="numeric" value={f.faelligKm} onChange={s('faelligKm')} /></div>
        </div>

        <div className="cf-field">
          <label className="cf-label" htmlFor="sp-notiz">Notiz</label>
          <input id="sp-notiz" className="cf-input" value={f.notiz} onChange={s('notiz')} placeholder="z.B. 5W-30, Longlife" />
        </div>

        {historie.length > 0 && (
          <div>
            <p className="sp-editor-head">Verlauf</p>
            <ul className="sp-history">
              {historie.map((h, i) => (
                <li key={i}><span className="sp-history-check"><SFCheckmark /></span>{datumKm(h.datum, h.km)}</li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" className="btn-system btn-primary" disabled={!ok}>Sichern</button>
        {!neu && <button type="button" className="text-danger-btn" onClick={onDelete} disabled={busy}>Aus Wartungsplan entfernen</button>}
      </form>
    </Sheet>
  );
}
