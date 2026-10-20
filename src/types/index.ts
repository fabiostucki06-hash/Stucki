export interface VehicleDocument {
  path: string;
  name: string;
  uploadedAt: string;
  size: number;
}

export interface Customer {
  id: string;
  vorname: string;
  nachname: string;
  telefon: string;
  email?: string;
  marke?: string;
  modell?: string;
  kennzeichen?: string;
  km?: string;
  chassisnummer?: string;
  erstzulassung?: string;
  createdAt: string;
  vehicleDocuments?: VehicleDocument[];
}

export interface OrderItem {
  text: string;
  checked: boolean;
}

export type OrderStatus =
  | 'aufnahme'
  | 'offerte_versendet'
  | 'offerte_bestaetigt'
  | 'teile_arbeit'
  | 'zahlung_versendet'
  | 'zahlung_erhalten'
  | 'abgeschlossen';

export interface Order {
  id: string;
  orderNumber: number;
  customerId: string;
  status: OrderStatus;
  statusChangedAt: string;
  createdAt: string;
  beanstandungen?: string[];
  notizen?: string;
  offertItems?: OrderItem[];
  offertBetrag?: string;
  rechnungsBetrag?: string;
  zahlungsFrist?: string;
  offertId?: string;
  positionen?: Position[];
  materialStatus?: MaterialStatus;
}

export type OfferteStatus = 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt';

export interface ArbeitPosition {
  typ: 'arbeit';
  beschreibung: string;
  ze: string;
  stundenansatz: string;
  preis: string;
  zeKI?: boolean;
  zeLoading?: boolean;
  zeHint?: string;
}

export interface MaterialPosition {
  typ: 'material';
  beschreibung: string;
  menge: string;
  stueckpreis: string;
  /** Menge × Stückpreis only; the ZE are billed under Arbeit (see positionTotals). */
  preis: string;
  /** Working time billed with the part, in ZE (100 ZE = 60 min). */
  ze?: string;
  /** CHF per 100 ZE for `ze`; STD_SATZ when unset. */
  stundenansatz?: string;
  /** Shop page the part was sourced from (e.g. Autodoc). Internal reference only — never printed on customer documents. */
  link?: string;
  /** Purchase price and article number read from the shop page. Internal reference only, like `link`. */
  ek?: string;
  /** Margin (%) on `ek` that gave `stueckpreis` (see lib/marge). Internal only, like `ek`. */
  marge?: string;
  artikelnummer?: string;
  /** Ticked off in "Teile bestellen". Internal only. */
  bestellt?: boolean;
}

/** How far the parts of an Auftrag / accepted Offerte are ordered. Derived
    from the positions' `bestellt` flags whenever one is ticked. */
export type MaterialStatus = 'offen' | 'teilweise' | 'bestellt';

export type Position = ArbeitPosition | MaterialPosition;

/** Auftragsbestätigung data captured on an accepted Offerte. The AB itself is
    the Offerte rendered with these fields — same positions and payment terms. */
export interface AuftragsBestaetigung {
  /** Ungefährer Zeitpunkt der Fertigstellung (free text, e.g. "KW 44" or a date). */
  fertigstellung?: string;
  /** Ort / Datum of the Werkstatt signature block; datum is also the document date.
      The Kunde block leaves Ort / Datum blank to be filled in by hand. */
  ort?: string;
  /** ISO date (yyyy-mm-dd). */
  datum?: string;
  name?: string;
  /** Hand-drawn signature as PNG data URL. */
  unterschrift?: string;
}

export interface Offerte {
  id: string;
  offertNumber: number;
  /** Version within the same offertNumber; shown as "<nr>_<version>" from 2 on. */
  version?: number;
  /** 'material' = reine Materialofferte derived from another Offerte. */
  art?: 'standard' | 'material';
  /** The Offerte this version was derived from. */
  basisOffertId?: string;
  customerId: string;
  status: OfferteStatus;
  createdAt: string;
  titel?: string;
  positionen?: Position[];
  notizen?: string;
  gueltigBis?: string;
  zahlungsziel?: string;
  totalBetrag?: string;
  totalArbeit?: string;
  totalMaterial?: string;
  totalZE?: number;
  materialStatus?: MaterialStatus;
  /** Free-text payment terms; replace "<zahlungsziel> Tage netto" when set. */
  zahlungsbedingung?: string;
  zusatznotiz?: string;
  /** 50% Anzahlung (Vorkasse) required: the totals show the amount due and the
      Vorkasse terms apply. Unset on older Offerten: derived from the terms. */
  anzahlungErforderlich?: boolean;
  ab?: AuftragsBestaetigung;
}

export type RechnungStatus = 'entwurf' | 'versendet' | 'bezahlt' | 'storniert';

export type RechnungKategorie = 'reparatur' | 'karosserie' | 'inspektion' | 'service';

export interface Rechnung {
  id: string;
  rechnungNumber: number;
  customerId: string;
  auftragId?: string;
  status: RechnungStatus;
  createdAt: string;
  titel?: string;
  positionen?: Position[];
  notizen?: string;
  zahlungsFrist?: string;
  faelligAm?: string;
  totalBetrag?: string;
  totalArbeit?: string;
  totalMaterial?: string;
  totalZE?: number;
  kategorie?: RechnungKategorie;
  /** Manual Kleinteilepauschale override: true=erzwingen, false=unterdrücken, undefined/null=automatisch (nach Kategorie). */
  kleinteilManuell?: boolean | null;
  /** 'anzahlung' = 50% Vorkasse invoice generated from an Offerte / AB;
      'schluss' = Schlussrechnung that deducts a previous Anzahlungsrechnung. */
  art?: 'standard' | 'anzahlung' | 'schluss';
  /** Anzahlung share in % when the invoice lists the full Offerte positions; the
      Rechnungstotal is then this share of the positions' sum. Unset on older
      Anzahlungsrechnungen, which carry a single position with the amount due. */
  anzahlungProzent?: number;
  /** Schlussrechnung: the Anzahlungsrechnung whose amount is deducted. Number,
      amount and Offerte-Nr. are snapshots taken when the Schlussrechnung is created. */
  anzahlungRechnungId?: string;
  anzahlungRechnungNumber?: number;
  /** Already paid Anzahlung in CHF, deducted from the Gesamtbetrag. */
  anzahlungBetrag?: string;
  /** Display number of the source Offerte ("12" / "12_2"). */
  offertNr?: string;
  offertId?: string;
  /** Free-text payment terms; replace "<zahlungsFrist> Tage netto" when set. */
  zahlungsbedingung?: string;
}

export interface MaterialCatalogItem {
  id: string;
  beschreibung: string;
  ek?: string;
  stueckpreis: string;
  artikelnummer?: string;
  quelle?: string;
  createdAt: string;
}

export type TabId = 'dashboard' | 'auftraege' | 'offerten' | 'materialofferten' | 'auftragsbestaetigungen' | 'rechnungen' | 'anzahlungsrechnungen' | 'schlussrechnungen' | 'kunden' | 'statistiken' | 'einstellungen';
export type SyncStatus = 'idle' | 'saving' | 'ok' | 'error';
