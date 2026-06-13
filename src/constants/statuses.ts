import type { OrderStatus } from '../types';

export interface StatusConfig {
  label: string;
  short: string;
  sysColor: string;
}

export const SC: Record<OrderStatus, StatusConfig> = {
  aufnahme:             { label: 'Aufnahme',           short: 'Aufnahme', sysColor: 'indigo' },
  offerte_versendet:    { label: 'Offerte versendet',   short: 'Offerte',  sysColor: 'orange' },
  offerte_bestaetigt:   { label: 'Offerte bestätigt',   short: 'Bestätigt',sysColor: 'green'  },
  teile_arbeit:         { label: 'Teile & Arbeit',      short: 'Arbeit',   sysColor: 'blue'   },
  zahlung_versendet:    { label: 'Zahlung versendet',   short: 'Zahlung',  sysColor: 'orange' },
  zahlung_erhalten:     { label: 'Zahlung erhalten',    short: 'Bezahlt',  sysColor: 'purple' },
  abgeschlossen:        { label: 'Abgeschlossen',       short: 'Fertig',   sysColor: 'gray'   },
};

export const SO: OrderStatus[] = [
  'aufnahme',
  'offerte_versendet',
  'offerte_bestaetigt',
  'teile_arbeit',
  'zahlung_versendet',
  'zahlung_erhalten',
  'abgeschlossen',
];
