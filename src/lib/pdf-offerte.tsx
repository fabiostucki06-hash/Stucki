import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte } from '../types';

// ── Company constants (match template) ───────────────────────────────────────
const CO_NAME    = 'Fabio Stucki';
const CO_ADDR    = 'Polenstrasse 245';
const CO_CITY    = '5112 Thalheim AG';
const CO_PHONE   = '079 850 18 63';
const CO_LOC     = 'Thalheim AG';
const STD_SATZ   = '80.00';

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayCH = () => new Date().toLocaleDateString('de-CH');
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => n === 0 ? 'CHF –' : `CHF ${n.toFixed(2)}`;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    paddingTop: 35,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },

  // Header outside the box
  hdr: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  hdrLeft: {},
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  numRow: { flexDirection: 'row', marginTop: 3 },
  numLbl: { fontSize: 9, width: 90 },
  numVal: { fontSize: 9 },
  hdrRight: { alignItems: 'flex-end' },
  coLine: { fontSize: 8.5 },

  // Outer border box — all content lives here
  box: {
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: 10,
  },

  // Vehicle info block
  vRow: { flexDirection: 'row', marginBottom: 2 },
  vLbl: { fontSize: 9, width: 100 },
  vVal: { fontSize: 9, flex: 1 },

  // Std.Satz separator row
  stdRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
    marginTop: 8,
  },
  stdLbl: { fontSize: 9, width: 50 },
  stdCHF: { fontSize: 9, width: 30 },
  stdVal: { fontSize: 9 },

  // Table header
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  th: { fontSize: 9 },

  // Table data row
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: '#999',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
    minHeight: 15,
  },
  td: { fontSize: 9 },

  // Column widths
  cBez:   { flex: 1 },
  cMenge: { width: 40, textAlign: 'right' },
  cStkP:  { width: 52, textAlign: 'right' },
  cPreis: { width: 62, textAlign: 'right' },
  cZE:    { width: 52, textAlign: 'right' },

  // Totals block
  sumRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    paddingVertical: 3,
  },
  subRow: { flexDirection: 'row', paddingVertical: 2 },
  grandRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  grandLbl: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  grandVal: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 52, textAlign: 'right' },

  // Notes
  notesWrap: { marginTop: 12 },
  noteLine:  { fontSize: 9, marginBottom: 2 },

  // Date / location (centered pair)
  dateSection: { alignItems: 'center', marginTop: 16 },
  datePair:    { flexDirection: 'row', marginBottom: 3 },
  dateLbl:     { fontSize: 9, width: 72, textAlign: 'right' },
  dateVal:     { fontSize: 9, width: 110, paddingLeft: 8, fontFamily: 'Helvetica-Bold' },

  // Payment terms
  payRow:     { flexDirection: 'row', marginTop: 14 },
  payLblWrap: {},
  payLbl:     { fontSize: 9 },
  paySub:     { fontSize: 9 },
  payVal:     { fontSize: 9, fontFamily: 'Helvetica-Bold', paddingLeft: 10 },
});

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { offerte: Offerte; customer: Customer | undefined }

const OffertePDF: React.FC<Props> = ({ offerte, customer }) => {
  const pos          = offerte.positionen ?? [];
  const vehicle      = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner        = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const totalMat     = fN(offerte.totalMaterial);
  const totalArb     = fN(offerte.totalArbeit);
  const totalBetrag  = fN(offerte.totalBetrag);
  const totalZE      = fN(offerte.totalZE);
  const date         = todayCH();

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <View style={s.hdr}>
          <View style={s.hdrLeft}>
            <Text style={s.docTitle}>Budget Offerte</Text>
            <View style={s.numRow}>
              <Text style={s.numLbl}>Offertennummer</Text>
              <Text style={s.numVal}>{offerte.offertNumber}</Text>
            </View>
          </View>
          <View style={s.hdrRight}>
            <Text style={s.coLine}>{CO_NAME}</Text>
            <Text style={s.coLine}>{CO_ADDR}</Text>
            <Text style={s.coLine}>{CO_CITY}</Text>
            <Text style={s.coLine}>{CO_PHONE}</Text>
          </View>
        </View>

        {/* ── MAIN BORDER BOX ───────────────────────────────────────────── */}
        <View style={s.box}>

          {/* Vehicle block */}
          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeug</Text><Text style={s.vVal}>{vehicle}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>1. Inv.-Setzung</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Kennzeichen</Text><Text style={s.vVal}>{customer?.kennzeichen ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Chassis-Nr.</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Km Stand</Text><Text style={s.vVal}>{customer?.km ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeugbesitzer</Text><Text style={s.vVal}>{owner}</Text></View>

          {/* Std.Satz row */}
          <View style={s.stdRow}>
            <Text style={s.stdLbl}>Std.Satz:</Text>
            <Text style={s.stdCHF}>CHF</Text>
            <Text style={s.stdVal}>{STD_SATZ}</Text>
          </View>

          {/* Table header */}
          <View style={s.tHead}>
            <Text style={[s.th, s.cBez]}>Bezeichnung</Text>
            <Text style={[s.th, s.cMenge]}>Menge</Text>
            <Text style={[s.th, s.cStkP]}>Stk.Preis</Text>
            <Text style={[s.th, s.cPreis]}>Preis (CHF)</Text>
            <Text style={[s.th, s.cZE]}>ZE</Text>
          </View>

          {/* Position rows */}
          {pos.map((p, i) => {
            const mp = p.typ === 'material' ? (p as MaterialPosition) : null;
            const ap = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
            return (
              <View key={i} style={s.tRow}>
                <Text style={[s.td, s.cBez]}>{p.beschreibung}</Text>
                <Text style={[s.td, s.cMenge]}>{mp ? (parseFloat(mp.menge || '0') || '') : ''}</Text>
                <Text style={[s.td, s.cStkP]}>{mp ? (parseFloat(mp.stueckpreis || '0') || '') : ''}</Text>
                <Text style={[s.td, s.cPreis]}>{fN(p.preis) ? fN(p.preis).toFixed(2) : ''}</Text>
                <Text style={[s.td, s.cZE]}>{ap ? (ap.ze || '') : ''}</Text>
              </View>
            );
          })}

          {/* Summe row — Materialkosten in Preis col, Arbeitskosten in ZE col */}
          <View style={s.sumRow}>
            <Text style={[s.td, s.cBez]}>Summe</Text>
            <Text style={[s.td, s.cMenge]}></Text>
            <Text style={[s.td, s.cStkP]}></Text>
            <Text style={[s.td, s.cPreis]}>{chf(totalMat)}</Text>
            <Text style={[s.td, s.cZE]}>{chf(totalArb)}</Text>
          </View>

          {/* Sub-row (ZE × Std.Satz, or Kleinmaterial placeholder) */}
          <View style={s.subRow}>
            <Text style={[s.td, s.cBez]}></Text>
            <Text style={[s.td, s.cMenge]}></Text>
            <Text style={[s.td, s.cStkP]}></Text>
            <Text style={[s.td, s.cPreis]}></Text>
            <Text style={[s.td, s.cZE]}>{totalZE > 0 ? `${totalZE} ZE` : ''}</Text>
          </View>

          {/* Offertentotal row (bold) */}
          <View style={s.grandRow}>
            <Text style={s.grandLbl}>Offertentotal</Text>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ ...s.td, width: 40 + 52 + 62, textAlign: 'right' }}></Text>
              <Text style={s.grandVal}>{chf(totalBetrag)}</Text>
            </View>
          </View>

          {/* Notes */}
          <View style={s.notesWrap}>
            <Text style={s.noteLine}>ZE basieren auf einer reibungslosen Reparatur</Text>
            <Text style={s.noteLine}>Kleinmaterial-Pauschale wird bei &lt;100 ZE hinzugefügt</Text>
            {offerte.notizen ? <Text style={[s.noteLine, { marginTop: 4 }]}>{offerte.notizen}</Text> : null}
          </View>

          {/* Date / Location (centered) */}
          <View style={s.dateSection}>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Datum</Text>
              <Text style={s.dateVal}>{date}</Text>
            </View>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Ort</Text>
              <Text style={s.dateVal}>{CO_LOC}</Text>
            </View>
          </View>

          {/* Payment terms */}
          <View style={s.payRow}>
            <View style={s.payLblWrap}>
              <Text style={s.payLbl}>Zahlungskonditionen bei</Text>
              <Text style={s.paySub}>Rechnungstellung</Text>
            </View>
            <Text style={s.payVal}>10 Tage netto</Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ── Export function ───────────────────────────────────────────────────────────

export async function exportOffertePDF(offerte: Offerte, customer: Customer | undefined) {
  try {
    const blob = await pdf(<OffertePDF offerte={offerte} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
