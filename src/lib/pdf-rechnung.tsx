// Uses jsPDF coordinate-based drawing — no @react-pdf/renderer
import { jsPDF } from 'jspdf';
import type { ArbeitPosition, Customer, MaterialPosition, Rechnung } from '../types';

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
const ML = 14;
const BPX = 3;
const TL = ML + BPX;      // 17
const TR = PW - ML - BPX; // 193
const TW = TR - TL;       // 176

// Excel Rechnung wch: C:D:E:F:G = 23.17:17.17:10.67:14.17:11.67 (Σ=76.85)
const P = 76.85;
const wBez = Math.round(TW * 23.17 / P); // 53
const wMen = Math.round(TW * 17.17 / P); // 39
const wStk = Math.round(TW * 10.67 / P); // 24
const wPre = Math.round(TW * 14.17 / P); // 32
const wZE  = TW - wBez - wMen - wStk - wPre; // 28

const rMen = TL + wBez + wMen;
const rStk = rMen + wStk;
const rPre = rStk + wPre;
const rZE  = TR;

function drawDoc(doc: jsPDF, rechnung: Rechnung, customer: Customer | undefined) {
  const n   = fN;
  const PAD = 1;

  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const date    = todayCH();

  const allPos       = rechnung.positionen ?? [];
  const kleinteilPos = allPos.find(
    (p): p is MaterialPosition =>
      p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale',
  );
  const kleinteilAmt = n(kleinteilPos?.preis);
  const filteredPos  = allPos.filter(
    p => !(p.typ === 'material' && (p as MaterialPosition).beschreibung === 'Kleinteil Pauschale'),
  );
  const pureMatTotal = n(rechnung.totalMaterial) - kleinteilAmt;
  const totalArb     = n(rechnung.totalArbeit);
  const totalBetrag  = n(rechnung.totalBetrag);

  const faelligCH = rechnung.faelligAm
    ? new Date(rechnung.faelligAm).toLocaleDateString('de-CH')
    : rechnung.zahlungsFrist
      ? (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(rechnung.zahlungsFrist!)); return d.toLocaleDateString('de-CH'); })()
      : '';
  const payTage = rechnung.zahlungsFrist ? `${rechnung.zahlungsFrist} Tage netto` : '10 Tage netto';

  const norm = () => doc.setFont('helvetica', 'normal');
  const bold = () => doc.setFont('helvetica', 'bold');
  const fs   = (s: number) => doc.setFontSize(s);
  const hLine = (y: number, lw = 0.25) => { doc.setLineWidth(lw); doc.line(ML, y, PW - ML, y); };
  const tL = (t: string, x: number, y: number) => doc.text(String(t), x, y);
  const tR = (t: string, x: number, y: number) => doc.text(String(t), x, y, { align: 'right' });

  let y = 14;

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(14);
  tL('Rechnung', ML, y + 5);

  norm(); fs(9);
  tL('Rechnungsnummer', ML, y + 11);
  tL(String(rechnung.rechnungNumber ?? ''), ML + 38, y + 11);

  tR(CO_NAME,  PW - ML, y + 4);
  tR(CO_ADDR,  PW - ML, y + 8.5);
  tR(CO_CITY,  PW - ML, y + 13);
  tR(CO_PHONE, PW - ML, y + 17.5);

  y += 20;
  const boxTop = y;
  y += 2.5;

  // ── VEHICLE BLOCK ─────────────────────────────────────────────────────────
  const RH = 4.5;
  const vRows: [string, string][] = [
    ['Fahrzeug', vehicle],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen ?? ''],
    ['Chassis-Nr.', ''],
    ['Km Stand', customer?.km ?? ''],
    ['Fahrzeugbesitzer', owner],
  ];
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
  tL('Bezeichnung', TL + PAD,   thY);
  tR('Menge',       rMen - PAD, thY);
  tR('Stk.Preis',   rStk - PAD, thY);
  tR('Preis (CHF)', rPre - PAD, thY);
  tR('ZE',          rZE - PAD,  thY);
  y += RH_H;
  hLine(y);

  // ── POSITION ROWS ─────────────────────────────────────────────────────────
  const posY0 = y;
  norm(); fs(9);
  for (const p of filteredPos) {
    const mp = p.typ === 'material' ? (p as MaterialPosition) : null;
    const ap = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
    const bY = y + RH * 0.65;

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

  // ── SUMME ─────────────────────────────────────────────────────────────────
  hLine(y);
  const sumY = y + RH * 0.65;
  norm(); fs(9);
  tL('Summe', TL + PAD, sumY);
  tR(chf(pureMatTotal), rPre - PAD, sumY);
  tR(chf(totalArb),      rZE - PAD,  sumY);
  y += RH;

  // ── SUB-ROW ───────────────────────────────────────────────────────────────
  const RH_sub = 4;
  tR(chf(kleinteilAmt), rZE - PAD, y + RH_sub * 0.65);
  y += RH_sub;

  // ── RECHNUNGSTOTAL ────────────────────────────────────────────────────────
  const RH_T = 6;
  hLine(y);
  const totY = y + RH_T * 0.62;
  bold(); fs(9);
  tL('Rechnungstotal', TL + PAD, totY);
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
  if (rechnung.notizen) { y += 4.5; tL(rechnung.notizen, TL + PAD, y); }

  // ── DATES ─────────────────────────────────────────────────────────────────
  y += 13;
  norm(); fs(9);
  tL('Datum', TL + PAD, y);
  bold(); tL(date, TL + wBez + PAD, y); norm();
  if (faelligCH) {
    y += RH;
    tL('Zahlbar bis', TL + PAD, y);
    bold(); tL(faelligCH, TL + wBez + PAD, y); norm();
  }
  y += RH;
  tL('Ort', TL + PAD, y);
  bold(); tL(CO_LOC, TL + wBez + PAD, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 11;
  fs(9);
  tL('Zahlungskontitionen bei', TL + PAD, y);
  bold(); tL(payTage, TL + wBez + PAD, y); norm();
  y += RH;
  tL('Rechnungstellung', TL + PAD, y);

  // ── BOX ───────────────────────────────────────────────────────────────────
  const boxBottom = y + 4;
  doc.setLineWidth(0.3);
  doc.rect(ML, boxTop, PW - 2 * ML, boxBottom - boxTop, 'S');
}

export async function exportRechnungPDF(rechnung: Rechnung, customer: Customer | undefined) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    drawDoc(doc, rechnung, customer);
    doc.save(`Rechnung_${rechnung.rechnungNumber}_${customer?.nachname ?? 'Kunde'}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
