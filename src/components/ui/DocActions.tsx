import { useState, type ReactNode } from 'react';
import Spinner from './Spinner';

/* Compact building blocks for the document detail sheets (Offerte / AB,
   Rechnung, Auftrag), styled by `.ds-*` / `.da-*` in globals.css:
   - DocSummary: one card with status, title, customer, dates, amount and the
     status pills, instead of four stacked blocks.
   - DocActions: one card with the next step as the single prominent button,
     every other follow-up behind "Weitere Schritte", PDF / Drucken as a
     compact two-column row and Duplizieren / Löschen as small buttons. */

export interface DocAction {
  key: string;
  label: string;
  /** Second line, e.g. the amount or how many positions are taken over. */
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Button style; 'primary' = blue gloss, 'green' = green gloss. */
  tone?: 'primary' | 'green' | 'secondary' | 'destructive';
}

const busyLabel = (a: DocAction, text = 'Wird erstellt…') =>
  a.busy ? <><Spinner size={13} />&nbsp; {text}</> : a.label;

export function DocSummary({ statusLabel, statusColor, amount, amountLabel, title, meta, children }: {
  statusLabel: string;
  statusColor: string;
  /** Headline amount on the right ("CHF 1'234.00"). */
  amount?: string;
  amountLabel?: string;
  title?: string;
  /** Customer, dates, version notes …; falsy entries are skipped. */
  meta: (ReactNode | false | null | undefined)[];
  /** Status pills. */
  children?: ReactNode;
}) {
  return (
    <div className="glass-panel ds-card">
      <div className="ds-top">
        <div className="ds-head">
          <span className="ds-status" style={{ color: statusColor }}>
            <span className="ds-dot" style={{ background: statusColor }} />{statusLabel}
          </span>
          {title && <div className="ds-title">{title}</div>}
        </div>
        {amount && (
          <div className="ds-amount">
            {amountLabel && <span className="ds-amount-lbl">{amountLabel}</span>}
            {amount}
          </div>
        )}
      </div>
      {meta.filter(Boolean).map((m, i) => <div key={i} className="ds-meta">{m}</div>)}
      {children && <div className="ds-pills h-scroll" role="group" aria-label="Status ändern">{children}</div>}
    </div>
  );
}

export function DocActions({ primary, more = [], documents, manage = [], hint, moreLabel = 'Weitere Schritte' }: {
  /** The next step; the only large, highlighted button. */
  primary?: DocAction;
  /** Further follow-up documents, collapsed by default. */
  more?: DocAction[];
  /** PDF / Drucken. */
  documents: DocAction[];
  /** Duplizieren / Löschen. */
  manage?: DocAction[];
  hint?: ReactNode;
  moreLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const moreBusy = more.some((a) => a.busy);
  return (
    <div className="glass-panel da-card no-print">
      {(primary || more.length > 0) && (
        <section className="da-section">
          <div className="da-title">Weiterverarbeiten</div>
          {primary && (
            <button
              type="button" onClick={primary.onClick} disabled={primary.disabled || primary.busy}
              className={`btn-system btn-${primary.tone === 'green' ? 'green' : 'primary'} da-primary`}
            >
              <span className="da-primary-lbl">{busyLabel(primary)}</span>
              {primary.sub && !primary.busy && <span className="da-primary-sub">{primary.sub}</span>}
            </button>
          )}
          {more.length > 0 && (
            <>
              <button
                type="button" className="da-more-toggle" aria-expanded={open || moreBusy}
                onClick={() => setOpen((o) => !o)}
              >
                <span>{moreLabel}</span>
                <span className="da-count">{more.length}</span>
                <span className="da-chevron" aria-hidden>›</span>
              </button>
              {(open || moreBusy) && (
                <div className="da-more-list">
                  {more.map((a) => (
                    <button key={a.key} type="button" className={`da-row da-row-${a.tone ?? 'secondary'}`} onClick={a.onClick} disabled={a.disabled || a.busy}>
                      <span className="da-row-text">
                        <span className="da-row-lbl">{busyLabel(a)}</span>
                        {a.sub && !a.busy && <span className="da-row-sub">{a.sub}</span>}
                      </span>
                      <span className="da-chevron" aria-hidden>›</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section className="da-section">
        <div className="da-title">Dokumente</div>
        <div className="da-grid">
          {documents.map((a) => (
            <button
              key={a.key} type="button" onClick={a.onClick} disabled={a.disabled || a.busy}
              className={`btn-system ${a.tone === 'secondary' ? 'btn-secondary' : `btn-${a.tone ?? 'primary'}`} da-btn`}
            >
              {busyLabel(a, 'Bitte warten…')}
            </button>
          ))}
        </div>
        {hint && <div className="da-hint">{hint}</div>}
      </section>

      {manage.length > 0 && (
        <section className="da-section da-manage">
          {manage.map((a) => (
            <button
              key={a.key} type="button" onClick={a.onClick} disabled={a.disabled || a.busy}
              className={`da-small${a.tone === 'destructive' ? ' danger' : ''}`}
            >
              {busyLabel(a, 'Bitte warten…')}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
