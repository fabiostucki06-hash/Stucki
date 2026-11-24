export interface VehicleDocument {
  path: string;
  name: string;
  uploadedAt: string;
  size: number;
}

/** The vehicle fields of a Customer: since the vehicles table they belong to a
    Vehicle; on a Customer they mirror the vehicle a view or document refers to
    (see lib/vehicles), and they are never stored on the customer row. */
export type FahrzeugFeld = 'marke' | 'modell' | 'kennzeichen' | 'km' | 'chassisnummer' | 'erstzulassung' | 'antrieb' | 'getriebe' | 'steuertrieb' | 'achsantrieb' | 'motor' | 'motorcode';
export type FahrzeugFelder = Pick<Vehicle, FahrzeugFeld>;

/** Technical data the Wartungsplan is derived from (lib/wartung); inferred from
    Marke / Modell / VIN when not set. */
export type Antrieb = 'benzin' | 'diesel' | 'hybrid' | 'plugin' | 'elektro' | 'gas';
export type Getriebe = 'manuell' | 'automat' | 'dsg' | 'cvt';
export type Steuertrieb = 'zahnriemen' | 'kette';
/** Driven axles. Set only when known; unset = unknown. Independent of Antrieb (the fuel / energy type). */
export type Achsantrieb = 'front' | 'heck' | 'allrad';

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
  antrieb?: Antrieb;
  getriebe?: Getriebe;
  steuertrieb?: Steuertrieb;
  achsantrieb?: Achsantrieb;
  motor?: string;
  motorcode?: string;
  createdAt: string;
  vehicleDocuments?: VehicleDocument[];
}

/** One entry of a vehicle's Wartungsplan (wear part or service job).
    'gemacht' = done (at the last visit), 'faellig' = due in the future. The
    item counts as due anyway once faelligDatum or faelligKm is reached. */
export type ServiceStatus = 'gemacht' | 'faellig';

export type IntervallQuelle = 'standard' | 'richtwert' | 'geprueft';

/** An interval checked against the OEM schedule for one engine (table
    `maintenance_specs`): every vehicle with that Motorkennbuchstabe gets it. */
export interface WartungSpec {
  /** `${hersteller}|${motorcode}|${vorlage}` (lib/wartung specId). */
  id: string;
  /** Manufacturer group (lib/wartung), else the normalized Marke. */
  hersteller: string;
  motorcode: string;
  vorlage: NonNullable<ServiceItem['vorlage']>;
  intervallKm?: number;
  intervallMonate?: number;
  quelleText?: string;
  geprueftAm: string;
  geprueftVon?: string;
}

export interface ServiceEintrag {
  /** ISO date (yyyy-mm-dd). */
  datum: string;
  km?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  status: ServiceStatus;
  /** The vehicle-specific Vorlage it was made from (lib/wartung); unset = own position. */
  vorlage?: 'oel' | 'luftfilter' | 'innenraumfilter' | 'kraftstofffilter' | 'zuendkerzen' | 'bremsfluessigkeit' | 'zahnriemen' | 'getriebeoel' | 'allradkupplung' | 'verteilergetriebe' | 'hinterachsgetriebe';
  /** Interval after which the item is due again (either or both). */
  intervallKm?: number;
  intervallMonate?: number;
  /** Interval edited by hand: kept when the vehicle's profile changes. */
  intervallManuell?: boolean;
  /** Where the interval comes from (lib/wartung): generic Standardwert,
      Richtwert per manufacturer, or checked against the OEM schedule. */
  quelle?: IntervallQuelle;
  /** Reference of a checked interval, e.g. "Serviceheft", "Autodata". */
  quelleText?: string;
  /** ISO date the interval was checked. */
  geprueftAm?: string;
  /** Last time it was done. ISO date. */
  letztesDatum?: string;
  letzteKm?: string;
  /** Next due date / mileage: derived from the last service plus the interval
      when ticked off, editable (e.g. a date agreed with the customer). */
  faelligDatum?: string;
  faelligKm?: string;
  notiz?: string;
  /** Every time it was ticked off, newest last. */
  historie?: ServiceEintrag[];
}

/** A customer's vehicle (1:n, table `vehicles` with FK customer_id). */
export interface Vehicle {
  id: string;
  customerId: string;
  marke?: string;
  modell?: string;
  kennzeichen?: string;
  km?: string;
  chassisnummer?: string;
  /** ISO date of the 1. Inverkehrsetzung. */
  erstzulassung?: string;
  antrieb?: Antrieb;
  getriebe?: Getriebe;
  steuertrieb?: Steuertrieb;
  achsantrieb?: Achsantrieb;
  /** Free text, e.g. "2.0 TDI 150 PS". */
  motor?: string;
  /** Motorkennbuchstabe / engine code, e.g. "CFFB", "B47D20", "OM651". */
  motorcode?: string;
  createdAt: string;
  service?: ServiceItem[];
  /** Profile (lib/wartung profilSignatur) the plan was last matched to. */
  wartungsprofil?: string;
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
  /** The customer's vehicle this document is for; unset = the first one (see lib/vehicles). */
  vehicleId?: string;
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
  /** Fixed-price special position (see lib/sonderpositionen): 'versand' =
      Versandkosten passed on 1:1 (never a Marge), 'pauschale' = flat-rate
      package from the settings (no ZE / Stundensatz, no Marge). Unset = part. */
  art?: 'versand' | 'pauschale';
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
  /** How `ek` was converted from a foreign shop price ("EUR 45.00 × 0.9186 (EZB 23.11.2026)"). Internal only, like `ek`. */
  ekHinweis?: string;
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
  /** See Order.vehicleId. */
  vehicleId?: string;
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

/** Document type of a Rechnung; each has its own number sequence. */
export type RechnungArt = 'standard' | 'anzahlung' | 'schluss';

export type RechnungKategorie ='reparatur' | 'karosserie' | 'inspektion' | 'service';

export interface Rechnung {
  id: string;
  rechnungNumber: number;
  customerId: string;
  /** See Order.vehicleId. */
  vehicleId?: string;
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
  art?: RechnungArt;
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

/** Flat-rate service package offered in the position editor (Einstellungen → Pauschalen). */
export interface Pauschale {
  id: string;
  name: string;
  /** Fixed price in CHF, "0.00". */
  preis: string;
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
