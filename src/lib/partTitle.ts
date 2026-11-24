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

const BRAND_SLUGS = new Set(BRANDS.map((b) => b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')));
const GENERIC_SLUGS = new Set(['autoteile', 'ersatzteile', 'ersatzteil', 'teile', 'part', 'parts', 'product', 'produkt', 'artikel', 'p', 'shop']);

/** Rough part name from a shop URL's path, for when the page itself can't be
    read: "autodoc.ch/autoteile/bremsscheibe-10132" -> "Bremsscheibe". Null when
    the path only holds a brand and an article id ("/ridex/8095160"). */
export function partNameFromUrl(href: string): string | null {
  let segments: string[];
  try {
    segments = new URL(href).pathname.split('/').filter(Boolean);
  } catch {
    return null;
  }
  for (const raw of segments) {
    let seg = raw;
    try { seg = decodeURIComponent(raw); } catch { /* keep the raw segment */ }
    // Trailing article id / SKU: "bremsscheibe-10132", "querlenker-vorne-273c0325".
    const tokens = seg.toLowerCase().replace(/\.html?$/, '').split(/[-_]+/).filter(Boolean);
    while (tokens.length > 1 && (/^\d+$/.test(tokens[tokens.length - 1]) || isSku(tokens[tokens.length - 1]))) tokens.pop();
    seg = tokens.join('-');
    // Skips locale prefixes ("de", "de-ch"), brands, shop sections and bare ids.
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(seg) || BRAND_SLUGS.has(seg) || GENERIC_SLUGS.has(seg) || !/\p{L}{3,}/u.test(seg) || isSku(seg)) continue;
    const name = tokens.join(' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}

// ── Marketplace titles (eBay, Trodo, getriebeteile24, …) ──────────────────────
// These pack the fitment list into the title: "SCHWUNGRADRING AUDI S4 B6 B7 A6
// C6 4.2 V8 TIPTRONIC 079105323K". Everything below only ever REMOVES words or
// fixes their case — nothing is added, so no fitting position, side or brand is
// ever guessed.

// Shop/domain suffixes: "… - Trodo.de", "… | eBay", "… – getriebeteile24.de".
const SHOP_SUFFIX_RES = [
  /\s+[-–—|:]\s*(?:www\.)?[\p{L}\p{N}-]+(?:\.[a-z]{2,6})+\s*$/iu,
  /\s+[-–—|:]\s*(?:eBay|Trodo|getriebeteile24|Autodoc|kfzteile24|Amazon)\b.*$/i,
  /\s+(?:bei|auf)\s+eBay\b.*$/i,
];

const VEHICLE_MAKES = [
  'AUDI', 'VW', 'VOLKSWAGEN', 'BMW', 'MERCEDES-BENZ', 'MERCEDES', 'BENZ', 'OPEL', 'FORD', 'SKODA', 'ŠKODA', 'SEAT',
  'CUPRA', 'PORSCHE', 'RENAULT', 'PEUGEOT', 'CITROEN', 'CITROËN', 'FIAT', 'ALFA ROMEO', 'ALFA', 'LANCIA', 'TOYOTA',
  'LEXUS', 'HONDA', 'NISSAN', 'MAZDA', 'MITSUBISHI', 'SUBARU', 'SUZUKI', 'HYUNDAI', 'KIA', 'VOLVO', 'SAAB', 'MINI',
  'DACIA', 'JEEP', 'CHRYSLER', 'DODGE', 'LAND ROVER', 'RANGE ROVER', 'JAGUAR', 'IVECO', 'CHEVROLET', 'TESLA', 'MAN',
];
// Also ordinary words in Title Case ("Man", "Mini") — matched in UPPERCASE only.
const MAKES_UPPERCASE_ONLY = new Set(['MAN', 'MINI', 'ALFA']);
// Gearbox/part makers missing from BRANDS, and "OE"/"OEM" labels.
const EXTRA_BRANDS = ['ZF', 'AISIN', 'GETRAG', 'JATCO', 'BORGWARNER', 'BORG WARNER', 'VAG', 'OE', 'OEM'];

const MAKE_RE = (() => {
  const variants = new Set<string>();
  for (const m of [...VEHICLE_MAKES, ...EXTRA_BRANDS]) {
    variants.add(m);
    if (!MAKES_UPPERCASE_ONLY.has(m) && m.length > 3) variants.add(titleCase(m));
  }
  const alt = [...variants].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'gu');
})();

// Model names, engine/gearbox designations and listing noise — never the part.
const VEHICLE_WORDS = new Set([
  'golf', 'passat', 'polo', 'touran', 'tiguan', 'touareg', 'sharan', 'caddy', 'transporter', 'multivan', 'amarok',
  'jetta', 'scirocco', 'arteon', 'octavia', 'fabia', 'superb', 'kodiaq', 'karoq', 'yeti', 'leon', 'ibiza', 'ateca',
  'alhambra', 'astra', 'corsa', 'insignia', 'vectra', 'zafira', 'meriva', 'focus', 'fiesta', 'mondeo', 'kuga',
  'transit', 'galaxy', 'sprinter', 'vito', 'viano', 'crafter', 'cayenne', 'macan', 'panamera', 'boxster', 'cayman',
  'carrera', 'clio', 'megane', 'mégane', 'scenic', 'laguna', 'kangoo', 'trafic', 'ducato', 'punto', 'panda', 'yaris',
  'corolla', 'avensis', 'auris', 'civic', 'qashqai', 'juke', 'duster', 'sandero', 'tucson', 'sportage', 'ceed',
  'avant', 'quattro', 'limousine', 'kombi', 'variant', 'touring', 'cabrio', 'cabriolet', 'coupe', 'coupé',
  'sportback', 'allroad', 'xdrive', '4motion',
  'tdi', 'tfsi', 'tsi', 'fsi', 'cdi', 'crdi', 'hdi', 'dci', 'jtd', 'tdci', 'mpi', 'gti', 'gtd', 'amg',
  'diesel', 'benzin', 'benziner', 'tiptronic', 'multitronic', 'steptronic', 'dsg', 's-tronic', 'stronic',
  'neu', 'new', 'ovp', 'top', 'org', 'original',
]);
// Units and specs that belong to the part: "5W-30", "H7", "M8x1.25", "12V", "60Ah", "5L", "3x".
const SPEC_RE = /^(?:\d+W-?\d+|H\d{1,2}|M\d+(?:x[\d.,]+)?|\d+(?:[.,]\d+)?(?:V|Ah|A|W|L|l|ml|mm|cm|Nm|kg|g|Stk\.?|St\.?|tlg\.?|teilig)|\d+x|\d+-?(?:tlg|teilig)\.?)$/;
// Spaced OEM numbers: "N 906 916 01", "079 105 323 K".
const SPACED_OEM_RE = /(^|\s)((?:[A-Z]{1,2}\s)?\d{1,3}(?:\s\d{2,3}){2,}(?:\s[A-Z]{1,2})?)(?=\s|[,;]|$)/g;
// A segment that only lists fitment ("für Audi A4", "v. Automatikgetriebe TR80").
const FITMENT_LEAD_RE = /^(?:für|fuer|passend|passt|v\.|von|for|fits?|zu|bei)(?=\s|$)/i;
const FILLER_WORDS = new Set(['von', 'v.', 'für', 'fuer', 'passend', 'passt', 'for', 'fits', 'fit', 'zu', 'bei', 'mit', 'und', 'u.', '&', '+', '/', '-', 'an', 'ab', 'bis', 'bj', 'bj.', 'baujahr']);
// Lowercase in German titles; every other ALL-CAPS word is treated as a noun.
const LOWER_WORDS = new Set([...POSITION_WORDS, 'und', 'mit', 'ohne', 'für', 'von', 'oder', 'inkl.', 'inklusive', 'komplett', 'gebraucht', 'neuwertig', 'links/rechts']);

const stripPunct = (t: string) => t.replace(/^[(\[{"'„“]+|[)\]}"'“”.,;:!?]+$/g, '');

/** A vehicle/gearbox code or OEM number: contains a digit and is no unit/spec. */
function isCode(token: string): boolean {
  const t = stripPunct(token);
  if (!t || SPEC_RE.test(t)) return false;
  return /\d/.test(t) && /^[\p{L}\p{N}.\/\-]+$/u.test(t);
}

/** A part/OEM number worth keeping as Artikelnummer (not a chassis or gearbox code like "B6", "6HP19"). */
function isPartNumber(token: string): boolean {
  const t = stripPunct(token);
  if (!isCode(t) || /^\d+[.,]\d+$/.test(t) || t.includes('/')) return false;
  const compact = t.replace(/[.\-]/g, '');
  return compact.length >= 7 && (compact.match(/\d/g)?.length ?? 0) >= 5;
}

/** ALL-CAPS → German case: nouns Capitalised, positions/conjunctions lowercase.
    Short acronyms (ABS, ATF, ZMS) stay as they are. */
function fixCase(word: string): string {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || letters !== letters.toUpperCase() || letters === letters.toLowerCase()) return word;
  const lower = word.toLowerCase();
  if (LOWER_WORDS.has(lower)) return lower;
  return lower.replace(/(^|[-\/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Only shop suffixes off and ALL-CAPS fixed — the fallback when shortening fails. */
function lightClean(raw: string): string {
  let t = raw;
  for (const re of [...SHOP_SUFFIX_RES, ...SEO_RES]) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim().split(' ').map(fixCase).join(' ');
}

export interface ParsedPartTitle {
  /** Short, customer-ready line item name ("Schwungradring"). */
  name: string;
  /** OEM/shop numbers found in the title, deduped ("079105323K"); '' if none. */
  artikelnummer: string;
}

/** Raw shop/marketplace title -> short German Bauteilbeschreibung plus the part
    numbers it contained. Only removes words and fixes case; never adds any. */
export function parsePartTitle(raw: string): ParsedPartTitle {
  const original = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return { name: '', artikelnummer: '' };

  let t = original;
  for (const re of [...SHOP_SUFFIX_RES, ...SEO_RES]) t = t.replace(re, ' ');
  t = t.replace(/\s+/g, ' ').trim();

  // Part numbers first, deduped ignoring spaces/dots ("N90691601" = "N 906 916 01").
  const numbers: string[] = [];
  const seenNr = new Set<string>();
  const addNr = (n: string) => {
    const key = n.replace(/[\s.\-]/g, '').toUpperCase();
    if (seenNr.has(key)) return;
    seenNr.add(key);
    numbers.push(n);
  };
  for (const tok of t.split(/[\s,;]+/)) if (isPartNumber(tok)) addNr(stripPunct(tok));
  t = t.replace(SPACED_OEM_RE, (_, lead: string, nr: string) => { addNr(nr); return `${lead} `; });
  t = t.replace(SPACED_NUMBER_RE, '').trim();

  t = t.replace(BRAND_RE, '$1 ').replace(MAKE_RE, '$1 ').replace(/\s+/g, ' ').trim();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawSeg of t.split(/[,;]|\s[-–—|]\s/)) {
    let seg = rawSeg.trim();
    if (!seg || FITMENT_LEAD_RE.test(seg)) continue;
    // Drop codes, model names and listing noise; a bare number right after a
    // dropped vehicle token belongs to it ("Golf 7").
    const kept: string[] = [];
    let afterVehicle = false;
    for (const tok of seg.split(' ')) {
      const bare = stripPunct(tok).toLowerCase();
      if (isCode(tok) || VEHICLE_WORDS.has(bare) || (afterVehicle && /^\d{1,2}$/.test(bare))) { afterVehicle = true; continue; }
      afterVehicle = false;
      if (tok === 'v.' || bare === 'von') continue; // "Schraube von Wandler" -> "Schraube Wandler"
      kept.push(tok);
    }
    // Connectors left dangling once the vehicle is gone ("Bremsscheibe für").
    while (kept.length && FILLER_WORDS.has(kept[kept.length - 1].toLowerCase())) kept.pop();
    while (kept.length && FILLER_WORDS.has(kept[0].toLowerCase())) kept.shift();
    seg = kept.map(fixCase).join(' ').replace(/^[\s\-–—:;.]+|[\s\-–—:;]+$/g, '');

    const w = words(seg);
    // Drop pure repeats ("Querlenker Hinterachse, Querlenker") and bare
    // material attributes; fold a lone side/position word into the segment
    // before it ("Vorderachse links, unten" -> "Vorderachse links unten").
    if (!w.length || w.every((x) => seen.has(x)) || w.every((x) => MATERIAL_WORDS.has(x))) continue;
    w.forEach((x) => seen.add(x));
    if (out.length && w.every((x) => POSITION_WORDS.has(x))) out[out.length - 1] += ` ${seg}`;
    else out.push(seg);
  }

  // "Teilesatz, Automatikgetriebe-Ölwechsel" -> "Teilesatz Automatikgetriebe-Ölwechsel":
  // a one-word lead is the item, the next segment says what it is for.
  if (out.length > 1 && !out[0].includes(' ') && !/^\d/.test(out[0])) out.splice(0, 2, `${out[0]} ${out[1]}`);
  let name = out.join(', ');

  // Nothing meaningful left (only codes / a model list): fall back to the
  // lightly cleaned original, for the user to shorten by hand.
  if ((name.match(/\p{L}/gu)?.length ?? 0) < 3) name = lightClean(original);
  if (name) name = name.charAt(0).toUpperCase() + name.slice(1);

  return { name, artikelnummer: numbers.slice(0, 3).join(', ') };
}

export function cleanPartTitle(raw: string): string {
  return parsePartTitle(raw).name;
}
