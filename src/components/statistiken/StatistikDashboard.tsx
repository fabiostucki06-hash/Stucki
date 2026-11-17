import { useState } from 'react';
import type { Order, Offerte, Rechnung, Customer } from '../../types';

interface Props {
  orders: Order[];
  offerten: Offerte[];
  rechnungen: Rechnung[];
  customers: Customer[];
}

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const fCHF = (n: number) => "CHF " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

const SERVICE_RULES: [string, RegExp][] = [
  ['Inspektion / Service', /inspektion|service|wartung|pickerl/i],
  ['Ölwechsel',            /öl|ölwechsel|oel\b|oilchange/i],
  ['Reifen / Pneu',        /reifen|pneu|radwechsel/i],
  ['Bremsen',              /bremse|bremsen|bremsbelag|bremssattel|bremscheibe/i],
  ['MFK-Vorbereitung',     /mfk|motorfahrzeug|hauptuntersuchung/i],
  ['Klimaanlage',          /klima/i],
  ['Diagnose',             /diagnose|fehlersuche|fehlercode|obd/i],
  ['Getriebe',             /getriebe/i],
  ['Kupplung',             /kupplung/i],
  ['Batterie / Elektrik',  /batterie|elektrik|anlasser|generator/i],
  ['Zahnriemen',           /zahnriemen|steuerriemen/i],
  ['Karosserie',           /lack|karosserie|delle|unfall|kratzer/i],
];

function categorizeText(text: string): string | null {
  for (const [label, re] of SERVICE_RULES) if (re.test(text)) return label;
  return null;
}

const LockIcon = () => (
  <svg width={14} height={14} viewBox="0 0 18 18" fill="none" style={{ color: 'var(--label3)' }}>
    <rect x={2.5} y={8} width={13} height={9} rx={2} stroke="currentColor" strokeWidth={1.4}/>
    <path d="M5.5 8V5.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/>
    <circle cx={9} cy={12.5} r={1} fill="currentColor"/>
  </svg>
);

export default function StatistikDashboard({ orders, offerten, rechnungen, customers }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear  = viewMonth === 0 ? viewYear - 1 : viewYear;

  const inMonth = (dateStr: string, y: number, m: number) => {
    const d = new Date(dateStr);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  // Reiner Gewinn: nur die Arbeitsposition ("Arbeit") bezahlter Rechnungen zählt, Material wird ignoriert.
  const paidRechnungen = (y: number, m: number) =>
    rechnungen.filter((r) => r.status === 'bezahlt' && inMonth(r.createdAt, y, m));

  const profit = (y: number, m: number) =>
    paidRechnungen(y, m).reduce((s, r) => s + (parseFloat(r.totalArbeit ?? '0') || 0), 0);

  const curTotal  = profit(viewYear, viewMonth);
  const prevTotal = profit(prevYear, prevMonth);
  const curPaidCount = paidRechnungen(viewYear, viewMonth).length;
  const curMaterialExcluded = paidRechnungen(viewYear, viewMonth)
    .reduce((s, r) => s + (parseFloat(r.totalMaterial ?? '0') || 0), 0);

  const delta = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : null;

  const monthOrders      = orders.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const doneOrders       = monthOrders.filter((o) => o.status === 'abgeschlossen' || o.status === 'zahlung_erhalten');
  const newCustomers     = customers.filter((c) => inMonth(c.createdAt, viewYear, viewMonth));
  const monthOfferten    = offerten.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const acceptedOfferten = monthOfferten.filter((o) => o.status === 'angenommen');

  // Build service breakdown from all-time data
  const serviceCounts: Record<string, number> = {};
  for (const o of orders) {
    for (const b of (o.beanstandungen ?? [])) {
      const cat = categorizeText(b);
      if (cat) serviceCounts[cat] = (serviceCounts[cat] ?? 0) + 1;
    }
  }
  for (const off of offerten) {
    for (const pos of (off.positionen ?? [])) {
      const cat = categorizeText(pos.beschreibung);
      if (cat) serviceCounts[cat] = (serviceCounts[cat] ?? 0) + 0.5;
    }
  }
  const serviceEntries = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxCount = serviceEntries[0]?.[1] ?? 1;

  function navMonth(dir: -1 | 1) {
    if (dir === 1 && isCurrentMonth) return;
    let nm = viewMonth + dir;
    let ny = viewYear;
    if (nm < 0)  { nm = 11; ny--; }
    if (nm > 11) { nm = 0;  ny++; }
    setViewMonth(nm); setViewYear(ny);
  }


  const miniLabel = { fontSize: 11.5, fontWeight: 500 as const, color: 'var(--label2)', marginBottom: 6 };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ padding: '16px 16px 0', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <LockIcon />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Chef-Blick</span>
        </div>
        <h1 className="sf-title1">Statistiken</h1>
      </div>

      <div style={{ padding: '12px 16px 0' }}>

        {/* ── Monatsnavigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 8px' }}>
          <button onClick={() => navMonth(-1)} style={{ width: 30, height: 30, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--label2)', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--label)' }}>{MONTHS_DE[viewMonth]} {viewYear}</div>
            {isCurrentMonth && <div style={{ fontSize: 10, color: 'var(--label3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 1 }}>Aktueller Monat</div>}
          </div>
          <button onClick={() => navMonth(1)} disabled={isCurrentMonth} style={{ width: 32, height: 32, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: isCurrentMonth ? 'var(--label4)' : 'var(--label2)', cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {/* ── Reiner Gewinn (nur Arbeit bezahlter Rechnungen, Material ausgeklammert) ── */}
        <p className="section-header" style={{ paddingLeft: 0 }}>Reiner Gewinn</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          {/* Current month */}
          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={miniLabel}>Dieser Monat</div>
            <div style={{ fontSize: 22, fontWeight: 650, color: 'var(--label)', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>{fCHF(curTotal)}</div>
            {delta !== null ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. Vormonat
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--label3)' }}>Kein Vormonat</div>
            )}
          </div>
          {/* Previous month */}
          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={miniLabel}>{MONTHS_DE[prevMonth]}</div>
            <div style={{ fontSize: 22, fontWeight: 650, color: 'var(--label2)', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>{fCHF(prevTotal)}</div>
            <div style={{ fontSize: 12, color: 'var(--label3)' }}>Vormonat</div>
          </div>
        </div>

        {/* Aufschlüsselung: was in den reinen Gewinn eingeflossen ist */}
        <div className="glass-panel" style={{ padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>Bezahlte Rechnungen</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>{curPaidCount}</span>
          </div>
          <div style={{ height: '0.5px', background: 'var(--sep)', marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>Material (nicht Gewinn)</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--label3)', letterSpacing: '-0.3px' }}>{fCHF(curMaterialExcluded)}</span>
          </div>
        </div>

        {/* ── Aktivität ── */}
        <p className="section-header" style={{ paddingLeft: 0 }}>Aktivität</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Aufträge',   value: monthOrders.length },
            { label: 'Erledigt',   value: doneOrders.length },
            { label: 'Neu Kunden', value: newCustomers.length },
            { label: 'Offerten',   value: monthOfferten.length },
            { label: 'Angenommen', value: acceptedOfferten.length },
          ].map((s) => (
            <div key={s.label} className="glass-panel" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--label2)', fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 650, color: 'var(--label)', letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Beliebteste Arbeiten ── */}
        <p className="section-header" style={{ paddingLeft: 0 }}>Beliebteste Arbeiten</p>
        {serviceEntries.length === 0 ? (
          <div className="glass-panel" style={{ padding: 28, textAlign: 'center', color: 'var(--label3)', fontSize: 15, marginBottom: 20 }}>
            Noch keine Daten vorhanden.
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '12px 14px', marginBottom: 16 }}>
            {serviceEntries.map(([label, count], idx) => {
              const pct = Math.round((count / maxCount) * 100);
              const color = idx === 0 ? 'var(--accent)' : 'var(--border-strong)';
              return (
                <div key={label} style={{ marginBottom: idx < serviceEntries.length - 1 ? 14 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--label)', letterSpacing: '-0.2px' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--label2)', flexShrink: 0, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(count)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
