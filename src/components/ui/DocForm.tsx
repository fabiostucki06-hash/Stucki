import { showToast } from './Toast';
import { Fragment, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Spinner from './Spinner';
import { SFCheckmark, SFChevronUp, SFGrip, SFPlus, SFXmark } from '../Icons';
import type { AutoSaveStatus } from '../../hooks/useAutoSave';
import { findPartLink, parsePartLink } from '../../lib/utils';
import { parsePartTitle, partNameFromUrl } from '../../lib/partTitle';
import { getMargin } from '../../lib/settings';
import type { ArbeitPosition, MaterialPosition } from '../../types';
import { materialSatz, zeMinuten, zeText } from '../../lib/ze';
import { margeVon, vkAusEk } from '../../lib/marge';
import { useSettings } from '../../hooks/useSettings';
import { neueVersandPosition, pauschalePosition, positionsArt } from '../../lib/sonderpositionen';
import { anstehendeServices, fahrzeugChips, fahrzeugLabel } from '../../lib/vehicles';
import { useApp } from '../../context/AppContext';

/* Shared building blocks for the Offerte / Rechnung / Auftrag creation forms
   (styles: `.df-*` in globals.css). */

export type ArbeitRow   = ArbeitPosition & { zeLoading: boolean; zeHint: string };
export type MaterialRow = MaterialPosition;

export const fCHF = (n: number) => 'CHF ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

export function FormCard({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="df-card">
      <div className="df-card-hdr">
        <span className="df-title">{title}</span>
        {hint && <span className="df-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function VehicleChips({ chips }: { chips: (string | undefined)[] }) {
  if (!chips.length) return null;
  return (
    <div className="df-vehicle">
      <span>Fahrzeug</span>
      <div className="mf-chips">
        {chips.map((v, i) => <span key={i} className="mf-chip">{v}</span>)}
      </div>
    </div>
  );
}

/** Picks which of the customer's vehicles the document is for (select only
    with more than one), shows its data and any maintenance due. Renders the
    `.df-span2` cells of a `.df-grid`. */
export function VehicleSelect({ customerId, vehicleId, onChange }: { customerId: string; vehicleId: string; onChange: (id: string) => void }) {
  const { vehiclesOf } = useApp();
  const vs = customerId ? vehiclesOf(customerId) : [];
  const v = vs.find((x) => x.id === vehicleId) ?? vs[0];
  // Keeps the stored choice in step with what is shown (new customer → main vehicle).
  useEffect(() => {
    if ((v?.id ?? '') !== vehicleId) onChange(v?.id ?? '');
  }, [v?.id, vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!customerId) return null;
  const offen = anstehendeServices(v);
  const rot = offen.some((x) => x.zustand === 'ueberfaellig');
  return (
    <>
      {vs.length > 1 && (
        <div className="cf-field df-span2">
          <label className="cf-label">Fahrzeug *</label>
          <select className="cf-select" value={v?.id ?? ''} onChange={(e) => onChange(e.target.value)}>
            {vs.map((x) => <option key={x.id} value={x.id}>{fahrzeugLabel(x)}</option>)}
          </select>
        </div>
      )}
      {v && fahrzeugChips(v).length > 0 && <div className="df-span2"><VehicleChips chips={fahrzeugChips(v)} /></div>}
      {!vs.length && <div className="df-span2 df-hint" style={{ textAlign: 'left' }}>Kein Fahrzeug erfasst – in der Kundenakte unter „Fahrzeuge“ hinzufügen.</div>}
      {offen.length > 0 && (
        <div className={`df-span2 df-service-hint ${rot ? 'red' : 'orange'}`}>
          {rot ? 'Wartung fällig' : 'Wartung bald fällig'}: {offen.map((x) => x.item.name).join(', ')}
        </div>
      )}
    </>
  );
}

export function SummaryRow({ label, sub, value, total }: { label: ReactNode; sub?: string | null; value: ReactNode; total?: boolean }) {
  return (
    <div className={`df-sum-row${total ? ' total' : ''}`}>
      <span>{label}{sub && <span className="df-sum-sub">{sub}</span>}</span>
      <span className="df-sum-val">{value}</span>
    </div>
  );
}

/** Clickable shop link of a material position ("autodoc.ch ↗"). Internal
    reference, so it's excluded from print. Renders nothing for an empty or
    unusable URL. */
export function PartLink({ url }: { url?: string }) {
  const link = parsePartLink(url);
  if (!link) return null;
  return (
    <a className="df-link no-print" href={link.href} target="_blank" rel="noopener noreferrer" title={link.href}>
      {link.host} ↗
    </a>
  );
}

/** Read-only ZE / Menge × Stückpreis of a position in a detail view (view mode).
    Takes the place of the inline inputs until "Bearbeiten" is tapped, so a quantity
    or price can't be changed by accident while reviewing a document. */
export function PosWerte({ pos }: { pos: ArbeitPosition | MaterialPosition }) {
  if (pos.typ === 'arbeit') {
    return (
      <div className="pos-line-inputs pos-static">
        <span className="pos-chip">{pos.ze || '—'} ZE</span>
      </div>
    );
  }
  const preis = parseFloat(pos.stueckpreis);
  return (
    <div className="pos-line-inputs pos-static">
      <span className="pos-chip">{pos.menge || '1'} ×</span>
      <span className="pos-chip">CHF {isNaN(preis) ? '—' : preis.toFixed(2)}</span>
      {parseFloat(pos.ze ?? '') > 0 && <span className="pos-chip">+ {pos.ze} ZE</span>}
    </div>
  );
}

/** Sticks to the bottom of the sheet's scroll area, so the running total, the
    save status and the actions stay reachable however long the position list gets. */
export function FormBar({ label, value, status, children }: { label: string; value: string; status?: ReactNode; children: ReactNode }) {
  return (
    <div className="df-bar">
      <div className="df-bar-total">
        <span className="df-bar-lbl">{label}</span>
        <span className="df-bar-val">{value}</span>
        {status}
      </div>
      <div className="df-bar-actions">{children}</div>
    </div>
  );
}

/** Auto-save state next to the form actions. `hinweis` explains why nothing is
    saved yet (e.g. no customer chosen) and `action` offers a way out of it. */
export function SaveStatus({ status, onRetry, hinweis, action }: {
  status: AutoSaveStatus;
  onRetry: () => void;
  hinweis?: string | null;
  action?: { label: string; onClick: () => void };
}) {
  if (status === 'error') {
    return (
      <span className="df-save df-save-error" role="status">
        <span aria-hidden>⚠︎</span> Fehler beim Speichern
        <button type="button" className="df-save-btn" onClick={onRetry}>Erneut versuchen</button>
      </span>
    );
  }
  if (status === 'saving' || status === 'pending') {
    return <span className="df-save" role="status"><Spinner size={12} /> Speichert…</span>;
  }
  if (hinweis) {
    return (
      <span className="df-save df-save-hint" role="status">
        {hinweis}
        {action && <button type="button" className="df-save-btn" onClick={action.onClick}>{action.label}</button>}
      </span>
    );
  }
  if (status === 'saved') {
    return <span className="df-save df-save-ok" role="status"><SFCheckmark /> Alle Änderungen gespeichert</span>;
  }
  return <span className="df-save" role="status">Änderungen werden automatisch gespeichert</span>;
}

/** Enter in a row jumps to the next row's description, or appends a new row
    when it's the last one. */
export function onEnterNextRow(e: KeyboardEvent<HTMLElement>, isLast: boolean, addRow: () => void) {
  if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();
  if (isLast) { addRow(); return; }
  const next = e.currentTarget.nextElementSibling?.querySelector<HTMLInputElement>('[data-df-desc]');
  next?.focus();
}

/** Moves the item at `from` to index `to` (the item ends up where `to` was).
    Only the order changes; the items themselves are passed through untouched. */
export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type MoveGroup = 'material' | 'arbeit' | 'pauschale';
interface DragState { group: MoveGroup; from: number; over: number }

interface PositionenEditorProps {
  arbeit: ArbeitRow[];
  material: MaterialRow[];
  onArbeitChange: (i: number, key: string, value: string) => void;
  onArbeitAdd: () => void;
  onArbeitRemove: (i: number) => void;
  onKiZE: (i: number) => void;
  onMaterialChange: (i: number, key: string, value: string) => void;
  onMaterialAdd: () => void;
  onMaterialRemove: (i: number) => void;
  /** Inserts a ready-made fixed-price row (Versandkosten, Pauschale). */
  onMaterialInsert: (row: MaterialRow) => void;
  /** Reorders rows: moves the row at `from` to `to` (indices of the arbeit / material arrays). */
  onArbeitMove: (from: number, to: number) => void;
  onMaterialMove: (from: number, to: number) => void;
  /** Materialofferte: material prices only, no ZE on the parts. */
  ohneZe?: boolean;
  /** Offerte from the Wartungsplan: its items; each line can be assigned to
      one (key `wartung`, set via onArbeitChange / onMaterialChange). */
  wartung?: { key: string; name: string }[];
}

const sum = (rows: { preis: string }[]) => rows.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);
const zeSumme = (rows: { ze: string }[]) => rows.reduce((s, p) => s + (parseFloat(p.ze) || 0), 0);

export function PositionenEditor({
  arbeit, material,
  onArbeitChange, onArbeitAdd, onArbeitRemove, onKiZE,
  onMaterialChange, onMaterialAdd, onMaterialRemove, onMaterialInsert, ohneZe,
  onArbeitMove, onMaterialMove, wartung,
}: PositionenEditorProps) {
  const { pauschalen } = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  // Set right before a row is appended; once it has rendered, its description
  // input takes focus so the user can keep typing without reaching for it.
  const pendingFocus = useRef<'arbeit' | 'material' | 'pauschale' | null>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const inputs = rootRef.current?.querySelectorAll<HTMLInputElement>(`[data-df-desc="${pendingFocus.current}"]`);
    inputs?.[inputs.length - 1]?.focus();
    pendingFocus.current = null;
  }, [arbeit.length, material.length]);

  // Rows can be added or removed while a link is still resolving, so the
  // result is matched against the latest rows rather than the original index.
  const materialRef = useRef(material);
  materialRef.current = material;
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  /** A shop link in a material description is resolved in place: the row is
      named from the URL right away and then gets the product title, the EK
      (and with it the VK = EK + Marge) and the article number via
      /api/import-part. A VK already typed in is kept. Text entered next to
      the link stays as the description. Returns false for ordinary text. */
  function resolveMaterialLink(i: number, text: string): boolean {
    if (materialRef.current[i]?.art) return false;
    const link = findPartLink(text);
    if (!link) return false;

    const prev = materialRef.current[i];
    const placeholder = partNameFromUrl(link.href) ?? `Teil von ${link.host}`;
    onMaterialChange(i, 'beschreibung', link.rest || placeholder);
    onMaterialChange(i, 'link', link.href);
    // A price that still is the previous link's untouched VK belongs to that part.
    const prevEk = parseFloat(prev.ek ?? '');
    if (prev.link !== link.href && prevEk > 0 && prev.stueckpreis === vkAusEk(prevEk, margeVon(prev))) onMaterialChange(i, 'stueckpreis', '');

    setResolving((s) => new Set(s).add(link.href));
    (async () => {
      try {
        const r = await fetch('/api/import-part', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link.href }),
        });
        const data: { title?: string; ek?: string; ekHinweis?: string; preisWarnung?: string; artikelnummer?: string } = await r.json();
        const row = materialRef.current.findIndex((m) => m.link === link.href);
        if (row < 0) return;
        const pos = materialRef.current[row];
        if (data.title && pos.beschreibung === placeholder) onMaterialChange(row, 'beschreibung', parsePartTitle(data.title).name);
        // Setting the EK recalculates the VK; a VK typed in by hand is put back
        // afterwards, which turns it into the row's Marge instead.
        onMaterialChange(row, 'ek', data.ek ?? '');
        // EK is CHF; a foreign shop price was converted (note kept) or, without
        // a known currency / rate, left empty for the user to fill in.
        if (data.ekHinweis) onMaterialChange(row, 'ekHinweis', data.ekHinweis);
        if (data.preisWarnung) showToast(data.preisWarnung, 'error', 7000);
        if (parseFloat(pos.stueckpreis) > 0) onMaterialChange(row, 'stueckpreis', pos.stueckpreis);
        onMaterialChange(row, 'artikelnummer', data.artikelnummer ?? '');
      } catch (err) {
        // Shop unreachable / blocked: the row silently keeps the name read from the URL.
        console.warn('[DocForm] could not resolve link:', err);
      } finally {
        setResolving((s) => { const n = new Set(s); n.delete(link.href); return n; });
      }
    })();
    return true;
  }

  function onMaterialPaste(e: ClipboardEvent<HTMLInputElement>, i: number) {
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const text = el.value.slice(0, start) + e.clipboardData.getData('text') + el.value.slice(el.selectionEnd ?? start);
    if (resolveMaterialLink(i, text)) e.preventDefault();
  }

  function onMaterialDescChange(i: number, value: string) {
    onMaterialChange(i, 'beschreibung', value);
    // An emptied row starts over, so the next part doesn't inherit this one's link.
    if (!value.trim() && materialRef.current[i]?.link) {
      onMaterialChange(i, 'link', '');
      onMaterialChange(i, 'ek', '');
      onMaterialChange(i, 'marge', '');
      onMaterialChange(i, 'artikelnummer', '');
    }
  }

  const addArbeit   = () => { pendingFocus.current = 'arbeit';   onArbeitAdd(); };
  const addMaterial = () => { pendingFocus.current = 'material'; onMaterialAdd(); };
  const insertMaterial = (row: MaterialRow) => { pendingFocus.current = row.art === 'pauschale' ? 'pauschale' : 'material'; onMaterialInsert(row); };

  // Pauschalen are stored with the material rows (fixed price, see
  // sonderpositionen) but are services: they are edited under Arbeit.
  const teile = material.filter((p) => p.art !== 'pauschale');
  const letzteTeilZeile = material.reduce((last, p, i) => (p.art === 'pauschale' ? last : i), -1);
  const pauschalZeilen = material.map((pos, i) => ({ pos, i })).filter(({ pos }) => pos.art === 'pauschale');

  /* -- Reordering: up / down buttons, or drag the grip handle (pointer events, so
     it works with mouse and touch alike). Each group is reordered on its own; the
     row data is moved as is, no value is touched. -- */
  const reihenfolge: Record<MoveGroup, number[]> = {
    material: material.flatMap((p, i) => (p.art === 'pauschale' ? [] : [i])),
    arbeit: arbeit.map((_, i) => i),
    pauschale: pauschalZeilen.map(({ i }) => i),
  };
  // A KI estimate writes its result back by row index, so Arbeit stays put meanwhile.
  const arbeitBusy = arbeit.some((p) => p.zeLoading);
  const moveFn = (g: MoveGroup) => (g === 'arbeit' ? onArbeitMove : onMaterialMove);
  const [drag, setDrag] = useState<DragState | null>(null);
  // After an up / down move the focus follows the row to its new place.
  const pendingMoveFocus = useRef<{ group: MoveGroup; idx: number; dir: 'up' | 'down' } | null>(null);
  useEffect(() => {
    const f = pendingMoveFocus.current;
    if (!f) return;
    pendingMoveFocus.current = null;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-df-row="${f.group}"][data-df-idx="${f.idx}"]`);
    const btn = row?.querySelector<HTMLButtonElement>(`.df-move-${f.dir}`);
    (btn && !btn.disabled ? btn : row?.querySelector<HTMLButtonElement>('.df-move-btn:not(:disabled)'))?.focus();
  });

  function moveBy(group: MoveGroup, idx: number, dir: -1 | 1) {
    const order = reihenfolge[group];
    const target = order[order.indexOf(idx) + dir];
    if (target === undefined) return;
    pendingMoveFocus.current = { group, idx: target, dir: dir < 0 ? 'up' : 'down' };
    moveFn(group)(idx, target);
  }

  /** Row index under the pointer within the dragged group (clamped to first / last row). */
  function rowAt(group: MoveGroup, y: number): number | null {
    const rows = rootRef.current?.querySelectorAll<HTMLElement>(`[data-df-row="${group}"]`);
    if (!rows?.length) return null;
    for (const r of rows) {
      if (y < r.getBoundingClientRect().bottom) return Number(r.dataset.dfIdx);
    }
    return Number(rows[rows.length - 1].dataset.dfIdx);
  }

  function onGripDown(e: PointerEvent<HTMLElement>, group: MoveGroup, idx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ group, from: idx, over: idx });
  }
  function onGripMove(e: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const over = rowAt(drag.group, e.clientY);
    if (over != null && over !== drag.over) setDrag({ ...drag, over });
  }
  function onGripUp() {
    if (drag && drag.over !== drag.from) moveFn(drag.group)(drag.from, drag.over);
    setDrag(null);
  }

  /** Data attributes + drag highlight class for a reorderable row. */
  function rowProps(group: MoveGroup, idx: number) {
    let cls = '';
    if (drag?.group === group) {
      const order = reihenfolge[group];
      if (drag.from === idx) cls = ' df-dragging';
      else if (drag.over === idx) cls = order.indexOf(drag.over) > order.indexOf(drag.from) ? ' df-drop-after' : ' df-drop-before';
    }
    return { data: { 'data-df-row': group, 'data-df-idx': idx }, cls };
  }

  /** Up / grip / down controls of a row (plain render function, not a component,
      so the grip keeps its pointer capture across re-renders while dragging). */
  function moveCell(group: MoveGroup, idx: number, disabled = false) {
    const order = reihenfolge[group];
    if (order.length < 2) return <span className="df-c-move" />;
    const pos = order.indexOf(idx);
    return (
      <div className="df-c-move">
        <button
          type="button" className="df-move-btn df-move-up" onClick={() => moveBy(group, idx, -1)}
          disabled={disabled || pos === 0} aria-label="Position nach oben verschieben" title="Nach oben"
        ><SFChevronUp /></button>
        <span
          className={`df-grip${disabled ? ' disabled' : ''}`} title="Ziehen zum Verschieben" aria-hidden="true"
          onPointerDown={disabled ? undefined : (e) => onGripDown(e, group, idx)}
          onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={() => setDrag(null)}
        ><SFGrip /></span>
        <button
          type="button" className="df-move-btn df-move-down" onClick={() => moveBy(group, idx, 1)}
          disabled={disabled || pos === order.length - 1} aria-label="Position nach unten verschieben" title="Nach unten"
        ><SFChevronUp down /></button>
      </div>
    );
  }

  /** Wartungsplan item of a line (plain render function like moveCell). */
  function wartungCell(value: string | undefined, onChange: (v: string) => void) {
    if (!wartung?.length) return null;
    const name = wartung.find((w) => w.key === value)?.name;
    return (
      <select
        className={`df-tag df-wartung${value ? '' : ' df-wartung-leer'}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        aria-label="Wartungsposition" title={name ? `Gehört zu ${name}: wird für die nächste Offerte aus dem Wartungsplan gespeichert` : 'Keiner Wartungsposition zugeordnet: wird nicht gespeichert'}
      >
        <option value="">Ohne Zuordnung</option>
        {wartung.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
      </select>
    );
  }

  return (
    <div ref={rootRef}>
      <div className="df-group-hdr">
        <span className="df-dot" style={{ background: 'var(--green)' }} />
        Material
        <span className="df-group-sum">{fCHF(sum(teile))}</span>
      </div>
      <div className="df-cols df-material">
        <span className="df-c-move" /><span className="df-c-desc">Beschreibung</span><span className="r">Menge</span><span className="r" title="Einkaufspreis pro Stück (intern)">EK CHF</span><span className="r" title="Aufschlag auf den EK (intern)">Marge %</span><span className="r" title="Verkaufspreis pro Stück – erscheint auf dem PDF">VK CHF</span><span className="r" title="Arbeitszeit zum Material: 100 ZE = 60 Min.">ZE</span><span className="r">Total</span><span />
      </div>
      {material.map((pos, i) => {
        if (pos.art === 'pauschale') return null;
        const busy = !!pos.link && resolving.has(pos.link);
        // Versandkosten: fixed price, no EK / Marge / ZE.
        const fest = !!pos.art;
        const festTitel = 'Versandkosten: Betrag wird 1:1 weiterverrechnet, ohne Marge';
        const row = rowProps('material', i);
        return (
        <Fragment key={i}>
        <div {...row.data} className={`df-line df-material${fest ? ' df-fest' : ''}${row.cls}`} onKeyDown={(e) => onEnterNextRow(e, i === letzteTeilZeile, addMaterial)}>
          {moveCell('material', i)}
          <div className="df-c-desc df-desc" aria-busy={busy}>
            {fest && <span className={`df-tag df-tag-${pos.art}`} title={festTitel}>{positionsArt(pos)}</span>}
            <input
              className="df-inp" data-df-desc="material"
              value={pos.beschreibung} onChange={(e) => onMaterialDescChange(i, e.target.value)}
              onPaste={(e) => onMaterialPaste(e, i)}
              // Full URLs that were typed, dropped or autofilled rather than pasted
              // (Enter moves focus to the next row, so it lands here too).
              onBlur={(e) => resolveMaterialLink(i, e.target.value)}
              placeholder={pos.art === 'versand' ? 'Versandkosten (z.B. Lieferant)' : 'Ersatzteil / Material…'}
              aria-label={`Beschreibung ${positionsArt(pos)}`}
            />
            {busy && <span className="df-desc-busy" role="status" aria-label="Link wird geladen"><Spinner size={12} /></span>}
            {wartungCell(pos.wartung, (v) => onMaterialChange(i, 'wartung', v))}
          </div>
          <label className="df-cell df-c-qty">
            <span className="df-cell-lbl">Menge</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={1}
              value={pos.menge} onChange={(e) => onMaterialChange(i, 'menge', e.target.value)} aria-label="Menge"
            />
          </label>
          <label className="df-cell df-c-ek">
            <span className="df-cell-lbl">EK CHF</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={0}
              value={fest ? '' : pos.ek ?? ''} onChange={(e) => onMaterialChange(i, 'ek', e.target.value)}
              placeholder="—" aria-label="Einkaufspreis pro Stück (intern)"
              disabled={fest} title={fest ? festTitel : undefined}
            />
          </label>
          <label className="df-cell df-c-marge">
            <span className="df-cell-lbl">Marge %</span>
            <input
              className="df-inp num" type="number" inputMode="decimal"
              value={fest ? '' : pos.marge ?? ''} onChange={(e) => onMaterialChange(i, 'marge', e.target.value)}
              placeholder={fest ? '0' : String(getMargin())} disabled={fest || !(parseFloat(pos.ek ?? '') > 0)}
              title={fest ? festTitel : parseFloat(pos.ek ?? '') > 0 ? 'Aufschlag auf den EK, ergibt den VK' : 'Zuerst EK eingeben'}
              aria-label="Marge in Prozent (intern)"
            />
          </label>
          <label className="df-cell df-c-price">
            <span className="df-cell-lbl">{pos.art === 'versand' ? 'Betrag CHF' : 'VK CHF'}</span>
            <input
              className="df-inp num" type="number" inputMode="decimal"
              value={pos.stueckpreis} onChange={(e) => onMaterialChange(i, 'stueckpreis', e.target.value)}
              placeholder="0.00" aria-label={pos.art === 'versand' ? 'Versandkosten netto (ohne Marge)' : 'Verkaufspreis pro Stück'}
              title={fest ? festTitel : undefined}
            />
          </label>
          <label className="df-cell df-c-ze">
            <span className="df-cell-lbl">ZE</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={0}
              value={pos.ze ?? ''} onChange={(e) => onMaterialChange(i, 'ze', e.target.value)}
              placeholder="—" aria-label="Zeiteinheiten zum Material (100 ZE = 60 Min.)"
              disabled={ohneZe || fest} title={fest ? festTitel : ohneZe ? 'Materialofferte: nur Materialpreise, keine ZE' : undefined}
            />
          </label>
          <span className="df-total df-c-total">{pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}</span>
          {/* Every part can be removed, the last one too: the list may be empty ("+ Material" adds one). */}
          <button type="button" className="mf-pos-del df-c-del" onClick={() => onMaterialRemove(i)} aria-label="Position entfernen"><SFXmark /></button>
        </div>
        {!fest && parseFloat(pos.ze ?? '') > 0 && (
          <div className="df-ze-hint">
            Einbauzeit {zeText(parseFloat(pos.ze!), materialSatz(pos))} – zählt zu Arbeit Total
          </div>
        )}
        </Fragment>
        );
      })}
      <div className="df-add-row">
        <button type="button" className="mf-add-pos green" onClick={addMaterial}><SFPlus size={12} /> Material</button>
        <button type="button" className="mf-add-pos orange" onClick={() => insertMaterial(neueVersandPosition())} title="Versandkosten werden 1:1 ohne Marge verrechnet">
          <SFPlus size={12} /> Versandkosten
        </button>
      </div>

      <div className="df-group-hdr">
        <span className="df-dot" style={{ background: 'var(--blue)' }} />
        Arbeit
        <span className="df-group-sum">{zeSumme(arbeit)} ZE</span>
      </div>
      <div className="df-cols df-arbeit">
        <span className="df-c-move" /><span className="df-c-desc">Beschreibung</span><span className="r">ZE</span><span /><span className="r">Min.</span><span className="r">Preis</span><span />
      </div>
      {arbeit.map((pos, i) => { const row = rowProps('arbeit', i); return (
        <div key={i} {...row.data} className={`df-line df-arbeit${row.cls}`} onKeyDown={(e) => onEnterNextRow(e, i === arbeit.length - 1, addArbeit)}>
          {moveCell('arbeit', i, arbeitBusy)}
          <div className="df-c-desc df-desc">
            <input
              className="df-inp" data-df-desc="arbeit"
              value={pos.beschreibung} onChange={(e) => onArbeitChange(i, 'beschreibung', e.target.value)}
              placeholder="Arbeitsschritt…" aria-label="Beschreibung Arbeit"
            />
            {wartungCell(pos.wartung, (v) => onArbeitChange(i, 'wartung', v))}
          </div>
          <label className="df-cell df-c-ze">
            <span className="df-cell-lbl">ZE</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={0}
              style={{ color: pos.zeKI ? 'var(--teal)' : undefined, fontWeight: pos.zeKI ? 700 : undefined }}
              value={pos.ze} onChange={(e) => onArbeitChange(i, 'ze', e.target.value)}
              placeholder="—" title={pos.zeHint || undefined} aria-label="Zeiteinheiten"
            />
          </label>
          <button
            type="button" className={`mf-pos-ki df-c-ki${pos.zeKI ? ' ki-active' : ''}`}
            onClick={() => onKiZE(i)} disabled={pos.zeLoading || !pos.beschreibung.trim()}
            title="KI-Schätzung anfordern" aria-label="KI-Schätzung anfordern"
          >
            {pos.zeLoading ? <Spinner size={10} /> : '✦'}
          </button>
          <span className="df-cell df-c-rate df-ze-min" title="100 ZE = 60 Min.">{parseFloat(pos.ze) > 0 ? `${Math.round(zeMinuten(parseFloat(pos.ze)))} Min.` : ''}</span>
          {/* Arbeit has no own price: its ZE count towards Arbeit Total. */}
          <span className="df-total df-c-total">—</span>
          {/* Every labor row can be removed, the last one too: the list may be empty ("+ Arbeit" adds one). */}
          <button
            type="button" className="mf-pos-del df-c-del" onClick={() => onArbeitRemove(i)}
            disabled={arbeitBusy} aria-label="Arbeit entfernen" title="Arbeit entfernen"
          ><SFXmark /></button>
        </div>
      ); })}
      {pauschalZeilen.map(({ pos, i }) => { const row = rowProps('pauschale', i); return (
        <div key={`p${i}`} {...row.data} className={`df-line df-arbeit df-fest${row.cls}`}>
          {moveCell('pauschale', i)}
          <div className="df-c-desc df-desc">
            <span className="df-tag df-tag-pauschale" title="Pauschale: Festpreis, ohne Stundensatz, ZE und Marge">Pauschale</span>
            <input
              className="df-inp" data-df-desc="pauschale"
              value={pos.beschreibung} onChange={(e) => onMaterialChange(i, 'beschreibung', e.target.value)}
              placeholder="Pauschale…" aria-label="Beschreibung Pauschale"
            />
            {wartungCell(pos.wartung, (v) => onMaterialChange(i, 'wartung', v))}
          </div>
          <span className="df-cell df-c-ze df-ze-min" title="Festpreis: keine ZE">—</span>
          <span className="df-c-ki" />
          <label className="df-cell df-c-rate">
            <span className="df-cell-lbl">Festpreis CHF</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={0}
              value={pos.stueckpreis} onChange={(e) => onMaterialChange(i, 'stueckpreis', e.target.value)}
              placeholder="0.00" aria-label="Festpreis der Pauschale in CHF"
              title="Festpreis – ohne Stundensatz und Marge"
            />
          </label>
          <span className="df-total df-c-total">{pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}</span>
          <button type="button" className="mf-pos-del df-c-del" onClick={() => onMaterialRemove(i)} aria-label="Pauschale entfernen"><SFXmark /></button>
        </div>
      ); })}
      <div className="df-add-row">
        <button type="button" className="mf-add-pos" onClick={addArbeit}><SFPlus size={12} /> Arbeit</button>
        {pauschalen.length > 0 && (
          <select
            className="mf-add-pos df-pauschale-select" value="" aria-label="Pauschale einfügen"
            title="Festpreis-Paket einfügen (ohne Stundensatz und Marge)"
            onChange={(e) => {
              const b = pauschalen.find((x) => x.id === e.target.value);
              if (b) insertMaterial(pauschalePosition(b));
            }}
          >
            <option value="">＋ Pauschale…</option>
            {pauschalen.map((b) => (
              <option key={b.id} value={b.id}>{b.name || 'Ohne Namen'} – {fCHF(parseFloat(b.preis) || 0)}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
