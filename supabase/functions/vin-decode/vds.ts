// Built-in VDS model tables (no external key needed). Shared by the Edge Function
// vin-decode and the browser fallback (src/lib/vin.ts), so it has no imports.
// European and Japanese makers code the model line / chassis in the VDS, rarely
// the engine; the engine variants come from src/lib/motorkatalog.ts.
// Marke as returned by the WMI tables ("VW", "Mercedes", "Citroen", "Alfa Romeo").
// Model names match the patterns of the Motorkatalog.

/** VAG model codes (VIN chars 7–8) → Modell (Typ). */
const VAG_MODELL: Record<string, Record<string, string>> = {
  Audi: {
    '8L': 'A3 (8L)', '8P': 'A3 (8P)', '8V': 'A3 (8V)', '8Y': 'A3 (8Y)', 'GB': 'A1 (GB)', '8X': 'A1 (8X)', '8E': 'A4 (B6/B7)', '8K': 'A4 (B8)',
    '8W': 'A4 (B9)', '8T': 'A5 (8T)', '8F': 'A5 Cabriolet (8F)', 'F5': 'A5 (F5)', '4F': 'A6 (C6)', '4G': 'A6 (C7)', '4A': 'A6 (C8)',
    '4K': 'A7 (4K)', '4H': 'A8 (D4)', '4N': 'A8 (D5)', '8U': 'Q3 (8U)', 'F3': 'Q3 (F3)', '8R': 'Q5 (8R)', 'FY': 'Q5 (FY)', '4L': 'Q7 (4L)',
    '4M': 'Q7 / Q8 (4M)', 'GA': 'Q2 (GA)', '8J': 'TT (8J)', 'FV': 'TT (FV)', '42': 'R8 (42)', '4S': 'R8 (4S)', 'GE': 'e-tron (GE)', 'FZ': 'Q4 e-tron (FZ)',
  },
  VW: {
    '1J': 'Golf IV', '1K': 'Golf V', '5K': 'Golf VI', '1H': 'Golf III', 'AU': 'Golf VII', '5G': 'Golf VII', 'BA': 'Golf VII Sportsvan', 'CD': 'Golf VIII',
    '9N': 'Polo (9N)', '6R': 'Polo (6R)', '6C': 'Polo (6C)', 'AW': 'Polo (AW)', '3B': 'Passat (B5)', '3C': 'Passat (B6/B7)', '36': 'Passat (B7)',
    '3G': 'Passat / Arteon (B8)', '3H': 'Arteon', '5N': 'Tiguan (5N)', 'AD': 'Tiguan (AD)', 'BW': 'Tiguan Allspace', '1T': 'Touran (1T)',
    '5T': 'Touran (5T)', '7L': 'Touareg (7L)', '7P': 'Touareg (7P)', 'CR': 'Touareg (CR)', '7H': 'Transporter T5', '7J': 'Transporter T5',
    'SH': 'Transporter T6', 'SG': 'Transporter T6', '2K': 'Caddy (2K)', 'SB': 'Caddy (SB)', '2E': 'Crafter (2E)', 'SY': 'Crafter (SY)',
    'AA': 'up!', '13': 'Scirocco', '16': 'Beetle', '5C': 'Beetle', 'A1': 'T-Roc', 'D1': 'T-Roc', 'C1': 'T-Cross', 'CS': 'Taigo', '7N': 'Sharan (7N)',
    'E1': 'ID.3', 'E2': 'ID.4', 'EB': 'ID. Buzz',
  },
  Skoda: {
    '1U': 'Octavia I', '1Z': 'Octavia II', '5E': 'Octavia III', 'NX': 'Octavia IV', '3U': 'Superb I', '3T': 'Superb II', '3V': 'Superb III',
    '6Y': 'Fabia I', '5J': 'Fabia II', 'NJ': 'Fabia III', 'PJ': 'Fabia IV', '5L': 'Yeti', 'NS': 'Kodiaq', 'NU': 'Karoq', 'NW': 'Scala',
    'NH': 'Rapid', 'NY': 'Enyaq', 'AA': 'Citigo', '7N': 'Roomster', '5Y': 'Roomster', 'KM': 'Kamiq',
  },
  Seat: {
    '1P': 'Leon (1P)', '5F': 'Leon (5F)', 'KL': 'Leon (KL)', '6L': 'Ibiza (6L)', '6J': 'Ibiza (6J)', '6P': 'Ibiza (6P)', 'KJ': 'Ibiza (KJ)',
    '5P': 'Altea', 'KH': 'Ateca', '7N': 'Alhambra (7N)', 'AA': 'Mii', '3R': 'Exeo',
  },
};

/** Mercedes Baureihe (VIN chars 4–6) → Modell. */
const MB_BAUREIHE: Record<string, string> = {
  '168': 'A-Klasse (W168)', '169': 'A-Klasse (W169)', '176': 'A-Klasse (W176)', '177': 'A-Klasse (W177)', '245': 'B-Klasse (W245)',
  '246': 'B-Klasse (W246)', '247': 'B-Klasse (W247)', '117': 'CLA (C117)', '118': 'CLA (C118)', '156': 'GLA (X156)',
  '202': 'C-Klasse (W202)', '203': 'C-Klasse (W203)', '204': 'C-Klasse (W204)', '205': 'C-Klasse (W205)', '206': 'C-Klasse (W206)',
  '210': 'E-Klasse (W210)', '211': 'E-Klasse (W211)', '212': 'E-Klasse (W212)', '207': 'E-Klasse Coupé (C207)', '213': 'E-Klasse (W213)',
  '238': 'E-Klasse Coupé (C238)', '214': 'E-Klasse (W214)', '220': 'S-Klasse (W220)', '221': 'S-Klasse (W221)', '222': 'S-Klasse (W222)',
  '223': 'S-Klasse (W223)', '218': 'CLS (C218)', '257': 'CLS (C257)', '253': 'GLC (X253)', '254': 'GLC (X254)',
  '164': 'ML (W164)', '166': 'GLE/ML (W166)', '167': 'GLE (V167)', '463': 'G-Klasse (W463)', '251': 'R-Klasse (W251)', '451': 'smart fortwo (451)',
  '414': 'Vaneo', '415': 'Citan (W415)', '420': 'Citan (W420)', '447': 'V-Klasse / Vito (447)', '639': 'Viano / Vito (639)',
  '638': 'Vito (638)', '903': 'Sprinter (903)', '906': 'Sprinter (906)', '907': 'Sprinter (907)', '910': 'Sprinter (910)', '293': 'EQC (N293)',
  '243': 'EQA (H243)', '295': 'EQE (V295)', '297': 'EQS (V297)',
};

/** Porsche (VIN chars 7–8, model type) → Modell. */
const PORSCHE_MODELL: Record<string, string> = {
  '99': '911 (996/997/991/992)', '98': 'Boxster / Cayman (986/987/981/982)', '97': 'Panamera (970/971)', '9P': 'Cayenne (9PA)',
  '92': 'Cayenne (92A)', '9Y': 'Cayenne (9YA)', '95': 'Macan (95B)', 'Y1': 'Taycan (Y1)',
};

/** Fiat / Alfa Romeo / Lancia type number (VIN chars 4–6) → Modell. */
const FIAT_TYP: Record<string, string> = {
  '312': '500 (312)', '169': 'Panda (169)', '319': 'Panda (319)', '188': 'Punto (188)', '199': 'Punto (199)', '192': 'Stilo (192)',
  '198': 'Bravo (198)', '223': 'Doblò (223)', '263': 'Doblò (263)', '225': 'Fiorino / Qubo (225)', '244': 'Ducato (244)', '250': 'Ducato (250)',
  '356': 'Tipo (356)', '334': '500X (334)',
  '940': 'Giulietta (940)', '955': 'MiTo (955)', '939': '159 / Brera (939)', '937': '147 / GT (937)', '952': 'Giulia (952)', '949': 'Stelvio (949)',
};

/** Mazda chassis code (VIN chars 4–5, European VINs) → Modell. */
const MAZDA_MODELL: Record<string, string> = {
  'BK': 'Mazda3 (BK)', 'BL': 'Mazda3 (BL)', 'BM': 'Mazda3 (BM)', 'BN': 'Mazda3 (BM)', 'BP': 'Mazda3 (BP)',
  'GG': 'Mazda6 (GG)', 'GY': 'Mazda6 (GG)', 'GH': 'Mazda6 (GH)', 'GJ': 'Mazda6 (GJ)', 'GL': 'Mazda6 (GJ)',
  'DY': 'Mazda2 (DY)', 'DE': 'Mazda2 (DE)', 'DJ': 'Mazda2 (DJ)', 'DK': 'CX-3 (DK)', 'DM': 'CX-30 (DM)',
  'KE': 'CX-5 (KE)', 'KF': 'CX-5 (KF)', 'NC': 'MX-5 (NC)', 'ND': 'MX-5 (ND)', 'CR': 'Mazda5 (CR)', 'CW': 'Mazda5 (CW)',
};

/** Honda chassis code (VIN chars 4–5) → Modell. Civic shares FK/FN over generations: the year decides. */
const HONDA_MODELL: Record<string, string> = {
  'FK': 'Civic', 'FN': 'Civic', 'FD': 'Civic', 'FB': 'Civic', 'FC': 'Civic', 'FL': 'Civic (FL)',
  'GD': 'Jazz (GD)', 'GE': 'Jazz (GE)', 'GK': 'Jazz (GK)', 'GR': 'Jazz (GR)',
  'RD': 'CR-V (RD)', 'RE': 'CR-V (RE)', 'RM': 'CR-V (RM)', 'RW': 'CR-V (RW)', 'GH': 'HR-V (GH)', 'RU': 'HR-V (RU)',
  'CL': 'Accord (CL)', 'CM': 'Accord (CL)', 'CU': 'Accord (CU)', 'CW': 'Accord (CU)', 'ZE': 'Insight (ZE)', 'BE': 'FR-V (BE)',
};

/** Nissan chassis code (VIN chars 7–9, European VINs) → Modell. */
const NISSAN_MODELL: Record<string, string> = {
  'J10': 'Qashqai (J10)', 'J11': 'Qashqai (J11)', 'J12': 'Qashqai (J12)', 'F15': 'Juke (F15)', 'F16': 'Juke (F16)',
  'K12': 'Micra (K12)', 'K13': 'Micra (K13)', 'K14': 'Micra (K14)', 'E11': 'Note (E11)', 'E12': 'Note (E12)',
  'T30': 'X-Trail (T30)', 'T31': 'X-Trail (T31)', 'T32': 'X-Trail (T32)', 'ZE0': 'Leaf (ZE0)', 'ZE1': 'Leaf (ZE1)',
  'D40': 'Navara (D40)', 'D23': 'Navara (D23)', 'C13': 'Pulsar (C13)',
};

/** Volvo model code (VIN chars 4–5) → Modell. */
const VOLVO_MODELL: Record<string, string> = {
  'MS': 'S40 (II)', 'MW': 'V50', 'MK': 'C30', 'RS': 'S80 (I)', 'AS': 'S80 (II)', 'SW': 'V70 (II)', 'SZ': 'XC70 (II)',
  'BW': 'V70 (III)', 'BZ': 'XC70 (III)', 'CZ': 'XC90 (I)', 'DZ': 'XC60 (I)', 'FS': 'S60 (II)', 'FW': 'V60 (I)',
  'MV': 'V40 (II)', 'MZ': 'V40 Cross Country', 'UZ': 'XC60 (II)', 'XZ': 'XC40', 'PS': 'S90', 'PW': 'V90', 'ZW': 'V60 (II)',
};

/** Renault / Dacia vehicle type (VIN chars 4–6, else 4–5) → Modell. */
const RENAULT_MODELL: Record<string, string> = {
  'BR': 'Clio III', 'CR': 'Clio III', 'KR': 'Clio III Grandtour', '5R': 'Clio IV', 'RJA': 'Clio V', '2R': 'Captur I', 'RJB': 'Captur II',
  'BM': 'Megane II', 'KM': 'Megane II Grandtour', 'JM': 'Scenic II', 'BZ': 'Megane III', 'DZ': 'Megane III Coupé', 'KZ': 'Megane III Grandtour',
  'JZ': 'Scenic III', 'RFB': 'Megane IV', 'RFE': 'Kadjar', 'CN': 'Twingo II', 'AH': 'Twingo III', 'FW': 'Kangoo II', 'KW': 'Kangoo II',
  'FC': 'Kangoo I', 'KC': 'Kangoo I', 'FL': 'Trafic', 'MA': 'Master III', 'BT': 'Laguna III', 'KT': 'Laguna III Grandtour', 'AG': 'Zoe',
};
const DACIA_MODELL: Record<string, string> = {
  'BS': 'Sandero I', '5S': 'Sandero II', 'LS': 'Logan I', '4S': 'Logan II', 'HS': 'Duster I', 'JS': 'Lodgy', '8S': 'Dokker',
};

/** Peugeot / Citroën family (VIN char 4, or 4–5) → Modell. */
const PEUGEOT_MODELL: Record<string, string> = {
  'CU': '2008 (I)', 'CA': '208 (I)', 'CC': '208 (I)', '0U': '3008 (I)', '0E': '5008 (I)',
  '2': '206', '3': '307', 'W': '207', '4': '308 (I)', 'L': '308 (II)', '6': '407', '8': '508 (I)', '7': 'Partner (II)', 'M': '3008 / 5008 (II)',
};
const CITROEN_MODELL: Record<string, string> = {
  'SC': 'C3 (II)', 'SA': 'DS3', 'SH': 'C3 Picasso', 'FC': 'C3 (I)', 'LC': 'C4 (I)', 'LA': 'C4 (I)', 'NC': 'C4 (II)',
  'UA': 'C4 Picasso (I)', 'UD': 'C4 Picasso (I)', 'RD': 'C5 (III)', 'RW': 'C5 (III)', '7': 'Berlingo (II)',
};

/** Opel platform code: older VINs W0L0 + chars 5–6, newer W0L + char 4. */
const OPEL_MODELL: Record<string, string> = {
  '0TG': 'Astra G / Zafira A', '0AH': 'Astra H / Zafira B', '0XC': 'Corsa C / Meriva A / Combo C', '0SD': 'Corsa D', '0XE': 'Corsa E',
  '0ZC': 'Vectra C / Signum', 'P': 'Astra J / Zafira C', 'G': 'Insignia A',
};

const zuerst = (t: Record<string, string>, ...keys: string[]) => keys.map((k) => t[k]).find(Boolean);

/** The VDS layout is fixed and documented only for these cases: European VAG / Porsche
    VINs ("ZZZ" filler, type in chars 7–8), European Mercedes (Baureihe in 4–6) and the
    Fiat group's type number. A name covering several models doesn't settle the model. */
function vdsSicher(marke: string | undefined, vin: string, modell: string): boolean {
  if (modell.includes(' / ')) return false;
  if (marke === 'Audi' || marke === 'VW' || marke === 'Skoda' || marke === 'Seat' || marke === 'Porsche') return vin.slice(3, 6) === 'ZZZ';
  if (marke === 'Mercedes') return vin[0] === 'W';
  return marke === 'Fiat' || marke === 'Alfa Romeo' || marke === 'Lancia';
}

/** Modell only where the VIN settles it; safe to enter into the form. */
export function vdsModell(marke: string | undefined, vin: string): string | undefined {
  const m = vdsTabelle(marke, vin);
  return m && vdsSicher(marke, vin, m) ? m : undefined;
}

/** A table hit that doesn't settle the model: shown as an unconfirmed suggestion only. */
export function vdsModellVorschlag(marke: string | undefined, vin: string): string | undefined {
  const m = vdsTabelle(marke, vin);
  return m && !vdsSicher(marke, vin, m) ? m : undefined;
}

function vdsTabelle(marke: string | undefined, vin: string): string | undefined {
  switch (marke) {
    case 'Audi': case 'VW': case 'Skoda': case 'Seat':
      return VAG_MODELL[marke][vin.slice(6, 8)];
    case 'Mercedes':
      return MB_BAUREIHE[vin.slice(3, 6)];
    case 'Porsche':
      return PORSCHE_MODELL[vin.slice(6, 8)];
    case 'Fiat': case 'Alfa Romeo': case 'Lancia':
      return FIAT_TYP[vin.slice(3, 6)];
    case 'Mazda':
      return MAZDA_MODELL[vin.slice(3, 5)];
    case 'Honda':
      return HONDA_MODELL[vin.slice(3, 5)];
    case 'Nissan':
      return NISSAN_MODELL[vin.slice(6, 9)];
    case 'Volvo':
      return VOLVO_MODELL[vin.slice(3, 5)];
    case 'Renault':
      return zuerst(RENAULT_MODELL, vin.slice(3, 6), vin.slice(3, 5));
    case 'Dacia':
      return DACIA_MODELL[vin.slice(3, 5)];
    case 'Peugeot':
      return zuerst(PEUGEOT_MODELL, vin.slice(3, 5), vin[3]);
    case 'Citroen': case 'DS':
      return zuerst(CITROEN_MODELL, vin.slice(3, 5), vin[3]);
    case 'Opel':
      return zuerst(OPEL_MODELL, vin.slice(3, 6), vin[3]);
    default:
      return undefined;
  }
}
