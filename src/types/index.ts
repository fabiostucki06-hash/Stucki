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
  preis: string;
  /** Shop page the part was sourced from (e.g. Autodoc). Internal reference only — never printed on customer documents. */
  link?: string;
}

export type Position = ArbeitPosition | MaterialPosition;

export interface Offerte {
  id: string;
  offertNumber: number;
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

export type TabId = 'dashboard' | 'auftraege' | 'offerten' | 'rechnungen' | 'kunden' | 'statistiken' | 'einstellungen';
export type SyncStatus = 'idle' | 'saving' | 'ok' | 'error';
