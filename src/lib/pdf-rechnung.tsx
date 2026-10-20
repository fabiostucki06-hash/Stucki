import { jsPDF } from 'jspdf';
import { PAGE_TOP, PAGE_BOTTOM, addPageNumbers } from './pdf-paging';
import { SwissQRBill } from 'swissqrbill/svg';
import { computeRechnungTotals, rechnungDocName, schlussReferenz, KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from './rechnung-totals';
import { mitMaterialHinweis } from './offerte-docs';
import { formatDateCH, buildDocumentFilename, materialZuerst } from './utils';
import { getIban } from './settings';
import { CO_NAME, CO_ADDR, CO_CITY, CO_PHONE, CO_LOC, CO_ZIP, CO_CITY_NAME, STD_SATZ } from './company';
import { archiveToDrive } from './drive';
import type { ArbeitPosition, Customer, MaterialPosition, Position, Rechnung } from '../types';

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
const LH   = 3.6;  // extra height per wrapped description line
const MAX_LINES = 3;
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

  const anzProzent = rechnung.anzahlungProzent;
  const isSchluss = rechnung.art === 'schluss';
  const { totalMaterial: totM, totalArbeit: totA, zwischensumme: total, gesamttotal, rechnungstotal, restbetrag, abzugAnzahlung, kleinteilApplied } =
    computeRechnungTotals(rechnung.positionen ?? [], rechnung.kategorie, rechnung.kleinteilManuell, anzProzent, parseFloat(rechnung.anzahlungBetrag ?? '') || undefined);

  const rows: (Position | undefined)[] = materialZuerst(rechnung.positionen ?? []);
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
  /** Description lines for a position: wrapped to the column, at most MAX_LINES (last one clipped). */
  const wrap = (t: string, maxW: number): string[] => {
    const lines = doc.splitTextToSize(String(t), maxW) as string[];
    if (lines.length <= MAX_LINES) return lines;
    const kept = lines.slice(0, MAX_LINES);
    kept[MAX_LINES - 1] = clip(lines.slice(MAX_LINES - 1).join(' '), maxW);
    return kept;
  };

  let y = 12;
  const fits = (h: number) => y + h <= PAGE_BOTTOM;
  const newPage = () => { doc.addPage('a4', 'portrait'); y = PAGE_TOP; };

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(15); rgb(0, 0, 0);
  tL(rechnungDocName(rechnung), TL, y + 7);

  norm(); fs(8); rgb(120, 120, 120);
  tL('Rechnungsnummer', TL, y + 13);
  bold(); fs(8.5); rgb(0, 0, 0);
  tL(String(rechnung.rechnungNumber ?? ''), TL + 37, y + 13);
  norm();
  if (isSchluss) {
    fs(8); rgb(90, 90, 90);
    tL(schlussReferenz(rechnung), TL, y + 19);
  }

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

  // ── TABLE HEADER (repeated on every page the table continues on) ─────────
  const tableHeader = () => {
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
    norm(); fs(8.5);
  };
  // vertical column dividers spanning header + rows of the current page
  let segTop = y;
  const dividers = (bottom: number) => {
    vLine(x1, segTop, bottom, 0.15);
    vLine(x2, segTop, bottom, 0.15);
    vLine(x3, segTop, bottom, 0.15);
    vLine(x4, segTop, bottom, 0.15);
  };
  tableHeader();

  // ── POSITION ROWS (min 15) ────────────────────────────────────────────────
  // Long descriptions wrap onto further lines instead of being cut off.
  for (const pos of rows) {
    const descLines = pos?.beschreibung ? wrap(pos.beschreibung, wBez - PAD * 2) : [];
    const rowH = RH + Math.max(0, descLines.length - 1) * LH;
    if (!fits(rowH)) {
      if (!pos) break; // only empty filler rows left: end the table here
      dividers(y); newPage(); segTop = y; tableHeader();
    }
    const mp = pos?.typ === 'material' ? (pos as MaterialPosition) : null;
    const ap = pos?.typ === 'arbeit'   ? (pos as ArbeitPosition)   : null;
    const ty = y + RH * BL;

    rgb(0, 0, 0);
    descLines.forEach((line, li) => tL(line, x0 + PAD, ty + li * LH));
    rgb(50, 50, 50);
    if (mp && fN(mp.menge))       tR(String(fN(mp.menge)),          x2 - PAD, ty);
    if (mp && fN(mp.stueckpreis)) tR(fN(mp.stueckpreis).toFixed(2), x3 - PAD, ty);
    if (mp && fN(mp.preis))       tR(fN(mp.preis).toFixed(2),       x4 - PAD, ty);
    // ZE column: Arbeit time, or the time billed with a material position.
    const zeWert = fN(ap?.ze ?? mp?.ze);
    if (zeWert)                   tR(String(zeWert),                TR - PAD, ty);
    rgb(0, 0, 0);

    hLine(y + rowH, TL, TR, 0.1);
    y += rowH;
  }

  dividers(y);

  // ── SUMME: Material total in Preis(CHF) col, Arbeit total in ZE col ───────
  // Summe, Zwischensumme/Gesamtbetrag, Anzahlung and Restbetrag stay together on one page.
  // Summe, Gesamtbetrag, Abzug and Zu zahlen stay together on one page.
  if (!fits(RH_S + RH_S + RH_T + (anzProzent || isSchluss ? RH_S : 0))) newPage();
  lw(0.4); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  const sumY = y + RH_S * BL;
  norm(); fs(8.5); rgb(100, 100, 100); tL('Summe', x0 + PAD, sumY);
  bold(); rgb(0, 0, 0);
  tR(chf(totM), x4 - PAD, sumY);
  tR(chf(totA), TR - PAD, sumY);
  norm();
  y += RH_S;

  // ── ZWISCHENSUMME / ANZAHLUNG: full amount of all positions (100%) ──────
  lw(0.3); drgb(180, 180, 180); doc.line(TL, y, TR, y); drgb(0, 0, 0);
  const zwY = y + RH_S * BL;
  rgb(100, 100, 100); tL(anzProzent || isSchluss ? 'Gesamtbetrag gemäss Offerte (100%)' : 'Zwischensumme', x0 + PAD, zwY);
  bold(); rgb(0, 0, 0); tR(chf(anzProzent || isSchluss ? gesamttotal : total), TR - PAD, zwY); norm();
  y += RH_S;

  // ── SCHLUSSRECHNUNG: already paid Anzahlung is deducted ──────────────────
  if (isSchluss) {
    lw(0.3); drgb(180, 180, 180); doc.line(TL, y, TR, y); drgb(0, 0, 0);
    const abY = y + RH_S * BL;
    rgb(100, 100, 100);
    tL(`abzüglich Anzahlung${rechnung.anzahlungRechnungNumber != null ? ` (Anzahlungsrechnung #${rechnung.anzahlungRechnungNumber})` : ''}`, x0 + PAD, abY);
    bold(); rgb(0, 0, 0); tR(`- ${chf(abzugAnzahlung)}`, TR - PAD, abY); norm();
    y += RH_S;
  }

  // ── ANZAHLUNG: the remaining share is deducted here and billed later ─────
  if (anzProzent) {
    lw(0.3); drgb(180, 180, 180); doc.line(TL, y, TR, y); drgb(0, 0, 0);
    const abY = y + RH_S * BL;
    rgb(100, 100, 100);
    tL(`Abzug Restbetrag ${100 - anzProzent}% (folgt mit Schlussrechnung)`, x0 + PAD, abY);
    bold(); rgb(0, 0, 0); tR(`- ${chf(restbetrag)}`, TR - PAD, abY); norm();
    y += RH_S;
  }

  // ── RECHNUNGSTOTAL — Swiss-rounded to 5 Rappen ────────────────────────────
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(229, 229, 229); doc.rect(TL, y, TW, RH_T, 'F');
  const totY = y + RH_T * BL;
  bold(); fs(9); rgb(0, 0, 0);
  tL(anzProzent ? `Rechnungsbetrag / Zu zahlen (Anzahlung ${anzProzent}%)` : isSchluss ? 'Restbetrag (zu bezahlen)' : 'Rechnungstotal', x0 + PAD, totY);
  tR(chf(rechnungstotal), TR - PAD, totY);
  y += RH_T;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 6;
  if (!fits(0)) newPage();
  fs(7.5); rgb(130, 130, 130);
  tL(rechnung.art === 'anzahlung'
    ? `* Der verbleibende Restbetrag (${100 - (anzProzent ?? 50)}%) wird mit der Schlussrechnung verrechnet (10 Tage netto)`
    : isSchluss ? `* ${schlussReferenz(rechnung)} – die geleistete Anzahlung ist abgezogen`
    : '* Kleinmaterial-Pauschale wird bei <100 ZE hinzugefügt', TL, y);
  if ((rechnung.positionen ?? []).some((p) => p.typ === 'material' && fN((p as MaterialPosition).ze))) {
    y += 4;
    tL(`* Material mit ZE: Preis = Menge × Stk.Preis + ZE (100 ZE = 60 Min. = CHF ${STD_SATZ})`, TL, y);
  }
  const notizen = rechnung.art === 'anzahlung' ? mitMaterialHinweis(rechnung.notizen) : rechnung.notizen;
  if (notizen) {
    y += 6;
    if (!fits(4)) newPage();
    bold(); fs(8.5); rgb(0, 0, 0); tL('Notizen:', TL, y); norm(); y += 4;
    const lines = doc.splitTextToSize(notizen, TW);
    for (const line of lines as string[]) {
      if (!fits(0)) { newPage(); norm(); fs(8.5); rgb(0, 0, 0); }
      tL(line, TL, y); y += 4;
    }
  }
  rgb(0, 0, 0);

  // ── DATE / LOCATION ───────────────────────────────────────────────────────
  const col2 = TL + VL;
  fs(8.5);
  const payLines: string[] = rechnung.zahlungsbedingung?.trim()
    ? doc.splitTextToSize(rechnung.zahlungsbedingung.trim(), TR - col2)
    : [rechnung.zahlungsFrist ? `${rechnung.zahlungsFrist} Tage netto` : '10 Tage netto'];
  // Date, location and payment terms stay together.
  if (!fits(10 + 5 + 10 + payLines.length * 4.5 + 5)) newPage();
  y += 10;
  rgb(100, 100, 100); tL('Datum', TL, y); bold(); rgb(0, 0, 0); tL(todayCH(), col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Ort',   TL, y); bold(); rgb(0, 0, 0); tL(CO_LOC,   col2, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 10;
  rgb(100, 100, 100); tL('Zahlungskonditionen', TL, y);
  bold(); rgb(0, 0, 0);
  payLines.forEach((l, i) => { if (i > 0) y += 4.5; tL(l, col2, y); });
  norm();
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
      message: `${rechnungDocName(rechnung)} #${rechnung.rechnungNumber}`,
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
    addPageNumbers(doc, TR); // invoice pages only; the QR-Bill page follows unnumbered

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

    const filename = buildDocumentFilename(customer, rechnungDocName(rechnung), rechnung.rechnungNumber ?? '');
    doc.save(`${filename}.pdf`);
    void archiveToDrive(doc, rechnung.art === 'anzahlung' ? 'Anzahlungsrechnungen' : 'Rechnungen', filename);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
