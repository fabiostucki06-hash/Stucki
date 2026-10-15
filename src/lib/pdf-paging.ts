import type { jsPDF } from 'jspdf';

// A4 page flow shared by the jsPDF exports: content that doesn't fit above
// PAGE_BOTTOM continues on a new page starting at PAGE_TOP.
export const PAGE_TOP = 15;
export const PAGE_BOTTOM = 297 - 15;

/** "Seite 1 / 2" at the bottom right of each page, only when the document ran
    onto more than one page (single-page exports stay exactly as before). */
export function addPageNumbers(doc: jsPDF, right: number): void {
  const total = doc.getNumberOfPages();
  if (total < 2) return;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(`Seite ${i} / ${total}`, right, 297 - 8, { align: 'right' });
  }
  doc.setPage(total);
  doc.setTextColor(0, 0, 0);
}
