import ExcelJS from 'exceljs';
import { fetchRechnungVorlage } from './supabase';
import type { ArbeitPosition, Customer, MaterialPosition, Rechnung } from '../types';

const TEMPLATE_SHEET = 'Grundformular';
const STD_SATZ = 80;
const FIRST_ROW = 15;
const MAX_ROWS = 15; // rows 15–29 in the template

// Swiss rounding to nearest 0.05 CHF (Rappenrundung)
const roundToRappen = (n: number) => Math.round(n * 20) / 20;

const CHF_FMT = '_ "CHF" * #,##0.00_ ;_ "CHF" * -#,##0.00_ ;_ "CHF" * "-"??_ ;_ @_ ';

export async function buildRechnungWorkbookBuffer(
  rechnung: Rechnung,
  customer: Customer | undefined,
): Promise<ArrayBuffer> {
  const positionen = rechnung.positionen ?? [];
  if (positionen.length > MAX_ROWS) {
    throw new Error(`Zu viele Positionen (${positionen.length}) – Vorlage fasst max. ${MAX_ROWS}.`);
  }

  const templateBuf = await fetchRechnungVorlage();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuf);
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.getWorksheet(TEMPLATE_SHEET);
  if (!sheet) throw new Error(`Sheet "${TEMPLATE_SHEET}" nicht in Vorlage gefunden.`);

  for (const ws of [...workbook.worksheets]) {
    if (ws.name !== TEMPLATE_SHEET) workbook.removeWorksheet(ws.id);
  }

  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const noFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

  // Header
  sheet.getCell('C3').fill = noFill;
  sheet.getCell('D3').value = rechnung.rechnungNumber;
  sheet.getCell('D3').fill = noFill;
  sheet.getCell('D6').value = vehicle || undefined;
  sheet.getCell('D8').value = customer?.kennzeichen || undefined;
  sheet.getCell('D10').value = customer?.km || undefined;
  sheet.getCell('D11').value = owner || undefined;
  sheet.getCell('D13').value = STD_SATZ;

  // Position rows (15–29)
  const matPositionen = positionen.filter((p): p is MaterialPosition => p.typ === 'material');
  const arbPositionen = positionen.filter((p): p is ArbeitPosition => p.typ === 'arbeit');

  positionen.forEach((pos, i) => {
    const row = FIRST_ROW + i;
    sheet.getCell(`C${row}`).value = pos.beschreibung;
    if (pos.typ === 'arbeit') {
      const ap = pos as ArbeitPosition;
      sheet.getCell(`G${row}`).value = parseFloat(ap.ze) || undefined;
    } else {
      const mp = pos as MaterialPosition;
      sheet.getCell(`D${row}`).value = parseFloat(mp.menge) || undefined;
      sheet.getCell(`E${row}`).value = parseFloat(mp.stueckpreis) || undefined;
    }
  });

  // ── Compute totals ──────────────────────────────────────────────────────────
  const totalMaterial = matPositionen.reduce(
    (s, p) => s + (parseFloat(p.menge) || 0) * (parseFloat(p.stueckpreis) || 0),
    0,
  );
  const totalZE = arbPositionen.reduce((s, p) => s + (parseFloat(p.ze) || 0), 0);
  const totalArbeit = (totalZE / 100) * STD_SATZ;
  const zwischensumme = totalMaterial + totalArbeit;
  const rechnungstotal = roundToRappen(zwischensumme);

  // ── Totals rows (original template row numbers, no splice) ──────────────────
  // Row 30: "Summe" — Material total in F (price col) and Arbeit total in G (ZE col)
  sheet.getCell('C30').value = 'Summe';
  const f30 = sheet.getCell('F30');
  f30.value = totalMaterial;
  f30.numFmt = CHF_FMT;
  const g30 = sheet.getCell('G30');
  g30.value = totalArbeit;
  g30.numFmt = CHF_FMT;

  // Row 31: Zwischensumme
  sheet.getCell('C31').value = 'Zwischensumme';
  const g31 = sheet.getCell('G31');
  g31.value = zwischensumme;
  g31.numFmt = CHF_FMT;

  // Row 32: Rechnungstotal (template highlight fill already on this row)
  const g32 = sheet.getCell('G32');
  g32.value = rechnungstotal;
  g32.numFmt = CHF_FMT;

  // Date and payment terms (original cell addresses)
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dateStr = `${dd}.${mm}.${today.getFullYear()}`;
  sheet.getCell('D40').value = dateStr;
  sheet.getCell('D40').fill = noFill;

  if (rechnung.zahlungsFrist) {
    sheet.getCell('D44').value = `${rechnung.zahlungsFrist} Tage netto`;
  }

  return workbook.xlsx.writeBuffer();
}
