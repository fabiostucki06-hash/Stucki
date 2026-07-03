import { createRoot, type Root } from 'react-dom/client';
import type { ArbeitPosition, Customer, MaterialPosition, Position, Rechnung } from '../types';

const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';
const MIN_ROWS = 15;

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => `CHF ${n.toFixed(2)}`;
const dateCH = () => new Date().toLocaleDateString('de-CH');

// Column widths in mm — mirrors the official Rechnung template (Bezeichnung | Menge | Stk.Preis | Preis (CHF) | ZE)
const COLS = '75mm 20mm 30mm 30mm 25mm';

const cellBase: React.CSSProperties = { padding: '1mm 2mm', fontSize: '8.5pt' };
const rightCell: React.CSSProperties = { ...cellBase, textAlign: 'right' };
const zeCell: React.CSSProperties = { ...rightCell, borderLeft: '0.5pt solid #000' };

function PositionRow({ pos, rowH }: { pos?: Position; rowH: string }) {
  const mp = pos?.typ === 'material' ? (pos as MaterialPosition) : null;
  const ap = pos?.typ === 'arbeit' ? (pos as ArbeitPosition) : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COLS, borderBottom: '0.3pt solid #bbb', minHeight: rowH }}>
      <div style={cellBase}>{pos?.beschreibung ?? ''}</div>
      <div style={rightCell}>{mp && fN(mp.menge) ? fN(mp.menge) : ''}</div>
      <div style={rightCell}>{mp && fN(mp.stueckpreis) ? fN(mp.stueckpreis).toFixed(2) : ''}</div>
      <div style={rightCell}>{mp && fN(mp.preis) ? fN(mp.preis).toFixed(2) : ''}</div>
      <div style={zeCell}>{ap?.ze || ''}</div>
    </div>
  );
}

function InvoiceDocument({ rechnung, customer }: { rechnung: Rechnung; customer: Customer | undefined }) {
  const positionen = rechnung.positionen ?? [];
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const totM  = positionen.filter((p) => p.typ === 'material').reduce((s, p) => s + fN(p.preis), 0);
  const totA  = positionen.filter((p) => p.typ === 'arbeit').reduce((s, p) => s + fN(p.preis), 0);
  const total = totM + totA;
  const rechnungstotal = Math.round(total * 20) / 20;

  const rows: (Position | undefined)[] = [...positionen];
  while (rows.length < MIN_ROWS) rows.push(undefined);

  const vRows: [string, string][] = [
    ['Fahrzeug', vehicle || '–'],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen ?? '–'],
    ['Chassis-Nr.', ''],
    ['Km Stand', customer?.km ? `${customer.km} km` : '–'],
    ['Fahrzeugbesitzer', owner || '–'],
  ];

  return (
    <div style={{
      width: '210mm', minHeight: '297mm', padding: '12mm 15mm', boxSizing: 'border-box',
      background: '#fff', color: '#000', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '8.5pt',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6mm' }}>
        <div>
          <div style={{ fontSize: '15pt', fontWeight: 700 }}>Rechnung</div>
          <div style={{ fontSize: '8pt', color: '#777', marginTop: '3mm' }}>
            Rechnungsnummer <span style={{ color: '#000', fontWeight: 700 }}>{rechnung.rechnungNumber}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#5a5a5a', lineHeight: 1.5 }}>
          <div style={{ fontSize: '9pt', fontWeight: 700, color: '#000' }}>{CO_NAME}</div>
          <div>{CO_ADDR}</div>
          <div>{CO_CITY}</div>
          <div>{CO_PHONE}</div>
        </div>
      </div>

      {/* Bordered document box */}
      <div style={{ border: '0.5pt solid #000' }}>
        {/* Vehicle info */}
        {vRows.map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', padding: '1.3mm 2mm', borderBottom: '0.3pt solid #ccc' }}>
            <div style={{ width: '55mm', color: '#666' }}>{lbl}</div>
            <div style={{ fontWeight: 700 }}>{val}</div>
          </div>
        ))}

        {/* Std.Satz */}
        <div style={{ display: 'flex', padding: '1.3mm 2mm', background: '#f7f7f7', borderBottom: '0.4pt solid #000' }}>
          <div style={{ width: '55mm', color: '#666' }}>Std.Satz</div>
          <div style={{ fontWeight: 700 }}>CHF {STD_SATZ}</div>
        </div>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, fontWeight: 700, borderBottom: '0.5pt solid #000' }}>
          <div style={cellBase}>Bezeichnung</div>
          <div style={rightCell}>Menge</div>
          <div style={rightCell}>Stk.Preis</div>
          <div style={rightCell}>Preis (CHF)</div>
          <div style={zeCell}>ZE</div>
        </div>

        {/* Position rows */}
        {rows.map((pos, i) => <PositionRow key={i} pos={pos} rowH="5mm" />)}

        {/* Summe: Material total in Preis(CHF) col, Arbeit total in ZE col */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, borderTop: '0.4pt solid #000' }}>
          <div style={{ ...cellBase, gridColumn: '1 / span 3', color: '#666' }}>Summe</div>
          <div style={rightCell}>{chf(totM)}</div>
          <div style={zeCell}>{chf(totA)}</div>
        </div>

        {/* Zwischensumme */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, borderTop: '0.3pt solid #ccc' }}>
          <div style={{ ...cellBase, gridColumn: '1 / span 3', color: '#666' }}>Zwischensumme</div>
          <div style={rightCell} />
          <div style={zeCell}>{chf(total)}</div>
        </div>

        {/* Rechnungstotal — Swiss-rounded to 5 Rappen */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, borderTop: '0.5pt solid #000', background: '#e5e5e5', fontWeight: 700 }}>
          <div style={{ ...cellBase, gridColumn: '1 / span 3' }}>Rechnungstotal</div>
          <div style={rightCell} />
          <div style={zeCell}>{chf(rechnungstotal)}</div>
        </div>

        {/* Notes */}
        <div style={{ padding: '4mm 2mm 2mm', fontSize: '7.5pt', color: '#777' }}>
          <div>* ZE basieren auf einer reibungslosen Reparatur</div>
          <div>* Kleinmaterial-Pauschale wird bei &lt;100 ZE hinzugefügt</div>
          {rechnung.notizen && (
            <div style={{ marginTop: '3mm', color: '#000' }}>
              <span style={{ fontWeight: 700 }}>Notizen:</span> {rechnung.notizen}
            </div>
          )}
        </div>

        {/* Date / location */}
        <div style={{ padding: '4mm 2mm 0', fontSize: '8.5pt' }}>
          <div style={{ display: 'flex', marginBottom: '1.5mm' }}>
            <div style={{ width: '55mm', color: '#666' }}>Datum</div>
            <div style={{ fontWeight: 700 }}>{dateCH()}</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ width: '55mm', color: '#666' }}>Ort</div>
            <div style={{ fontWeight: 700 }}>{CO_LOC}</div>
          </div>
        </div>

        {/* Payment terms */}
        <div style={{ padding: '4mm 2mm 3mm', fontSize: '8.5pt' }}>
          <div style={{ display: 'flex', marginBottom: '1.5mm' }}>
            <div style={{ width: '55mm', color: '#666' }}>Zahlungskonditionen</div>
            <div style={{ fontWeight: 700 }}>{rechnung.zahlungsFrist ? `${rechnung.zahlungsFrist} Tage netto` : '10 Tage netto'}</div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ width: '55mm', color: '#666' }}>Rechnungstellung</div>
          </div>
        </div>
      </div>
    </div>
  );
}

let printRoot: Root | null = null;
let printContainer: HTMLDivElement | null = null;

function cleanup() {
  if (printRoot) { printRoot.unmount(); printRoot = null; }
  if (printContainer) { printContainer.remove(); printContainer = null; }
}

/** Renders the invoice as print-ready HTML and opens the browser's native print dialog. */
export function printRechnung(rechnung: Rechnung, customer: Customer | undefined) {
  cleanup();
  window.removeEventListener('afterprint', cleanup);

  const container = document.createElement('div');
  container.className = 'invoice-print-root';
  document.body.appendChild(container);
  printContainer = container;
  printRoot = createRoot(container);
  printRoot.render(<InvoiceDocument rechnung={rechnung} customer={customer} />);

  // Wait a couple of frames so layout is committed before the print dialog opens.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));

  window.addEventListener('afterprint', cleanup, { once: true });
}
