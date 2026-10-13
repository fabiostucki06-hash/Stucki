import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import Spinner from './Spinner';
import { SFPlus, SFXmark } from '../Icons';
import { findPartLink, parsePartLink } from '../../lib/utils';
import { cleanPartTitle, partNameFromUrl } from '../../lib/partTitle';
import { getMargin } from '../../lib/settings';
import type { ArbeitPosition, MaterialPosition } from '../../types';

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

/** Sticks to the bottom of the sheet's scroll area, so the running total and
    the submit buttons stay reachable however long the position list gets. */
export function FormBar({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="df-bar">
      <div className="df-bar-total">
        <span className="df-bar-lbl">{label}</span>
        <span className="df-bar-val">{value}</span>
      </div>
      <div className="df-bar-actions">{children}</div>
    </div>
  );
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
}

const sum = (rows: { preis: string }[]) => rows.reduce((s, p) => s + (parseFloat(p.preis) || 0), 0);

export function PositionenEditor({
  arbeit, material,
  onArbeitChange, onArbeitAdd, onArbeitRemove, onKiZE,
  onMaterialChange, onMaterialAdd, onMaterialRemove,
}: PositionenEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Set right before a row is appended; once it has rendered, its description
  // input takes focus so the user can keep typing without reaching for it.
  const pendingFocus = useRef<'arbeit' | 'material' | null>(null);

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

  const vkFromEk = (ek: number) => (ek * (1 + getMargin() / 100)).toFixed(2);

  /** A shop link in a material description is resolved in place: the row is
      named from the URL right away and then gets the product title, the VK
      (EK + margin) and EK / article number via /api/import-part. Text entered
      next to the link stays as the description. Returns false for ordinary text. */
  function resolveMaterialLink(i: number, text: string): boolean {
    const link = findPartLink(text);
    if (!link) return false;

    const prev = materialRef.current[i];
    const placeholder = partNameFromUrl(link.href) ?? `Teil von ${link.host}`;
    onMaterialChange(i, 'beschreibung', link.rest || placeholder);
    onMaterialChange(i, 'link', link.href);
    // A price that still is the previous link's untouched VK belongs to that part.
    const prevEk = parseFloat(prev.ek ?? '');
    if (prev.link !== link.href && prevEk > 0 && prev.stueckpreis === vkFromEk(prevEk)) onMaterialChange(i, 'stueckpreis', '');

    setResolving((s) => new Set(s).add(link.href));
    (async () => {
      try {
        const r = await fetch('/api/import-part', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link.href }),
        });
        const data: { title?: string; ek?: string; artikelnummer?: string } = await r.json();
        const row = materialRef.current.findIndex((m) => m.link === link.href);
        if (row < 0) return;
        const pos = materialRef.current[row];
        if (data.title && pos.beschreibung === placeholder) onMaterialChange(row, 'beschreibung', cleanPartTitle(data.title));
        onMaterialChange(row, 'ek', data.ek ?? '');
        onMaterialChange(row, 'artikelnummer', data.artikelnummer ?? '');
        const ek = parseFloat(data.ek ?? '');
        const hasEk = Number.isFinite(ek) && ek > 0;
        if (hasEk && !(parseFloat(pos.stueckpreis) > 0)) onMaterialChange(row, 'stueckpreis', vkFromEk(ek));
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
      onMaterialChange(i, 'artikelnummer', '');
    }
  }

  const addArbeit   = () => { pendingFocus.current = 'arbeit';   onArbeitAdd(); };
  const addMaterial = () => { pendingFocus.current = 'material'; onMaterialAdd(); };

  return (
    <div ref={rootRef}>
      <div className="df-group-hdr">
        <span className="df-dot" style={{ background: 'var(--blue)' }} />
        Arbeit
        <span className="df-group-sum">{fCHF(sum(arbeit))}</span>
      </div>
      <div className="df-cols df-arbeit">
        <span>Beschreibung</span><span className="r">ZE</span><span /><span className="r">CHF/h</span><span className="r">Total</span><span />
      </div>
      {arbeit.map((pos, i) => (
        <div key={i} className="df-line df-arbeit" onKeyDown={(e) => onEnterNextRow(e, i === arbeit.length - 1, addArbeit)}>
          <input
            className="df-inp df-c-desc" data-df-desc="arbeit"
            value={pos.beschreibung} onChange={(e) => onArbeitChange(i, 'beschreibung', e.target.value)}
            placeholder="Arbeitsschritt…" aria-label="Beschreibung Arbeit"
          />
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
          <label className="df-cell df-c-rate">
            <span className="df-cell-lbl">CHF/h</span>
            <input
              className="df-inp num" type="number" inputMode="decimal"
              value={pos.stundenansatz} onChange={(e) => onArbeitChange(i, 'stundenansatz', e.target.value)}
              placeholder="80" aria-label="Stundenansatz"
            />
          </label>
          <span className="df-total df-c-total">{pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}</span>
          {arbeit.length > 1
            ? <button type="button" className="mf-pos-del df-c-del" onClick={() => onArbeitRemove(i)} aria-label="Position entfernen"><SFXmark /></button>
            : <span className="df-c-del" />}
        </div>
      ))}
      <button type="button" className="mf-add-pos" onClick={addArbeit}><SFPlus size={12} /> Arbeit</button>

      <div className="df-group-hdr">
        <span className="df-dot" style={{ background: 'var(--green)' }} />
        Material
        <span className="df-group-sum">{fCHF(sum(material))}</span>
      </div>
      <div className="df-cols df-material">
        <span>Beschreibung</span><span className="r">Menge</span><span className="r">Stk. CHF</span><span className="r">Total</span><span />
      </div>
      {material.map((pos, i) => {
        const busy = !!pos.link && resolving.has(pos.link);
        return (
        <div key={i} className="df-line df-material" onKeyDown={(e) => onEnterNextRow(e, i === material.length - 1, addMaterial)}>
          <div className="df-c-desc df-desc" aria-busy={busy}>
            <input
              className="df-inp" data-df-desc="material"
              value={pos.beschreibung} onChange={(e) => onMaterialDescChange(i, e.target.value)}
              onPaste={(e) => onMaterialPaste(e, i)}
              // Full URLs that were typed, dropped or autofilled rather than pasted
              // (Enter moves focus to the next row, so it lands here too).
              onBlur={(e) => resolveMaterialLink(i, e.target.value)}
              placeholder="Ersatzteil / Material…" aria-label="Beschreibung Material"
            />
            {busy && <span className="df-desc-busy" role="status" aria-label="Link wird geladen"><Spinner size={12} /></span>}
          </div>
          <label className="df-cell df-c-qty">
            <span className="df-cell-lbl">Menge</span>
            <input
              className="df-inp num" type="number" inputMode="decimal" min={1}
              value={pos.menge} onChange={(e) => onMaterialChange(i, 'menge', e.target.value)} aria-label="Menge"
            />
          </label>
          <label className="df-cell df-c-price">
            <span className="df-cell-lbl">Stk. CHF</span>
            <input
              className="df-inp num" type="number" inputMode="decimal"
              value={pos.stueckpreis} onChange={(e) => onMaterialChange(i, 'stueckpreis', e.target.value)}
              placeholder="0.00" aria-label="Stückpreis"
            />
          </label>
          <span className="df-total df-c-total">{pos.preis ? fCHF(parseFloat(pos.preis)) : '—'}</span>
          {material.length > 1
            ? <button type="button" className="mf-pos-del df-c-del" onClick={() => onMaterialRemove(i)} aria-label="Position entfernen"><SFXmark /></button>
            : <span className="df-c-del" />}
        </div>
        );
      })}
      <button type="button" className="mf-add-pos green" onClick={addMaterial}><SFPlus size={12} /> Material</button>
    </div>
  );
}
