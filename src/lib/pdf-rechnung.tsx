import { jsPDF } from 'jspdf';
import { SwissQRBill } from 'swissqrbill/svg';
import { computeRechnungTotals, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from './rechnung-totals';
import { formatDateCH, buildDocumentFilename } from './utils';
import { getIban } from './settings';
import type { ArbeitPosition, Customer, MaterialPosition, Position, Rechnung } from '../types';

const CO_NAME      = 'Fabio Stucki';
const CO_ADDR      = 'Polenstrasse 245';
const CO_CITY      = '5112 Thalheim AG';
const CO_PHONE     = '079 850 18 63';
const CO_LOC       = 'Thalheim AG';
const CO_ZIP       = 5112;
const CO_CITY_NAME = 'Thalheim AG';
const STD_SATZ = '80.00';
const MIN_ROWS = 15;

const todayCH = () => formatDateCH(new Date());
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => `CHF ${n.toFixed(2)}`;

// ── Layout: A4 = 210 × 297 mm ─────────────────────────────────────────────────
const PW = 210;
const PH = 297;
const ML = 15;
const TL = ML, TR = PW - ML, TW = TR - TL; // 15 … 195, width = 180

const RH   = 5;    // data row height mm
const RH_H = 6.5;  // table header row
const RH_S = 6;    // section row (vehicle, std.satz)
const RH_T = 7;    // total row
const PAD  = 2;    // horizontal cell padding
const BL   = 0.68; // text baseline inside row (from top)
const VL   = 55;   // vehicle-info label column width

// Table columns – Bezeichnung | Menge | Stk.Preis | Preis (CHF) | ZE
const wBez = 75, wMen = 20, wStk = 30, wPre = 30; // 25

const x0 = TL;          // 15  – Bezeichnung left
const x1 = x0 + wBez;   // 90  – Menge left   / column divider
const x2 = x1 + wMen;   // 110 – Stk.Preis left
const x3 = x2 + wStk;   // 140 – Preis left
const x4 = x3 + wPre;   // 170 – ZE left
// TR = 195 = x4 + wZE

function drawDoc(doc: jsPDF, rechnung: Rechnung, customer: Customer | undefined) {
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const { totalMaterial: totM, totalArbeit: totA, zwischensumme: total, rechnungstotal, kleinteilApplied } =
    computeRechnungTotals(rechnung.positionen ?? [], rechnung.kategorie, rechnung.kleinteilManuell);

  const rows: (Position | undefined)[] = [...(rechnung.positionen ?? [])];
  if (kleinteilApplied) {
    rows.push({
      typ: 'material',
      beschreibung: KLEINTEIL_LABEL,
      menge: '',
      stueckpreis: '',
      preis: String(KLEINTEIL_BETRAG),
    });
  }
  while (rows.length < MIN_ROWS) rows.push(undefined);

  const norm  = () => doc.setFont('helvetica', 'normal');
  const bold  = () => doc.setFont('helvetica', 'bold');
  const fs    = (s: number) => doc.setFontSize(s);
  const rgb   = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const drgb  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);
  const frgb  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const lw    = (w: number) => doc.setLineWidth(w);

  const hLine = (y: number, xa = TL, xb = TR, w = 0.15) => {
    lw(w); drgb(180, 180, 180); doc.line(xa, y, xb, y); drgb(0, 0, 0);
  };
  const vLine = (x: number, y1: number, y2: number, w = 0.15) => {
    lw(w); drgb(180, 180, 180); doc.line(x, y1, x, y2); drgb(0, 0, 0);
  };
  const tL = (t: string, x: number, y: number) => doc.text(String(t), x, y);
  const tR = (t: string, x: number, y: number) => doc.text(String(t), x, y, { align: 'right' });
  const clip = (t: string, maxW: number): string => {
    const s = String(t);
    if (doc.getTextWidth(s) <= maxW) return s;
    let r = s;
    while (r.length > 1 && doc.getTextWidth(r + '…') > maxW) r = r.slice(0, -1);
    return r + '…';
  };

  let y = 12;

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(15); rgb(0, 0, 0);
  tL('Rechnung', TL, y + 7);

  norm(); fs(8); rgb(120, 120, 120);
  tL('Rechnungsnummer', TL, y + 13);
  bold(); fs(8.5); rgb(0, 0, 0);
  tL(String(rechnung.rechnungNumber ?? ''), TL + 37, y + 13);
  norm();

  bold(); fs(9); rgb(0, 0, 0);
  tR(CO_NAME,  TR, y + 6);
  norm(); fs(7.5); rgb(90, 90, 90);
  tR(CO_ADDR,  TR, y + 11);
  tR(CO_CITY,  TR, y + 16);
  tR(CO_PHONE, TR, y + 21);
  rgb(0, 0, 0);

  y += 26;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);

  // ── VEHICLE INFO ──────────────────────────────────────────────────────────
  const vRows: [string, string][] = [
    ['Fahrzeug',         vehicle || '–'],
    ['1. Inv.-Setzung',  customer?.erstzulassung ? formatDateCH(customer.erstzulassung) : '–'],
    ['Kennzeichen',      customer?.kennzeichen ?? '–'],
    ['Chassis-Nr.',      customer?.chassisnummer ?? '–'],
    ['Km Stand',         customer?.km ? `${customer.km} km` : '–'],
    ['Fahrzeugbesitzer', owner || '–'],
  ];
  norm(); fs(8.5);
  for (const [lbl, val] of vRows) {
    const ty = y + RH_S * BL;
    rgb(100, 100, 100); tL(lbl, TL + PAD, ty);
    rgb(0, 0, 0);       bold(); tL(val, TL + VL, ty); norm();
    hLine(y + RH_S, TL, TR, 0.1);
    y += RH_S;
  }

  // ── STD.SATZ ──────────────────────────────────────────────────────────────
  frgb(247, 247, 247); doc.rect(TL, y, TW, RH_S, 'F');
  const ssY = y + RH_S * BL;
  fs(8.5); rgb(100, 100, 100); tL('Std.Satz', TL + PAD, ssY);
  bold(); rgb(0, 0, 0); tL('CHF ' + STD_SATZ, TL + VL, ssY); norm();
  y += RH_S;
  lw(0.4); drgb(0, 0, 0); doc.line(TL, y, TR, y);

  // ── TABLE HEADER ──────────────────────────────────────────────────────────
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_H, 'F');
  const thY = y + RH_H * BL;
  bold(); fs(8.5); rgb(255, 255, 255);
  tL('Bezeichnung',   x0 + PAD,  thY);
  tR('Menge',         x2 - PAD,  thY);
  tR('Stk.Preis',     x3 - PAD,  thY);
  tR('Preis (CHF)',   x4 - PAD,  thY);
  tR('ZE',            TR - PAD,  thY);
  rgb(0, 0, 0);
  y += RH_H;

  // ── POSITION ROWS (min 15) ────────────────────────────────────────────────
  const posY0 = y;
  norm(); fs(8.5);

  for (const pos of rows) {
    const mp = pos?.typ === 'material' ? (pos as MaterialPosition) : null;
    const ap = pos?.typ === 'arbeit'   ? (pos as ArbeitPosition)   : null;
    const ty = y + RH * BL;

    if (pos?.beschreibung) {
      rgb(0, 0, 0);
      tL(clip(pos.beschreibung, wBez - PAD * 2), x0 + PAD, ty);
    }
    rgb(50, 50, 50);
    if (mp && fN(mp.menge))       tR(String(fN(mp.menge)),          x2 - PAD, ty);
    if (mp && fN(mp.stueckpreis)) tR(fN(mp.stueckpreis).toFixed(2), x3 - PAD, ty);
    if (mp && fN(mp.preis))       tR(fN(mp.preis).toFixed(2),       x4 - PAD, ty);
    if (ap?.ze)                   tR(String(ap.ze),                 TR - PAD, ty);
    rgb(0, 0, 0);

    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }

  // vertical column dividers spanning header + rows
  const tableBottom = y;
  vLine(x1, posY0 - RH_H, tableBottom, 0.15);
  vLine(x2, posY0 - RH_H, tableBottom, 0.15);
  vLine(x3, posY0 - RH_H, tableBottom, 0.15);
  vLine(x4, posY0 - RH_H, tableBottom, 0.15);

  // ── SUMME: Material total in Preis(CHF) col, Arbeit total in ZE col ───────
  lw(0.4); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  const sumY = y + RH_S * BL;
  norm(); fs(8.5); rgb(100, 100, 100); tL('Summe', x0 + PAD, sumY);
  bold(); rgb(0, 0, 0);
  tR(chf(totM), x4 - PAD, sumY);
  tR(chf(totA), TR - PAD, sumY);
  norm();
  y += RH_S;

  // ── ZWISCHENSUMME ─────────────────────────────────────────────────────────
  lw(0.3); drgb(180, 180, 180); doc.line(TL, y, TR, y); drgb(0, 0, 0);
  const zwY = y + RH_S * BL;
  rgb(100, 100, 100); tL('Zwischensumme', x0 + PAD, zwY);
  bold(); rgb(0, 0, 0); tR(chf(total), TR - PAD, zwY); norm();
  y += RH_S;

  // ── RECHNUNGSTOTAL — Swiss-rounded to 5 Rappen ────────────────────────────
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(229, 229, 229); doc.rect(TL, y, TW, RH_T, 'F');
  const totY = y + RH_T * BL;
  bold(); fs(9); rgb(0, 0, 0);
  tL('Rechnungstotal', x0 + PAD, totY);
  tR(chf(rechnungstotal), TR - PAD, totY);
  y += RH_T;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 6;
  fs(7.5); rgb(130, 130, 130);
  tL('* Kleinmaterial-Pauschale wird bei <100 ZE hinzugefügt', TL, y);
  if (rechnung.notizen) {
    y += 6;
    bold(); fs(8.5); rgb(0, 0, 0); tL('Notizen:', TL, y); norm(); y += 4;
    const lines = doc.splitTextToSize(rechnung.notizen, TW);
    for (const line of lines as string[]) { tL(line, TL, y); y += 4; }
  }
  rgb(0, 0, 0);

  // ── DATE / LOCATION ───────────────────────────────────────────────────────
  y += 10;
  const col2 = TL + VL;
  fs(8.5);
  rgb(100, 100, 100); tL('Datum', TL, y); bold(); rgb(0, 0, 0); tL(todayCH(), col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Ort',   TL, y); bold(); rgb(0, 0, 0); tL(CO_LOC,   col2, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 10;
  rgb(100, 100, 100); tL('Zahlungskonditionen', TL, y);
  bold(); rgb(0, 0, 0); tL(rechnung.zahlungsFrist ? `${rechnung.zahlungsFrist} Tage netto` : '10 Tage netto', col2, y); norm();
  y += 5;
  rgb(100, 100, 100); tL('Rechnungstellung', TL, y); norm(); rgb(0, 0, 0);

  return rechnungstotal;
}

/** Rasterizes the official Swiss QR-Bill (payment part + receipt) to a PNG data URL for embedding via jsPDF.addImage. */
async function renderQrBillImage(rechnung: Rechnung, amount: number): Promise<{ dataUrl: string } | { error: string }> {
  const iban = getIban().replace(/\s+/g, '').toUpperCase();
  if (!iban) return { error: 'Bitte IBAN in den Einstellungen hinterlegen' };

  try {
    const svg = new SwissQRBill({
      currency: 'CHF',
      amount,
      message: `Rechnung #${rechnung.rechnungNumber}`,
      creditor: {
        name: CO_NAME,
        address: CO_ADDR,
        zip: CO_ZIP,
        city: CO_CITY_NAME,
        country: 'CH',
        account: iban,
      },
    }, { language: 'DE' });

    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('QR-Bill SVG konnte nicht geladen werden'));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.toString())}`;
    await loaded;

    const PX_PER_MM = (96 / 25.4) * 4; // ~4x oversample for crisp print resolution
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(210 * PX_PER_MM);
    canvas.height = Math.round(105 * PX_PER_MM);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'Canvas-Kontext nicht verfügbar' };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return { dataUrl: canvas.toDataURL('image/png') };
  } catch {
    return { error: 'IBAN ungültig – bitte in den Einstellungen prüfen' };
  }
}

/** Renders the invoice + Swiss QR-Bill as a jsPDF document and saves it as "Vorname Nachname Rechnung_[X].pdf". */
export async function exportRechnungPDF(rechnung: Rechnung, customer: Customer | undefined): Promise<void> {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const rechnungstotal = drawDoc(doc, rechnung, customer);

    // Swiss QR-Bill — own page, full-bleed & bottom-aligned per official layout spec.
    doc.addPage('a4', 'portrait');
    const qr = await renderQrBillImage(rechnung, rechnungstotal);
    if ('dataUrl' in qr) {
      doc.addImage(qr.dataUrl, 'PNG', 0, PH - 105, 210, 105);
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(200, 0, 0);
      doc.text(qr.error, PW / 2, PH - 105 / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }

    doc.save(`${buildDocumentFilename(customer, 'Rechnung', rechnung.rechnungNumber ?? '')}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
