import { wartungsPositionen } from './vehicles';
import { vorlageVon } from './wartung';
import { materialZuerst, parsePartLink } from './utils';
import { zeBetrag } from './ze';
import type { ArbeitPosition, MaterialPosition, Offerte, OfferteWartung, Position, ServiceItem, Vehicle, WartungTeile } from '../types';

/* Parts per Wartungsplan item and vehicle: the positions entered in an Offerte
   made from the Wartungsplan are remembered per item for exactly that vehicle
   (table `maintenance_parts`, id `fz:<vehicleId>:<item key>`) and pre-filled
   into the next such Offerte for the same vehicle. They are never offered on
   another vehicle. Only lines that were actually entered are stored and
   reused: without a stored entry the item gets its plain Arbeit line, never an
   assumed part or price. Nothing here touches the Wartungsplan itself
   (intervals only advance via "Gemacht"). */

type TeilPosition = WartungTeile['positionen'][number];

/** Key of a plan item: its Vorlage ("oel", "luftfilter", …), else its name. */
export function teilKey(i: ServiceItem): string {
  return vorlageVon(i) ?? `eigen:${i.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export const fzId = (vehicleId: string, key: string) => `fz:${vehicleId}:${key}`;

/** The Inspektion's stored material is never inserted into an Offerte
    automatically (only its Arbeit lines are), and an Offerte never changes it:
    it is only edited in the Wartungsplan. */
const OHNE_MATERIAL = 'inspektion';

/** The Inspektion's own ZE as entered in the Wartungsplan (> 0), else 0. */
export const inspektionZe = (it: ServiceItem): number =>
  teilKey(it) === OHNE_MATERIAL ? Math.max(0, parseFloat(it.arbeitZe ?? '') || 0) : 0;

/** The Inspektion's ZE on its Arbeit line: the one with the generated text,
    else the first Arbeit line. Never adds a line, so nothing is counted twice. */
function mitInspektionZe(zeilen: Position[], text: string, ze: number): Position[] {
  if (!ze) return zeilen;
  const idx = zeilen.findIndex((p) => p.typ === 'arbeit' && p.beschreibung.trim() === text.trim());
  const i = idx >= 0 ? idx : zeilen.findIndex((p) => p.typ === 'arbeit');
  if (i < 0) return zeilen;
  return zeilen.map((p, j) => {
    if (j !== i || p.typ !== 'arbeit') return p;
    const { zeKI, zeHint, ...a } = p;
    return { ...a, ze: String(ze), preis: zeBetrag(ze).toFixed(2) };
  });
}

const INTERVALL_ZUSATZ = /\s*\(Intervall [^)]*\)\s*$/;

/** An Offerte from the Wartungsplan saved while the Inspektion line still
    carried its interval ("Inspektion (Intervall 15'000 km / 12 Mt.)"): shown
    as "Inspektion". Only the generated suffix of the line tagged with the
    Inspektion is dropped; the plan's interval data are not touched. */
export function ohneInspektionIntervall<D extends { positionen?: Position[]; wartung?: OfferteWartung }>(d: D): D {
  const w = d.wartung;
  const sauber = (t: string) => t.replace(INTERVALL_ZUSATZ, '');
  if (!w?.items.some((it) => it.key === OHNE_MATERIAL && INTERVALL_ZUSATZ.test(it.text))
    && !d.positionen?.some((p) => p.typ === 'arbeit' && p.wartung === OHNE_MATERIAL && INTERVALL_ZUSATZ.test(p.beschreibung))) return d;
  return {
    ...d,
    positionen: d.positionen?.map((p) =>
      p.typ === 'arbeit' && p.wartung === OHNE_MATERIAL ? { ...p, beschreibung: sauber(p.beschreibung) } : p),
    ...(w && { wartung: { ...w, items: w.items.map((it) => (it.key === OHNE_MATERIAL ? { ...it, text: sauber(it.text) } : it)) } }),
  };
}

/** Stored lines of the Inspektion without ZE on its generated Arbeit line:
    the Inspektion's ZE live in the Wartungsplan (ServiceItem.arbeitZe), an
    Offerte does not change them. Lines entered with their own text keep theirs. */
function ohneInspektionZe(positionen: TeilPosition[]): TeilPosition[] {
  return positionen.map((p) => (p.typ === 'arbeit' && p.autoText && p.ze ? { ...p, ze: '', preis: '0.00' } : p));
}

/** ZE stored on the Inspektion's generated Arbeit line by an earlier Offerte
    (before its ZE were set in the Wartungsplan), '' when none. */
export function gespeicherteInspektionZe(t?: WartungTeile): string {
  const a = t?.key === OHNE_MATERIAL ? t.positionen.find((p) => p.typ === 'arbeit' && p.autoText && parseFloat(p.ze) > 0) : undefined;
  return a?.ze ?? '';
}

/** Stored positions of this vehicle for an item (never those of another vehicle). */
export function gespeicherteTeile(v: Vehicle, key: string, alle: WartungTeile[]): WartungTeile | undefined {
  const t = alle.find((x) => x.id === fzId(v.id, key) && x.vehicleId === v.id);
  return t?.positionen.length ? t : undefined;
}

/** Positions of an Offerte from the Wartungsplan: per item the lines stored
    for this vehicle, else the generated Arbeit line. Every line carries its
    item's key, so what is entered can be stored again. */
export function wartungsOfferte(
  v: Vehicle, items: ServiceItem[], alle: WartungTeile[],
): { positionen: Position[]; wartung: OfferteWartung; uebernommen: string[] } {
  const texte = wartungsPositionen(items);
  const uebernommen: string[] = [];
  const vorbelegt: string[] = [];
  const zeilenFuer = (it: ServiceItem, i: number): Position[] => {
    const key = teilKey(it);
    const text = texte[i].beschreibung;
    const g = gespeicherteTeile(v, key, alle);
    const gespeichert = g?.positionen.filter((p) => key !== OHNE_MATERIAL || p.typ !== 'material') ?? [];
    if (gespeichert.length) {
      uebernommen.push(it.name);
      vorbelegt.push(key);
      // Material with its own ZE already carries the work: no extra Arbeit line
      // (neither the generated one nor a stored bare one without ZE).
      const zeImMaterial = gespeichert.some((p) => p.typ === 'material' && (parseFloat(p.ze ?? '') || 0) > 0);
      const zeilen = gespeichert
        .filter((p) => !(zeImMaterial && p.typ === 'arbeit' && p.autoText && !(parseFloat(p.ze) > 0)))
        .map(({ autoText, ...p }): Position =>
          p.typ === 'arbeit' ? { ...p, beschreibung: autoText ? text : p.beschreibung, wartung: key } : { ...p, wartung: key });
      // Only material entered on the vehicle, without ZE: the item still gets its Arbeit line.
      return zeImMaterial || zeilen.some((p) => p.typ === 'arbeit') ? zeilen : [...zeilen, { ...texte[i], wartung: key }];
    }
    return [{ ...texte[i], wartung: key }];
  };
  // Inspektion: the ZE set in the Wartungsplan go onto its Arbeit line.
  const positionen = items.flatMap((it, i) => mitInspektionZe(zeilenFuer(it, i), texte[i].beschreibung, inspektionZe(it)));
  return {
    positionen: materialZuerst(positionen),
    wartung: { vehicleId: v.id, items: items.map((it, i) => ({ key: teilKey(it), name: it.name, text: texte[i].beschreibung })), vorbelegt },
    uebernommen,
  };
}

/** A line as stored: without per-Offerte state; the generated Arbeit text is
    flagged instead of stored, so the next Offerte shows the current interval. */
function alsTeil(p: Position, text: string): TeilPosition {
  if (p.typ === 'material') {
    const { bestellt, wartung, ...m } = p as MaterialPosition;
    return m;
  }
  const { wartung, zeLoading, ...a } = p as ArbeitPosition;
  return a.beschreibung.trim() === text.trim() ? { ...a, beschreibung: '', autoText: true } : a;
}

/** Something was entered for the item: a part, or a line other than the bare generated one. */
const erfasst = (p: TeilPosition) =>
  p.typ === 'material' ? !!p.beschreibung.trim() || !!p.art : parseFloat(p.ze) > 0 || !p.autoText;

/** Changes to the stored positions after an Offerte from the Wartungsplan was
    saved, for its vehicle only: `speichern` = items whose entered lines differ
    from the stored ones; `loeschen` = ids of items whose stored lines were
    removed in this Offerte (they were pre-filled into it, or stored from it,
    and nothing is entered for the item anymore). A Materialofferte (parts
    without their working time) or an Offerte moved to another vehicle changes
    nothing. */
export function teileAusOfferte(
  o: Offerte, v: Vehicle | undefined, alle: WartungTeile[], von?: string,
): { speichern: WartungTeile[]; loeschen: string[] } {
  const leer = { speichern: [], loeschen: [] };
  const w = o.wartung;
  if (!w || !v || o.art === 'material' || v.id !== w.vehicleId || (o.vehicleId && o.vehicleId !== v.id)) return leer;
  const speichern: WartungTeile[] = [];
  const loeschen: string[] = [];
  for (const it of w.items) {
    const id = fzId(v.id, it.key);
    const alt = alle.find((t) => t.id === id);
    const eigene = (o.positionen ?? []).filter((p) => p.wartung === it.key).map((p) => alsTeil(p, it.text));
    // Inspektion: the stored material and its ZE stay as entered in the Wartungsplan.
    const positionen = it.key === OHNE_MATERIAL
      ? [...(alt?.positionen ?? []).filter((p) => p.typ === 'material'), ...ohneInspektionZe(eigene.filter((p) => p.typ !== 'material'))]
      : eigene;
    if (!positionen.some(erfasst)) {
      if (alt && (alt.offertId === o.id || w.vorbelegt?.includes(it.key))) loeschen.push(id);
      continue;
    }
    if (alt && JSON.stringify(alt.positionen) === JSON.stringify(positionen) && alt.name === it.name) continue;
    speichern.push({
      id, key: it.key, name: it.name, vehicleId: v.id,
      fahrzeug: [v.marke, v.modell, v.kennzeichen].filter(Boolean).join(' ') || undefined,
      positionen, offertId: o.id, updatedAt: new Date().toISOString(), von,
    });
  }
  return { speichern, loeschen };
}

/** Material rows stored for an item (parts and Versandkosten), in order. */
export function teileMaterial(t?: WartungTeile): MaterialPosition[] {
  return (t?.positionen ?? []).filter((p): p is MaterialPosition & { autoText?: boolean } => p.typ === 'material')
    .map(({ autoText, ...m }) => m);
}

/** Stored parts of a vehicle's item with the material entered directly in the
    Wartungsplan: the item's other stored lines (Arbeit) are kept, the material
    rows replaced by `material` (empty descriptions dropped). `null` when
    nothing entered remains, i.e. the stored row is to be removed. Strictly
    for this vehicle: id `fz:<vehicleId>:<key>`. */
export function teileMitMaterial(
  v: Vehicle, item: ServiceItem, material: MaterialPosition[], alt: WartungTeile | undefined, von?: string,
): WartungTeile | null {
  const key = teilKey(item);
  const andere = (alt?.positionen ?? []).filter((p) => p.typ !== 'material');
  // Inspektion: its ZE are now kept on the item itself (arbeitZe), not on a stored line.
  const rest = key === OHNE_MATERIAL ? ohneInspektionZe(andere) : andere;
  const neu: TeilPosition[] = material
    .filter((m) => m.beschreibung.trim())
    .map(({ bestellt, wartung, link, ...m }) => {
      const href = parsePartLink(link)?.href;
      return { ...m, beschreibung: m.beschreibung.trim(), ...(href ? { link: href } : {}) };
    });
  const positionen = [...neu, ...rest];
  if (!positionen.some(erfasst)) return null;
  return {
    id: fzId(v.id, key), key, name: item.name, vehicleId: v.id,
    fahrzeug: [v.marke, v.modell, v.kennzeichen].filter(Boolean).join(' ') || undefined,
    // Entered on the vehicle, not from an Offerte: an older Offerte re-saved without
    // lines for the item does not clear it.
    positionen, updatedAt: new Date().toISOString(), von,
  };
}
