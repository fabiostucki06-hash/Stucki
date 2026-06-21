// Uses jsPDF coordinate-based drawing — no @react-pdf/renderer
import { jsPDF } from 'jspdf';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte } from '../types';

// ── Company ───────────────────────────────────────────────────────────────────
const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayCH = () => new Date().toLocaleDateString('de-CH');
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => n === 0 ? 'CHF –' : `CHF ${n.toFixed(2)}`;

// ── Layout (mm, A4 = 210 × 297) ──────────────────────────────────────────────
const PW = 210;
const ML = 14;            // page left/right margin
const BPX = 3;            // box inner horizontal padding
const TL = ML + BPX;     // table left  = 17
const TR = PW - ML - BPX; // table right = 193
const TW = TR - TL;       // table width = 176

// Column widths from Excel wch proportions: C:D:E:F:G = 21.79:17.36:9.64:13.93:12.07 (Σ=74.79)
const P = 74.79;
const wBez = Math.round(TW * 21.79 / P); // 51
const wMen = Math.round(TW * 17.36 / P); // 41
const wStk = Math.round(TW * 9.64  / P); // 23
const wPre = Math.round(TW * 13.93 / P); // 33
const wZE  = TW - wBez - wMen - wStk - wPre; // 28

// Column right-edges (for right-aligned numbers)
const rMen = TL + wBez + wMen;
const rStk = rMen + wStk;
const rPre = rStk + wPre;
const rZE  = TR; // = rPre + wZE

function drawDoc(doc: jsPDF, offerte: Offerte, customer: Customer | undefined) {
  const n   = fN;
  const PAD = 1; // 1mm padding inside columns

  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const date    = todayCH();

  const allPos       = offerte.positionen ?? [];
  const kleinteilPos = allPos.find(
    (p): p is MaterialPosition =>
      p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale',
  );
  const kleinteilAmt = n(kleinteilPos?.preis);
  const filteredPos  = allPos.filter(
    p => !(p.typ === 'material' && (p as MaterialPosition).beschreibung === 'Kleinteil Pauschale'),
  );
  const pureMatTotal = n(offerte.totalMaterial) - kleinteilAmt;
  const totalArb     = n(offerte.totalArbeit);
  const totalBetrag  = n(offerte.totalBetrag);

  // Typography shortcuts
  const norm = () => doc.setFont('helvetica', 'normal');
  const bold = () => doc.setFont('helvetica', 'bold');
  const fs   = (s: number) => doc.setFontSize(s);

  // Line helpers
  const hLine = (y: number, lw = 0.25) => {
    doc.setLineWidth(lw);
    doc.line(ML, y, PW - ML, y);
  };
  const tL = (t: string, x: number, y: number) => doc.text(String(t), x, y);
  const tR = (t: string, x: number, y: number) => doc.text(String(t), x, y, { align: 'right' });

  let y = 14;

  // ── HEADER (outside box) ──────────────────────────────────────────────────
  bold(); fs(14);
  tL('Budget Offerte', ML, y + 5);

  norm(); fs(9);
  tL('Offertennummer', ML, y + 11);
  tL(offerte.offertNumber ?? '', ML + 38, y + 11);

  // Company block (right-aligned)
  tR(CO_NAME,  PW - ML, y + 4);
  tR(CO_ADDR,  PW - ML, y + 8.5);
  tR(CO_CITY,  PW - ML, y + 13);
  tR(CO_PHONE, PW - ML, y + 17.5);

  y += 20;
  const boxTop = y;
  y += 2.5; // box top padding

  // ── VEHICLE BLOCK ─────────────────────────────────────────────────────────
  const vRows: [string, string][] = [
    ['Fahrzeug', vehicle],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen ?? ''],
    ['Chassis-Nr.', ''],
    ['Km Stand', customer?.km ?? ''],
    ['Fahrzeugbesitzer', owner],
  ];
  const RH = 4.5;
  norm(); fs(9);
  for (const [lbl, val] of vRows) {
    tL(lbl, TL + PAD, y + RH * 0.65);
    tL(val, TL + wBez + PAD, y + RH * 0.65);
    y += RH;
  }

  // ── STD.SATZ ROW ──────────────────────────────────────────────────────────
  const RH_S = 6;
  hLine(y);
  norm(); fs(9);
  tL('Std.Satz:', TL + PAD, y + RH_S * 0.62);
  tL('CHF ' + STD_SATZ, TL + wBez + PAD, y + RH_S * 0.62);
  y += RH_S;
  hLine(y);

  // ── TABLE HEADER ──────────────────────────────────────────────────────────
  const RH_H = 6.5;
  const thY = y + RH_H * 0.65;
  bold(); fs(9);
  tL('Bezeichnung',  TL + PAD,      thY);
  tR('Menge',        rMen - PAD,    thY);
  tR('Stk.Preis',    rStk - PAD,    thY);
  tR('Preis (CHF)',  rPre - PAD,    thY);
  tR('ZE',           rZE - PAD,     thY);
  y += RH_H;
  hLine(y);

  // ── POSITION ROWS (min 15 rows) ───────────────────────────────────────────
  const posY0 = y;
  norm(); fs(9);
  for (const p of filteredPos) {
    const mp  = p.typ === 'material' ? (p as MaterialPosition) : null;
    const ap  = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
    const bY  = y + RH * 0.65;

    tL(p.beschreibung, TL + PAD, bY);
    if (mp && n(mp.menge))       tR(String(parseFloat(mp.menge!)), rMen - PAD, bY);
    if (mp && n(mp.stueckpreis)) tR(parseFloat(mp.stueckpreis!).toFixed(2), rStk - PAD, bY);
    if (n(p.preis))              tR(n(p.preis).toFixed(2), rPre - PAD, bY);
    if (ap?.ze)                  tR(String(ap.ze), rZE - PAD, bY);

    doc.setLineWidth(0.1);
    doc.line(ML, y + RH, PW - ML, y + RH);
    y += RH;
  }
  if (y - posY0 < 15 * RH) y = posY0 + 15 * RH;

  // ── SUMME ROW ─────────────────────────────────────────────────────────────
  hLine(y);
  const sumY = y + RH * 0.65;
  norm(); fs(9);
  tL('Summe', TL + PAD, sumY);
  tR(chf(pureMatTotal), rPre - PAD, sumY);
  tR(chf(totalArb),      rZE - PAD,  sumY);
  y += RH;

  // ── SUB-ROW (Kleinteil Pauschale) ─────────────────────────────────────────
  const RH_sub = 4;
  tR(chf(kleinteilAmt), rZE - PAD, y + RH_sub * 0.65);
  y += RH_sub;

  // ── OFFERTENTOTAL ROW ─────────────────────────────────────────────────────
  const RH_T = 6;
  hLine(y);
  const totY = y + RH_T * 0.62;
  bold(); fs(9);
  tL('Offertentotal', TL + PAD, totY);
  tR(chf(totalBetrag), rZE - PAD, totY);
  y += RH_T;
  hLine(y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 5;
  fs(9);
  tL('ZE basieren auf einer reibungslosen Reparatur', TL + PAD, y);
  y += 4.5;
  tL('Kleinmaterial-Pauschale wird bei <100 ZE hinzugefügt', TL + PAD, y);
  if (offerte.notizen) {
    y += 4.5;
    tL(offerte.notizen, TL + PAD, y);
  }

  // ── DATE / LOCATION ───────────────────────────────────────────────────────
  y += 13;
  norm(); fs(9);
  tL('Datum', TL + PAD, y);
  bold(); tL(date,   TL + wBez + PAD, y); norm();
  y += RH;
  tL('Ort', TL + PAD, y);
  bold(); tL(CO_LOC, TL + wBez + PAD, y); norm();

  // ── PAYMENT TERMS ─────────────────────────────────────────────────────────
  y += 11;
  fs(9);
  tL('Zahlungskontitionen bei', TL + PAD, y);
  bold(); tL('10 Tage netto', TL + wBez + PAD, y); norm();
  y += RH;
  tL('Rechnungstellung', TL + PAD, y);

  // ── OUTER BOX ─────────────────────────────────────────────────────────────
  const boxBottom = y + 4;
  doc.setLineWidth(0.3);
  doc.rect(ML, boxTop, PW - 2 * ML, boxBottom - boxTop, 'S');
}

export async function exportOffertePDF(offerte: Offerte, customer: Customer | undefined) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    drawDoc(doc, offerte, customer);
    doc.save(`Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
