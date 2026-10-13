/** Turns a raw shop product title (Autodoc/ATP og:title, <title>, share text)
    into a short position label for an Offerte, e.g.
    "273C0325 RIDEX Querlenker Hinterachse, Vorderachse links, unten, Querlenker, Aluminium | AUTODOC Preis und Erfahrung"
    -> "Querlenker Hinterachse, Vorderachse links unten". */

// Matched in UPPERCASE and Title Case ("BOSCH" / "Bosch") only — never fully
// case-insensitive, so ordinary words inside a description survive.
const BRANDS = [
  'RIDEX', 'STARK', 'BOSCH', 'ATE', 'TRW', 'FEBI BILSTEIN', 'FEBI', 'BILSTEIN', 'MEYLE', 'VALEO', 'SKF', 'BREMBO',
  'LEMFÖRDER', 'MAPCO', 'SWAG', 'SACHS', 'MONROE', 'KYB', 'MANN-FILTER', 'MAHLE', 'KNECHT', 'HELLA', 'DELPHI',
  'DENSO', 'NGK', 'LUK', 'LuK', 'INA', 'FAG', 'CONTINENTAL', 'CONTITECH', 'GATES', 'DAYCO', 'TEXTAR', 'ZIMMERMANN',
  'OPTIMAL', 'A.B.S.', 'FILTRON', 'HENGST', 'PIERBURG', 'VAICO', 'VEMO', 'TOPRAN', 'BLUE PRINT', 'JAPANPARTS',
  'MAXGEAR', 'ELRING', 'VICTOR REINZ', 'CORTECO', 'BERU', 'CHAMPION', 'VARTA', 'OSRAM', 'PHILIPS', 'NISSENS', 'NRF',
  'MOOG', 'FERODO', 'PAGID', 'JURID', 'RUVILLE', 'SNR', 'TYC', 'VAN WEZEL', 'WALKER', 'BOSAL', 'KAMOKA', 'AUTOMEGA',
  'HERTH+BUSS', 'MAGNETI MARELLI', 'PURFLUX', 'UFI', 'MASTER-SPORT', 'METZGER', 'FEBEST', 'DENCKERMANN', 'ABAKUS',
];
// Also ordinary German words in Title Case ("Stark", "Optimal") — uppercase only.
const UPPERCASE_ONLY = new Set(['STARK', 'OPTIMAL', 'CHAMPION', 'GATES', 'WALKER', 'INA']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-+.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

const BRAND_RE = (() => {
  const variants = new Set<string>();
  for (const b of BRANDS) {
    variants.add(b);
    if (!UPPERCASE_ONLY.has(b) && b.length > 3) variants.add(titleCase(b));
  }
  // Longest first, so "FEBI BILSTEIN" wins over "FEBI". No lookbehind (older
  // iOS Safari can't parse it) — the leading boundary is captured and re-emitted.
  const alt = [...variants].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'gu');
})();

const SEO_RES = [
  /\s*\|.*$/, // "… | AUTODOC Preis und Erfahrung"
  /\s+[-–—]\s*(?:AUTODOC|ATP)\b.*$/i, // "… - AUTODOC"
  /\b(?:online|günstig|guenstig|preiswert)\s+(?:kaufen|bestellen)\b.*$/i,
  /\bPreis(?:e)?\s+und\s+Erfahrung(?:en)?\b/gi,
  /\b(?:AUTODOC|ATP[\s-]?Autoteile)(?:\.[a-z]{2,3})?\b/gi,
];

// Leading article number / SKU: "273C0325 …", "82B0036 …", "0 986 494 104 …".
// Needs 3+ digits so "5W-30 Motoröl" / "H7 Glühlampe" keep their spec.
const SPACED_NUMBER_RE = /^\d[\d\s.-]{5,}\d(?=\s)/;
function isSku(token: string): boolean {
  if (/^\d+W-?\d+$/i.test(token)) return false;
  return token.length >= 5 && /^[A-Za-z0-9][A-Za-z0-9\-./]*$/.test(token) && (token.match(/\d/g)?.length ?? 0) >= 3;
}

const POSITION_WORDS = new Set(['links', 'rechts', 'oben', 'unten', 'vorne', 'vorn', 'hinten', 'innen', 'aussen', 'außen', 'beidseitig', 'beidseits']);
const MATERIAL_WORDS = new Set(['aluminium', 'alu', 'stahl', 'stahlblech', 'edelstahl', 'guss', 'grauguss', 'gummi', 'kunststoff', 'metall', 'gummi-metall']);

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

export function cleanPartTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  for (const re of SEO_RES) t = t.replace(re, ' ');
  t = t.replace(BRAND_RE, '$1 ').replace(/\s+/g, ' ').trim();

  t = t.replace(SPACED_NUMBER_RE, '').trim();
  for (let i = 0; i < 2; i++) {
    const [first, ...rest] = t.split(' ');
    if (!rest.length || !isSku(first)) break;
    t = rest.join(' ');
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of t.split(',').map((s) => s.replace(/^[\s\-–—:;]+|[\s\-–—:;]+$/g, ''))) {
    const w = words(seg);
    // Drop pure repeats ("Querlenker Hinterachse, Querlenker") and bare
    // material attributes; fold a lone side/position word into the segment
    // before it ("Vorderachse links, unten" -> "Vorderachse links unten").
    if (!w.length || w.every((x) => seen.has(x)) || w.every((x) => MATERIAL_WORDS.has(x))) continue;
    w.forEach((x) => seen.add(x));
    if (out.length && w.every((x) => POSITION_WORDS.has(x))) out[out.length - 1] += ` ${seg}`;
    else out.push(seg);
  }

  return out.join(', ') || raw.trim();
}
