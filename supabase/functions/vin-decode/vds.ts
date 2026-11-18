// Built-in VDS model tables (no external key needed). European makers code the
// model line in the VDS; the engine usually not. Marke as returned by WMI3.

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

/** Modell from the manufacturer-coded VDS, where a built-in table covers the make. */
export function vdsModell(marke: string | undefined, vin: string): string | undefined {
  switch (marke) {
    case 'Audi': case 'VW': case 'Skoda': case 'Seat':
      return VAG_MODELL[marke][vin.slice(6, 8)];
    case 'Mercedes':
      return MB_BAUREIHE[vin.slice(3, 6)];
    case 'Porsche':
      return PORSCHE_MODELL[vin.slice(6, 8)];
    default:
      return undefined;
  }
}
