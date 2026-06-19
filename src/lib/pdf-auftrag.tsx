import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, MaterialPosition, Order } from '../types';

const BLUE   = '#007AFF';
const TEAL   = '#32ADE6';
const DARK   = '#1C1C1E';
const GRAY   = '#6E6E73';
const LIGHT  = '#F2F2F7';
const BORDER = '#D1D1D6';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 45,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  garageName:   { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  garageTagline: { fontSize: 8.5, color: GRAY, marginTop: 2 },
  docLabel: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: TEAL, letterSpacing: 1.5 },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  metaRow: { flexDirection: 'row', marginBottom: 4 },
  metaLbl: { fontSize: 7.5, color: GRAY, width: 82 },
  metaVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  sectionCaption: {
    fontSize: 7,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 7,
  },

  badge: {
    backgroundColor: TEAL,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeCaption: { fontSize: 7, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', marginBottom: 2 },
  badgeNumber:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },

  sectionHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 14,
  },

  beanstandungRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  beanstandungRowAlt: { backgroundColor: LIGHT },
  bNum: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEAL, width: 18 },
  bTxt: { fontSize: 8.5, color: DARK, flex: 1 },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 1,
  },
  thCell: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: LIGHT },
  tdCell: { fontSize: 8.5, color: DARK },
  tdBold: { fontFamily: 'Helvetica-Bold' },

  cBez:    { flex: 1 },
  cMenge:  { width: 42, textAlign: 'right' },
  cStkPrz: { width: 54, textAlign: 'right' },
  cZE:     { width: 32, textAlign: 'right' },
  cPreis:  { width: 64, textAlign: 'right' },

  totalsWrap: { alignItems: 'flex-end', marginTop: 6, marginBottom: 20 },
  grandRow: {
    flexDirection: 'row',
    width: 200,
    paddingVertical: 7,
    borderTopWidth: 1.5,
    borderTopColor: BLUE,
    borderTopStyle: 'solid',
  },
  grandLbl: { flex: 1, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  grandVal: { width: 80, fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: BLUE },

  notesBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
    borderLeftStyle: 'solid',
    paddingLeft: 10,
    paddingVertical: 8,
    paddingRight: 8,
    marginBottom: 14,
    backgroundColor: '#FFFBF0',
    borderRadius: 4,
  },
  notesCaption: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FF9500', textTransform: 'uppercase', marginBottom: 4 },
  notesText: { fontSize: 8.5, color: GRAY },

  footer: {
    position: 'absolute',
    bottom: 22,
    left: 45,
    right: 45,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
    paddingTop: 6,
  },
  footerTxt: { fontSize: 7, color: GRAY },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLbl}>{label}</Text>
      <Text style={s.metaVal}>{value}</Text>
    </View>
  );
}

function RowRight({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4, justifyContent: 'flex-end' }}>
      <Text style={{ fontSize: 8, color: GRAY, marginRight: 5 }}>{label}:</Text>
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{value}</Text>
    </View>
  );
}

interface Props { order: Order; customer: Customer | undefined }

const AuftragPDF: React.FC<Props> = ({ order, customer }) => {
  const todayCH   = new Date().toLocaleDateString('de-CH');
  const vehicle   = [customer?.marke, customer?.modell].filter(Boolean).join(' ') || '—';
  const owner     = customer ? `${customer.vorname} ${customer.nachname}` : '—';
  const beanstandungen = order.beanstandungen?.filter(Boolean) ?? [];
  const positionen     = order.positionen ?? [];

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.header}>
          <View>
            <Text style={s.garageName}>GarageOS</Text>
            <Text style={s.garageTagline}>Werkstatt &amp; Service</Text>
          </View>
          <Text style={s.docLabel}>AUFTRAG</Text>
        </View>

        <View style={s.meta}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={s.sectionCaption}>Fahrzeugbesitzer / Fahrzeugdaten</Text>
            <Row label="Fahrzeugbesitzer" value={owner} />
            {customer?.telefon && <Row label="Telefon"      value={customer.telefon} />}
            {customer?.email   && <Row label="E-Mail"       value={customer.email}   />}
            <Row label="Fahrzeug" value={vehicle} />
            {customer?.kennzeichen && <Row label="Kennzeichen" value={customer.kennzeichen} />}
            {customer?.km          && <Row label="Km-Stand"    value={`${customer.km} km`} />}
          </View>

          <View style={{ width: 170 }}>
            <View style={s.badge}>
              <Text style={s.badgeCaption}>Auftragsnummer</Text>
              <Text style={s.badgeNumber}>#{order.orderNumber}</Text>
            </View>
            <RowRight label="Datum" value={todayCH} />
            <RowRight label="Erstellt" value={new Date(order.createdAt).toLocaleDateString('de-CH')} />
          </View>
        </View>

        {beanstandungen.length > 0 && (
          <>
            <Text style={s.sectionHeader}>Beanstandungen</Text>
            {beanstandungen.map((b, i) => (
              <View key={i} style={[s.beanstandungRow, i % 2 === 1 ? s.beanstandungRowAlt : {}]}>
                <Text style={s.bNum}>#{i + 1}</Text>
                <Text style={s.bTxt}>{b}</Text>
              </View>
            ))}
          </>
        )}

        {positionen.length > 0 && (
          <>
            <Text style={s.sectionHeader}>Positionen</Text>
            <View style={s.tableHead}>
              <Text style={[s.thCell, s.cBez]}>Bezeichnung</Text>
              <Text style={[s.thCell, s.cMenge]}>Menge</Text>
              <Text style={[s.thCell, s.cStkPrz]}>Stk.Preis</Text>
              <Text style={[s.thCell, s.cZE]}>ZE</Text>
              <Text style={[s.thCell, s.cPreis]}>Preis (CHF)</Text>
            </View>
            {positionen.map((pos, i) => {
              const mp = pos.typ === 'material' ? (pos as MaterialPosition) : null;
              const ap = pos.typ === 'arbeit'   ? (pos as ArbeitPosition)   : null;
              return (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tdCell, s.cBez]}>{pos.beschreibung || '—'}</Text>
                  <Text style={[s.tdCell, s.cMenge]}>
                    {mp ? (parseFloat(mp.menge || '0') || '—') : '—'}
                  </Text>
                  <Text style={[s.tdCell, s.cStkPrz]}>
                    {mp ? parseFloat(mp.stueckpreis || '0').toFixed(2) : '—'}
                  </Text>
                  <Text style={[s.tdCell, s.cZE]}>
                    {ap ? (ap.ze || '—') : '—'}
                  </Text>
                  <Text style={[s.tdCell, s.tdBold, s.cPreis]}>
                    {parseFloat(pos.preis || '0').toFixed(2)}
                  </Text>
                </View>
              );
            })}
            {order.rechnungsBetrag && (
              <View style={s.totalsWrap}>
                <View style={s.grandRow}>
                  <Text style={s.grandLbl}>Total</Text>
                  <Text style={s.grandVal}>CHF {parseFloat(order.rechnungsBetrag).toFixed(2)}</Text>
                </View>
              </View>
            )}
          </>
        )}

        {order.notizen && (
          <View style={s.notesBox}>
            <Text style={s.notesCaption}>Notizen</Text>
            <Text style={s.notesText}>{order.notizen}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>GarageOS · Werkstatt &amp; Service</Text>
          <Text style={s.footerTxt}>Auftrag #{order.orderNumber} · {todayCH}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
};

export async function exportOrderPDF(order: Order, customer: Customer | undefined) {
  try {
    const blob = await pdf(<AuftragPDF order={order} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
