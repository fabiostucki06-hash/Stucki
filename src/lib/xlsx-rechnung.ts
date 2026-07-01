import ExcelJS from 'exceljs';
import { fetchRechnungVorlage } from './supabase';
import type { ArbeitPosition, Customer, MaterialPosition, Rechnung } from '../types';

const TEMPLATE_SHEET = 'Grundformular';
const STD_SATZ = 80;
const FIRST_ROW = 15;
const MAX_ROWS = 15; // rows 15–29 in the template

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

  sheet.getCell('D3').value = rechnung.rechnungNumber;
  sheet.getCell('D6').value = vehicle || undefined;
  sheet.getCell('D8').value = customer?.kennzeichen || undefined;
  sheet.getCell('D10').value = customer?.km || undefined;
  sheet.getCell('D11').value = owner || undefined;
  sheet.getCell('D13').value = STD_SATZ;

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

  sheet.getCell('D40').value = new Date();
  if (rechnung.zahlungsFrist) {
    sheet.getCell('D44').value = `${rechnung.zahlungsFrist} Tage netto`;
  }

  return workbook.xlsx.writeBuffer();
}
