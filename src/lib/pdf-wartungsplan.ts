import { jsPDF } from 'jspdf';
import { PAGE_TOP, PAGE_BOTTOM, addPageNumbers } from './pdf-paging';
import { buildDocumentFilename, formatDateCH } from './utils';
import { CO_NAME, CO_ADDR, CO_CITY, CO_PHONE } from './company';
import { fahrzeugLabel, formatKm, letzterBeleg, naechsteFaelligkeit, ohneEntfernteService, serviceZustand, type ServiceZustand } from './vehicles';
import { pdfSpeichern } from './drive';
import { quelleVon } from './wartung';
import type { Customer, ServiceItem, Vehicle } from '../types';

const TL = 15, TR = 195;
const COL = { name: TL, intervall: 84, zuletzt: 118, naechste: 152 };
const NAME_W = COL.intervall - COL.name - 3;

const ZUSTAND: Record<ServiceZustand, string> = {
  ueberfaellig: 'Überfällig', bald: 'Bald fällig', unbekannt: 'Fälligkeit unbekannt', faellig: 'In Zukunft', gemacht: 'Erledigt',
};
const RANG: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, unbekannt: 2, faellig: 3, gemacht: 4 };

// de-CH groups with a typographic apostrophe; the standard PDF font wants the plain one.
const km = (v?: string | number) => (v ? `${formatKm(v).replace(/’/g, "'")} km` : '');
const mitTrenner = (a: string, b: string) => [a, b].filter(Boolean).join('\n') || '-';

const intervall = (i: ServiceItem) =>
  mitTrenner(km(i.intervallKm), i.intervallMonate ? `${i.intervallMonate} Monate` : '');

/** Renders the vehicle's Wartungsplan, downloads it and backs it up to Drive. */
export async function exportWartungsplanPDF(vehicle: Vehicle, customer: Customer | undefined): Promise<void> {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = PAGE_TOP + 4;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(CO_NAME, TL, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
    doc.text([CO_ADDR, CO_CITY, CO_PHONE].filter(Boolean).join(' · '), TL, y + 4.5);
    doc.setTextColor(0, 0, 0);
    y += 17;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Wartungsplan', TL, y);
    y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    if (customer) { doc.text(`${customer.vorname} ${customer.nachname}`.trim(), TL, y); y += 4.8; }
    doc.text(fahrzeugLabel(vehicle), TL, y); y += 4.8;
    const stand = [vehicle.chassisnummer && `VIN ${vehicle.chassisnummer}`, vehicle.km && `KM-Stand ${km(vehicle.km)}`, `Stand ${formatDateCH(new Date().toISOString().slice(0, 10))}`];
    doc.setTextColor(100, 100, 100); doc.text(stand.filter(Boolean).join(' · '), TL, y); doc.setTextColor(0, 0, 0);
    y += 8;

    const kopf = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text('Position', COL.name, y); doc.text('Intervall', COL.intervall, y);
      doc.text('Zuletzt', COL.zuletzt, y); doc.text('Nächste', COL.naechste, y);
      y += 1.8; doc.setLineWidth(0.3); doc.line(TL, y, TR, y); y += 4.2;
      doc.setFont('helvetica', 'normal');
    };
    kopf();

    const zeilen = ohneEntfernteService(vehicle.service ?? [])
      .map((item) => ({ item, zustand: serviceZustand(item, vehicle) }))
      .sort((a, b) => RANG[a.zustand] - RANG[b.zustand]);

    // Intervals not checked against the OEM schedule are marked, never passed off as manufacturer values.
    let unsicher = false;
    for (const { item, zustand } of zeilen) {
      const n = naechsteFaelligkeit(item);
      const name = doc.splitTextToSize(item.name, NAME_W) as string[];
      const iv = intervall(item).split('\n');
      const q = quelleVon(item);
      if ((q === 'richtwert' || q === 'standard') && iv[0] !== '-') { iv[0] += ' *'; unsicher = true; }
      const zu = mitTrenner(item.letztesDatum ? formatDateCH(item.letztesDatum) : '', km(item.letzteKm)).split('\n');
      // A last service without a record says so; documented ones name their proof.
      const beleg = letzterBeleg(item);
      if (beleg) zu.push(beleg.kurz);
      const na = mitTrenner(n.datum ? formatDateCH(n.datum) : '', km(n.km ?? undefined)).split('\n');
      const lines = Math.max(name.length + 1, iv.length, zu.length, na.length);
      const h = lines * 3.8 + 2.4;
      if (y + h > PAGE_BOTTOM) { doc.addPage('a4', 'portrait'); y = PAGE_TOP + 4; kopf(); }

      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(name, COL.name, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
      doc.text(ZUSTAND[zustand], COL.name, y + name.length * 3.8);
      doc.setTextColor(0, 0, 0); doc.setFontSize(8.5);
      doc.text(iv, COL.intervall, y); doc.text(zu, COL.zuletzt, y); doc.text(na, COL.naechste, y);
      y += h - 2.4 + 0.2;
      doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.15); doc.line(TL, y, TR, y); doc.setDrawColor(0, 0, 0);
      y += 4;
    }

    if (unsicher) {
      if (y + 6 > PAGE_BOTTOM) { doc.addPage('a4', 'portrait'); y = PAGE_TOP + 4; }
      doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
      doc.text('* Richt- oder Standardwert, nicht mit der Herstellervorgabe geprüft.', TL, y + 1);
      doc.setTextColor(0, 0, 0);
    }

    addPageNumbers(doc, TR);
    const filename = buildDocumentFilename(customer, 'Wartungsplan', vehicle.kennzeichen || fahrzeugLabel(vehicle));
    void pdfSpeichern(doc, filename, 'Wartungsplaene', customer);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
