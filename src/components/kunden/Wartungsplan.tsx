import { useEffect, useRef, useState } from 'react';
import Sheet from '../ui/Sheet';
import { SFCheckmark, SFClock, SFPencil, SFPlus, SFXmark } from '../Icons';
import { formatDateCH, parsePartLink } from '../../lib/utils';
import { todayISO } from '../../lib/offerte-docs';
import {
  NACHWEIS, eintragNachweis, faelligVonHand, formatKm, letzterBeleg, letzterService, letztenServiceSetzen, naechsteFaelligkeit,
  neueServiceId, ohneEntfernteService, serviceErledigt, serviceZuruecksetzen, serviceZustand, type ServiceZustand,
} from '../../lib/vehicles';
import {
  GETRIEBE, HINWEIS_STANDARD, abgleichBericht, fahrzeugProfil, istInspektion, konfigSchluessel, labelVon, mitWartungsplan, profilSignatur, quelleVon, specId, specVariante,
  vorlageVon, wartungsVorlagen, type AbgleichBericht, type FahrzeugProfil, type QuelleAnzeige, type Vorlage,
} from '../../lib/wartung';
import { exportWartungsplanPDF } from '../../lib/pdf-wartungsplan';
import { fzId, gespeicherteTeile, teilKey, teileMaterial, teileMitMaterial } from '../../lib/wartung-teile';
import { setMaterialFeld } from '../../lib/marge';
import { materialPreis } from '../../lib/ze';
import { getMargin } from '../../lib/settings';
import { LookupError, intervalleRecherchieren, lookupKonfiguriert, rechercheAnwenden, type LookupBericht } from '../../lib/wartung-lookup';
import { useApp } from '../../context/AppContext';
import type { Customer, FahrzeugFeld, IntervallQuelle, MaterialPosition, Nachweis, Order, ServiceItem, Vehicle, WartungSpec, WartungTeile } from '../../types';

/** Status groups, in display order. "Jetzt fällig" = overdue or due soon;
    "Fälligkeit unbekannt" = no last service / due value entered (nothing assumed). */
type Gruppe = 'faellig' | 'unbekannt' | 'geplant' | 'erledigt';
const GRUPPE_VON: Record<ServiceZustand, Gruppe> = {
  ueberfaellig: 'faellig', bald: 'faellig', unbekannt: 'unbekannt', faellig: 'geplant', gemacht: 'erledigt',
};
const GRUPPEN: { key: Gruppe; label: string; dot: string }[] = [
  { key: 'faellig',   label: 'Jetzt fällig',         dot: 'var(--orange)' },
  { key: 'unbekannt', label: 'Fälligkeit unbekannt', dot: 'var(--label3)' },
  { key: 'geplant',   label: 'In Zukunft fällig',    dot: 'var(--accent)' },
  { key: 'erledigt',  label: 'Erledigt',             dot: 'var(--green)' },
];
const RANG: Record<ServiceZustand, number> = { ueberfaellig: 0, bald: 1, unbekannt: 2, faellig: 3, gemacht: 4 };

/** Status badge of a tile: tinted background + coloured text. */
const BADGE: Record<ServiceZustand, { label: string; cls: string }> = {
  ueberfaellig: { label: 'Überfällig',  cls: 'sp-badge-red' },
  bald:         { label: 'Bald fällig', cls: 'sp-badge-orange' },
  unbekannt:    { label: 'Letzter Service fehlt', cls: 'sp-badge-orange' },
  faellig:      { label: 'In Zukunft',  cls: 'sp-badge-accent' },
  gemacht:      { label: 'Erledigt',    cls: 'sp-badge-green' },
};

/** Source of an interval: checked against the OEM schedule, manufacturer Richtwert, generic Standardwert. */
const QUELLE: Record<QuelleAnzeige, { label: string; dot: string }> = {
  geprueft:  { label: 'Herstellervorgabe geprüft', dot: 'var(--green)' },
  recherchiert: { label: 'Herstellervorgabe recherchiert', dot: 'var(--green)' },
  richtwert: { label: 'Richtwert – prüfen',        dot: 'var(--accent)' },
  standard:  { label: 'Standardwert – prüfen',     dot: 'var(--orange)' },
  eigen:     { label: 'Eigener Wert – nicht geprüft', dot: 'var(--label3)' },
};

/** Last service known, but without a record (workshop, service book, invoice). */
const ohneBeleg = (it: ServiceItem) => letzterBeleg(it)?.belegt === false;

/** Which part of the editor to jump to. */
type EditorFokus = 'intervall' | 'letzte' | 'naechste' | 'material';

interface PruefhinweisProps {
  profil: FahrzeugProfil;
  /** Items whose interval is only a Richtwert / Standardwert. */
  ungeprueft: ServiceItem[];
  /** Open items without a last service or due value. */
  unbekannt: ServiceItem[];
  /** Items whose last service has no record (customer's word / entered without proof). */
  unbelegt: ServiceItem[];
  onFahrzeug?: (feld: FahrzeugFeld) => void;
  onPosition: (it: ServiceItem, fokus: EditorFokus) => void;
}

/** What is missing, assumed or unverified, each with a shortcut to the field
    that settles it. Stays visible until the data is entered / checked. */
function Pruefhinweis({ profil, ungeprueft, unbekannt, unbelegt, onFahrzeug, onPosition }: PruefhinweisProps) {
  // Vehicle data only assumed, not entered: the field to confirm it in
  // (fields already listed as missing are not repeated).
  const annahmen = ([
    profil.steuertriebQuelle === 'marke' && { label: 'Steuerkette (nach Marke)', feld: 'steuertrieb' },
    profil.erkannt.antrieb && { label: 'Antrieb (aus Modell/Motor)', feld: 'antrieb' },
    profil.erkannt.getriebe && { label: 'Getriebe (aus Modell/Motor)', feld: 'getriebe' },
  ].filter(Boolean) as { label: string; feld: FahrzeugFeld }[]).filter((a) => !profil.fehltFelder.includes(a.feld));
  if (!profil.fehlt.length && !annahmen.length && !ungeprueft.length && !unbekannt.length && !unbelegt.length) return null;
  return (
    <div className="sp-hinweis sp-pruefen" role="note">
      {profil.fehlt.length > 0 && (
        <div className="sp-pruefen-zeile">
          <span>Für exakte Herstellervorgaben fehlt: <strong>{profil.fehlt.join(', ')}</strong>.</span>
          {onFahrzeug && profil.fehltFelder.map((feld, i) => (
            <button key={feld} type="button" className="sp-text-btn" onClick={() => onFahrzeug(feld)}>{profil.fehlt[i]} erfassen</button>
          ))}
        </div>
      )}
      {annahmen.length > 0 && (
        <div className="sp-pruefen-zeile">
          <span>Angenommen, nicht erfasst: {annahmen.map((a) => a.label).join(', ')}.</span>
          {onFahrzeug && <button type="button" className="sp-text-btn" onClick={() => onFahrzeug(annahmen[0].feld)}>Bestätigen</button>}
        </div>
      )}
      {ungeprueft.length > 0 && (
        <div className="sp-pruefen-zeile">
          <span>{ungeprueft.length === 1 ? '1 Intervall ist' : `${ungeprueft.length} Intervalle sind`} nur Richt- oder Standardwert, nicht mit der Herstellervorgabe geprüft.</span>
          <button type="button" className="sp-text-btn" onClick={() => onPosition(ungeprueft[0], 'intervall')}>{ungeprueft[0].name} prüfen</button>
        </div>
      )}
      {unbekannt.length > 0 && (
        <div className="sp-pruefen-zeile">
          <span>{unbekannt.length === 1 ? '1 Position hat' : `${unbekannt.length} Positionen haben`} weder letzten Service noch nächste Fälligkeit – es wird nichts angenommen. Letzten Service aus Serviceheft oder Rechnung nachtragen.</span>
          <button type="button" className="sp-text-btn" onClick={() => onPosition(unbekannt[0], 'letzte')}>{unbekannt[0].name} nachtragen</button>
        </div>
      )}
      {unbelegt.length > 0 && (
        <div className="sp-pruefen-zeile">
          <span>{unbelegt.length === 1 ? '1 letzter Service ist' : `${unbelegt.length} letzte Services sind`} ohne Beleg erfasst.</span>
          <button type="button" className="sp-text-btn" onClick={() => onPosition(unbelegt[0], 'letzte')}>{unbelegt[0].name} belegen</button>
        </div>
      )}
    </div>
  );
}

const teil = (n: string[], was: string) => (n.length ? `${was}: ${n.join(', ')}` : '');

/** Result of "Intervalle aktualisieren": the local match, then the lookup. */
interface Bericht {
  abgleich: AbgleichBericht;
  lookup?: LookupBericht;
  /** Why the lookup didn't run / failed. */
  fehler?: string;
  hinweis?: string;
  /** Items still without a last service: no next due date / km yet. */
  ohneLetzten: string[];
}

/** Lines of the summary, most important first. */
function berichtZeilen(b: Bericht): { text: string; ton?: 'ok' | 'warn' }[] {
  const l = b.lookup;
  const z: { text: string; ton?: 'ok' | 'warn' }[] = [];
  if (l) {
    if (l.belegt.length) z.push({ text: teil(l.belegt, `Herstellervorgabe mit Quelle übernommen (${l.belegt.length})`), ton: 'ok' });
    if (l.entfernt.length) z.push({ text: teil(l.entfernt, 'Entfällt laut Quelle, entfernt'), ton: 'ok' });
    if (l.entfaelltPruefen.length) z.push({ text: teil(l.entfaelltPruefen, 'Entfällt laut Quelle – hat Einträge, bitte prüfen'), ton: 'warn' });
    if (l.offen.length) z.push({ text: teil(l.offen, `Keine verlässliche Quelle gefunden, Richtwert bleibt – prüfen (${l.offen.length})`), ton: 'warn' });
    if (l.behalten.length) z.push({ text: teil(l.behalten, 'Geprüft / eigener Wert, unverändert') });
  }
  if (b.fehler) z.push({ text: `Recherche nicht möglich: ${b.fehler}`, ton: 'warn' });
  const a = b.abgleich;
  if (a.neu.length) z.push({ text: teil(a.neu, 'Ergänzt') });
  if (a.entfernt.length) z.push({ text: teil(a.entfernt, 'Entfällt für dieses Fahrzeug') });
  if (!l && a.intervall.length) z.push({ text: teil(a.intervall, 'Intervall angepasst') });
  if (b.ohneLetzten.length) z.push({ text: teil(b.ohneLetzten, 'Letzter Service fehlt (für nächste Fälligkeit erfassen)'), ton: 'warn' });
  if (b.hinweis) z.push({ text: b.hinweis });
  return z.length ? z : [{ text: 'Wartungsplan ist aktuell – nichts geändert.' }];
}

/** "05/2027" */
const monatJahr = (iso: string) => { const [y, m] = iso.split('-'); return `${m}/${y}`; };

/** "15'000 km · 12 Mt." / "100'000 km · 11/2027" / "17.11.2026 · 85'000 km" */
const intervallText = (i: ServiceItem) =>
  [i.intervallKm ? `${formatKm(i.intervallKm)} km` : '', i.intervallMonate ? `${i.intervallMonate} Mt.` : ''].filter(Boolean).join(' · ');
const naechsteText = (i: ServiceItem) => {
  const n = naechsteFaelligkeit(i);
  return [n.km != null ? `${formatKm(n.km)} km` : '', n.datum ? monatJahr(n.datum) : ''].filter(Boolean).join(' · ');
};
const datumKm = (datum?: string, km?: string) =>
  [datum ? formatDateCH(datum) : '', km ? `${formatKm(km)} km` : ''].filter(Boolean).join(' · ');

interface WartungsplanProps {
  vehicle: Vehicle;
  /** Owner of the vehicle, named on the PDF. */
  customer: Customer;
  /** Stores the vehicle with the changed plan / mileage. */
  onSave: (v: Vehicle) => Promise<void>;
  /** Creates a draft Offerte from the due items and opens it. */
  onOfferte: (items: ServiceItem[]) => Promise<void>;
  /** Opens the vehicle form at a missing field (e.g. Getriebe). */
  onFahrzeugBearbeiten?: (feld: FahrzeugFeld) => void;
  /** The vehicle's Aufträge: a service entry can be linked to the one it was done in. */
  auftraege?: Order[];
  onAuftrag?: (o: Order) => void;
}

/** Automatic lookups already tried this session ("<vehicle id>|<konfigSchluessel>"). */
const autoVersucht = new Set<string>();

/** Wartungsplan of a vehicle: one tile per service item (two columns on wide
    screens), grouped into Jetzt fällig / In Zukunft fällig / Erledigt. A tile
    shows interval and next due; its status switch sets "Gemacht" (ticked off
    today at the current mileage) or "In Zukunft" in one tap. Details, history
    and undo live in the editor behind the pencil. Due dates / mileages follow
    from the last service plus the interval. */
export default function Wartungsplan({ vehicle, customer, onSave, onOfferte, onFahrzeugBearbeiten, auftraege = [], onAuftrag }: WartungsplanProps) {
  const { wartungSpecs, saveWartungSpec, wartungTeile, wartungTeileSetzen, token, userEmail } = useApp();
  const items = ohneEntfernteService(vehicle.service ?? []);
  const profil = fahrzeugProfil(vehicle);
  const vorlagen = wartungsVorlagen(vehicle, wartungSpecs);
  // The Inspektion shows the oil change's Vorlage: same interval, same source.
  const vorlageZu = (it: ServiceItem) => vorlagen.find((x) => x.key === (istInspektion(it) ? 'oel' : vorlageVon(it)));
  const [edit, setEdit] = useState<{ item: ServiceItem; neu: boolean; fokus?: EditorFokus } | null>(null);
  const [km, setKm] = useState(vehicle.km ?? '');
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<Vehicle>) {
    if (busy) return;
    setBusy(true);
    try { await onSave({ ...vehicle, ...patch }); }
    catch { /* toast shown by the context */ }
    finally { setBusy(false); }
  }
  const setItems = (service: ServiceItem[]) => save({ service });
  const ersetze = (it: ServiceItem) => items.map((x) => (x.id === it.id ? it : x));

  // The current mileage is entered at the visit; it dates every item ticked off.
  const kmAktuell = km.trim() || vehicle.km;
  function saveKm() {
    if (km.trim() !== (vehicle.km ?? '')) void save({ km: km.trim() || undefined });
  }

  const gemacht = (it: ServiceItem) =>
    save({ km: kmAktuell || undefined, service: ersetze(serviceErledigt(it, todayISO(), kmAktuell)) });
  const vormerken = (it: ServiceItem) => setItems(ersetze({ ...it, status: 'faellig' }));

  /** `teilen`: the checked interval becomes the one of every vehicle with this Motorkennbuchstabe. */
  async function speichern(it: ServiceItem, teilen: boolean, material: MaterialPosition[]) {
    const service = edit?.neu ? [...items, it] : ersetze(it);
    const vorher = edit && !edit.neu ? edit.item : undefined;
    setEdit(null);
    void materialSpeichern(it, vorher, material);
    const key = vorlageVon(it);
    const variante = key ? specVariante(key, vehicle) : null;
    if (!teilen || !key || variante === null || !profil.motorcode || it.quelle !== 'geprueft') { void setItems(service); return; }
    const spec: WartungSpec = {
      id: specId(profil.hersteller, profil.motorcode, key, variante), hersteller: profil.hersteller, motorcode: profil.motorcode, vorlage: key,
      ...(variante ? { variante } : {}),
      intervallKm: it.intervallKm, intervallMonate: it.intervallMonate, quelleText: it.quelleText, geprueftAm: it.geprueftAm ?? todayISO(),
    };
    try { await saveWartungSpec(spec); } catch { return; /* toast shown by the context */ }
    // This plan already carries the checked interval: it stays matched to the profile.
    const specs = [...wartungSpecs.filter((x) => x.id !== spec.id), spec];
    void save({ service, wartungsprofil: profilSignatur(vehicle, specs) });
  }
  /** Material entered on the item: stored for this vehicle only (lib/wartung-teile),
      inserted into every Offerte from this Wartungsplan. Only writes on a change;
      a renamed own item moves its parts to the new key. Never touches the plan. */
  async function materialSpeichern(it: ServiceItem, vorher: ServiceItem | undefined, material: MaterialPosition[]) {
    const altKey = teilKey(vorher ?? it);
    const alt = gespeicherteTeile(vehicle, altKey, wartungTeile);
    const sauber = (m: MaterialPosition[]) =>
      JSON.stringify(m.filter((x) => x.beschreibung.trim()).map(({ bestellt, wartung, ...x }) => ({ ...x, beschreibung: x.beschreibung.trim() })));
    const umbenannt = altKey !== teilKey(it);
    if (!umbenannt && sauber(material) === sauber(teileMaterial(alt))) return;
    const neu = teileMitMaterial(vehicle, it, material, alt, userEmail ?? undefined);
    try {
      if (umbenannt && alt) await wartungTeileSetzen(fzId(vehicle.id, altKey), null);
      await wartungTeileSetzen(fzId(vehicle.id, teilKey(it)), neu);
    } catch { /* toast shown by the context */ }
  }
  function rueckgaengig(it: ServiceItem) {
    void setItems(ersetze(serviceZuruecksetzen(it)));
    setEdit(null);
  }
  function entfernen(it: ServiceItem) {
    if (!window.confirm(`"${it.name}" aus dem Wartungsplan entfernen?`)) return;
    void setItems(items.filter((x) => x.id !== it.id));
    setEdit(null);
  }
  const neuePosition = () => setEdit({ item: { id: neueServiceId(), name: '', status: 'faellig' }, neu: true });

  // The plan follows the vehicle's technical data (lib/wartung). Plans made
  // before that, or before the data changed, can be matched on request.
  const anlegen = () => save(mitWartungsplan({ ...vehicle, service: undefined }, undefined, wartungSpecs));
  const veraltet = items.length > 0 && vehicle.wartungsprofil !== profilSignatur(vehicle, wartungSpecs);
  // "Intervalle aktualisieren": match the plan to the vehicle, then research
  // the manufacturer's intervals for this exact configuration. Recorded
  // services, own positions and own / checked intervals always stay.
  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [recherche, setRecherche] = useState(false);
  const schluessel = konfigSchluessel(vehicle);
  async function anpassen() {
    if (busy || recherche) return;
    setBericht(null);
    const lokal = mitWartungsplan({ ...vehicle, service: items }, undefined, wartungSpecs);
    const lokalItems = ohneEntfernteService(lokal.service ?? []);
    const b: Bericht = { abgleich: abgleichBericht(items, lokalItems), ohneLetzten: [] };
    let neu: Vehicle = lokal;
    const ok = await lookupKonfiguriert();
    if (!ok) b.fehler = ok === false ? 'KI-Recherche ist nicht eingerichtet (GEMINI_API_KEY in Vercel fehlt).' : 'Server nicht erreichbar.';
    else if (!token) b.fehler = 'nicht angemeldet.';
    else {
      setRecherche(true);
      try {
        const r = await intervalleRecherchieren(lokal, lokalItems, token);
        const x = rechercheAnwenden(lokalItems, r, lokal);
        b.lookup = x.bericht;
        b.hinweis = r.hinweis || undefined;
        if (r.fehler) b.fehler = r.fehler;
        neu = { ...lokal, service: x.items, wartungsRecherche: { schluessel, am: todayISO(), belegt: x.bericht.belegt.length, offen: x.bericht.offen.length } };
      } catch (e) {
        b.fehler = e instanceof LookupError || e instanceof Error ? e.message : 'unbekannter Fehler';
      } finally { setRecherche(false); }
    }
    b.ohneLetzten = (neu.service ?? []).filter((i) => serviceZustand(i, neu) === 'unbekannt').map((i) => i.name);
    await save(neu);
    setBericht(b);
  }
  // Never on page load: the lookup runs on "Intervalle aktualisieren", or on its
  // own only after the vehicle's specs changed (a lookup exists for other specs,
  // or the specs were edited while this plan is open) and these specs have no
  // lookup yet. At most once per vehicle + configuration per session, so a
  // failed attempt (e.g. rate limit) is not repeated on every visit.
  const schluesselBeimOeffnen = useRef(schluessel);
  useEffect(() => {
    if (!items.length || profil.fehlt.length || vehicle.wartungsRecherche?.schluessel === schluessel) return;
    const geaendert = (!!vehicle.wartungsRecherche && vehicle.wartungsRecherche.schluessel !== schluessel) || schluesselBeimOeffnen.current !== schluessel;
    const id = `${vehicle.id}|${schluessel}`;
    if (!geaendert || autoVersucht.has(id)) return;
    autoVersucht.add(id);
    void lookupKonfiguriert().then((ok) => { if (ok) void anpassen(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id, schluessel, items.length, profil.fehlt.length, vehicle.wartungsRecherche?.schluessel]);

  const mitZustand = items
    .map((item) => ({ item, zustand: serviceZustand(item, vehicle) }))
    .sort((a, b) => RANG[a.zustand] - RANG[b.zustand]);
  const faellige = mitZustand.filter((x) => GRUPPE_VON[x.zustand] === 'faellig').map((x) => x.item);
  const ungeprueft = mitZustand.map((x) => x.item).filter((it) => !istInspektion(it)).filter((it) => {
    const q = quelleVon(it, vorlageZu(it));
    return q === 'richtwert' || q === 'standard';
  });
  const unbekannt = mitZustand.filter((x) => x.zustand === 'unbekannt').map((x) => x.item);
  const unbelegt = mitZustand.map((x) => x.item).filter(ohneBeleg);
  const pruefhinweis = (
    <Pruefhinweis
      profil={profil} ungeprueft={ungeprueft} unbekannt={unbekannt} unbelegt={unbelegt} onFahrzeug={onFahrzeugBearbeiten}
      onPosition={(item, fokus) => setEdit({ item, neu: false, fokus })}
    />
  );

  // Positions picked for the Offerte. Without a pick it covers the due items.
  // Picking and quoting never touch the plan: only "Gemacht" advances an interval.
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set());
  const ausgewaehlt = mitZustand.filter((x) => auswahl.has(x.item.id)).map((x) => x.item);
  const offerteItems = ausgewaehlt.length ? ausgewaehlt : faellige;
  const umschalten = (id: string) => setAuswahl((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const gruppeUmschalten = (ids: string[], alle: boolean) => setAuswahl((s) => {
    const n = new Set(s);
    ids.forEach((id) => (alle ? n.delete(id) : n.add(id)));
    return n;
  });

  async function offerteErstellen() {
    if (busy || !offerteItems.length) return;
    setBusy(true);
    try { await onOfferte(offerteItems); setAuswahl(new Set()); }
    catch { /* toast shown by the context */ }
    finally { setBusy(false); }
  }

  const sheet = edit && (
    <WartungsplanEditor
      item={edit.item} neu={edit.neu} fokus={edit.fokus} busy={busy} vorlage={vorlageZu(edit.item)} motorcode={profil.motorcode} vehicle={vehicle}
      teile={edit.neu ? undefined : gespeicherteTeile(vehicle, teilKey(edit.item), wartungTeile)}
      oelVorhanden={items.some((x) => vorlageVon(x) === 'oel')}
      auftraege={auftraege} onAuftrag={onAuftrag}
      onSave={(it, teilen, material) => void speichern(it, teilen, material)} onUndo={() => rueckgaengig(edit.item)} onDelete={() => entfernen(edit.item)} onClose={() => setEdit(null)}
    />
  );

  if (!items.length) {
    return (
      <div className="sp sp-empty">
        <p>Noch kein Wartungsplan. Für dieses Fahrzeug passen: {vorlagen.map((x) => x.name).join(', ')} – mit Richtwerten nach Marke, Motor, Antrieb und Getriebe. Jedes Intervall ist als Standardwert, Richtwert oder geprüfte Herstellervorgabe markiert und anpassbar.</p>
        {pruefhinweis}
        <button className="btn-system btn-primary" disabled={busy} onClick={anlegen}>Wartungsplan anlegen</button>
        <button className="sp-text-btn" disabled={busy} onClick={neuePosition}><SFPlus size={12} /> Eigene Position</button>
        {sheet}
      </div>
    );
  }

  return (
    <div className="sp">
      <div className="sp-bar">
        <label className="sp-km">
          <span>KM-Stand heute</span>
          <input
            className="cf-input" type="number" inputMode="numeric" value={km} placeholder="85000" autoComplete="off"
            onChange={(e) => setKm(e.target.value)} onBlur={saveKm}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <button
          className="sp-text-btn" disabled={busy || recherche} onClick={() => void anpassen()}
          title="Positionen an das Fahrzeug anpassen und die Herstellervorgaben für genau diese Konfiguration recherchieren. Erfasste Services, eigene Positionen und eigene / geprüfte Intervalle bleiben."
        >
          {recherche ? 'Recherchiere …' : veraltet ? 'An Fahrzeug anpassen' : 'Intervalle aktualisieren'}
        </button>
        <button className="sp-text-btn" disabled={busy} onClick={neuePosition}><SFPlus size={12} /> Position</button>
        <button className="sp-text-btn" onClick={() => void exportWartungsplanPDF(vehicle, customer)} title="Wartungsplan als PDF herunterladen">PDF</button>
        <button
          className="btn-tinted sp-offerte" disabled={busy || !offerteItems.length} onClick={offerteErstellen}
          title={ausgewaehlt.length
            ? `Offerte mit ${ausgewaehlt.length} ausgewählten Positionen erstellen`
            : faellige.length ? `Offerte mit ${faellige.length} fälligen Positionen erstellen` : 'Positionen auswählen'}
        >
          Offerte erstellen
          <span className="sp-offerte-count">{offerteItems.length}</span>
        </button>
      </div>
      {recherche && (
        <div className="sp-auswahl" role="status" aria-live="polite">
          <span>Herstellervorgaben für {[vehicle.marke, vehicle.modell, vehicle.motorcode].filter(Boolean).join(' ')} werden recherchiert … das dauert bis zu 2 Minuten.</span>
        </div>
      )}
      {veraltet && !bericht && !recherche && (
        <div className="sp-auswahl" role="status">
          <span>Fahrzeugdaten oder geprüfte Intervalle haben sich geändert.</span>
          <button className="sp-text-btn" disabled={busy} onClick={() => void anpassen()}>Jetzt anpassen</button>
        </div>
      )}
      {bericht && (
        <div className="sp-auswahl sp-bericht" role="status">
          <ul>
            {berichtZeilen(bericht).map((z, i) => (
              <li key={i}>
                <span className="dot" style={{ background: z.ton === 'ok' ? 'var(--green)' : z.ton === 'warn' ? 'var(--orange)' : 'var(--label3)' }} />
                {z.text}
              </li>
            ))}
          </ul>
          <button className="sp-text-btn" onClick={() => setBericht(null)}>OK</button>
        </div>
      )}
      {ausgewaehlt.length > 0 && (
        <div className="sp-auswahl" role="status">
          <span>{ausgewaehlt.length} {ausgewaehlt.length === 1 ? 'Position' : 'Positionen'} ausgewählt</span>
          <button className="sp-text-btn" disabled={busy} onClick={() => setAuswahl(new Set())}>Auswahl aufheben</button>
        </div>
      )}
      {pruefhinweis}

      {GRUPPEN.map(({ key, label, dot }) => {
        const tiles = mitZustand.filter((x) => GRUPPE_VON[x.zustand] === key);
        if (!tiles.length) return null;
        const farbe = key === 'faellig' && tiles.some((x) => x.zustand === 'ueberfaellig') ? 'var(--red)' : dot;
        const ids = tiles.map((x) => x.item.id);
        const alle = ids.every((id) => auswahl.has(id));
        return (
          <section key={key} className="sp-group" aria-label={label}>
            <h4 className="sp-group-head">
              <span className="dot" style={{ background: farbe }} />
              {label}
              <span className="sp-group-count">{tiles.length}</span>
              <button type="button" className="sp-group-select" onClick={() => gruppeUmschalten(ids, alle)}>
                {alle ? 'Keine' : 'Alle wählen'}
              </button>
            </h4>
            <ul className="sp-grid">
              {tiles.map(({ item, zustand }) => (
                <WartungsplanKachel
                  key={item.id} item={item} naechste={naechsteText(item)} zustand={zustand} busy={busy}
                  vorlage={vorlageZu(item)}
                  teile={gespeicherteTeile(vehicle, teilKey(item), wartungTeile)}
                  selected={auswahl.has(item.id)}
                  onSelect={() => umschalten(item.id)}
                  onGemacht={() => gemacht(item)}
                  onVormerken={() => vormerken(item)}
                  onOpen={(fokus) => setEdit({ item, neu: false, fokus })}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {sheet}
    </div>
  );
}

interface KachelProps {
  item: ServiceItem;
  /** Next due mileage / date, stored or derived (naechsteFaelligkeit). */
  naechste: string;
  zustand: ServiceZustand;
  busy: boolean;
  /** The Vorlage the item was made from: source and what to check. */
  vorlage?: Vorlage;
  /** Positions entered for this item in an earlier Offerte (lib/wartung-teile). */
  teile?: WartungTeile;
  /** Picked for the Offerte. */
  selected: boolean;
  onSelect: () => void;
  onGemacht: () => void;
  onVormerken: () => void;
  onOpen: (fokus?: EditorFokus) => void;
}

/** Tile: name + badge · Intervall / Nächste · status switch + pencil.
    "Gemacht" ticks the item off (again, when it is due); "In Zukunft" flags a
    done item as upcoming. The active side shows the current status. */
function WartungsplanKachel({ item, naechste, zustand, busy, vorlage, teile, selected, onSelect, onGemacht, onVormerken, onOpen }: KachelProps) {
  const badge = BADGE[zustand];
  const intervall = intervallText(item);
  const zuletzt = datumKm(item.letztesDatum, item.letzteKm);
  const beleg = letzterBeleg(item);
  const istGemacht = zustand === 'gemacht';
  const istZukunft = zustand === 'faellig';
  const q = quelleVon(item, vorlage);
  const quelle = q && QUELLE[q];
  const naechsteVonHand = faelligVonHand(item);
  const material = teileMaterial(teile);
  const quelleTitel = q === 'geprueft'
    ? [item.quelleText, item.geprueftAm && `geprüft ${formatDateCH(item.geprueftAm)}`].filter(Boolean).join(' · ') || undefined
    : q === 'recherchiert' ? [item.quelleText, item.quelleUrl].filter(Boolean).join(' – ')
    : vorlage?.hinweis ?? HINWEIS_STANDARD;

  return (
    <li className={`sp-tile sp-tile-${zustand}${selected ? ' sp-tile-selected' : ''}`}>
      <div className="sp-tile-head">
        <label className="sp-select" title="Für Offerte auswählen">
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`${item.name} für Offerte auswählen`} />
          <span className="sp-name">{item.name}</span>
        </label>
        <span className={`sp-badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Empty values are never filled in by assumption: "Erfassen" opens the field. */}
      <dl className="sp-facts">
        <div>
          <dt>Intervall</dt>
          <dd>{intervall || <button type="button" className="sp-erfassen" onClick={() => onOpen('intervall')}>Erfassen</button>}</dd>
        </div>
        <div>
          <dt>Nächste{naechsteVonHand && <span className="sp-dt-hint"> · von Hand</span>}</dt>
          <dd title={naechste ? (naechsteVonHand ? 'Von Hand gesetzt' : 'Letzter Service + Intervall') : undefined}>
            {naechste || (istGemacht
              ? <span className="sp-leer">–</span>
              : <button type="button" className="sp-erfassen" onClick={() => onOpen('naechste')} title="Letzten Service oder nächste Fälligkeit eintragen">Erfassen</button>)}
          </dd>
        </div>
      </dl>
      {/* Three separate facts: proof of the last service, source of the interval, note. */}
      {zuletzt && beleg && (
        <p className="sp-quelle" title={beleg.label}>
          <span className="dot" style={{ background: beleg.farbe }} />
          Zuletzt {zuletzt} · {beleg.kurz}
        </p>
      )}
      {quelle && (
        <p className="sp-quelle" title={quelleTitel}>
          <span className="dot" style={{ background: quelle.dot }} />
          {quelle.label}{(q === 'geprueft' || q === 'recherchiert') && item.quelleText ? ` · ${item.quelleText}` : ''}
        </p>
      )}
      <p className="sp-quelle" title="Wird beim Erstellen der Offerte für dieses Fahrzeug unter Material eingefügt">
        <span className="dot" style={{ background: material.length ? 'var(--accent)' : 'var(--label4)' }} />
        {material.length ? `Material: ${material.map((m) => m.beschreibung).join(', ')}` : 'Kein Material gespeichert'}
        {' · '}
        <button type="button" className="sp-erfassen" onClick={() => onOpen('material')}>{material.length ? 'Bearbeiten' : 'Erfassen'}</button>
      </p>
      {item.notiz && <p className="sp-foot">{item.notiz}</p>}

      <div className="sp-tile-actions">
        <div className="sp-switch" role="group" aria-label={`Status ${item.name}`}>
          <button
            className={`sp-switch-btn sp-switch-done${istGemacht ? ' active' : ''}`} aria-pressed={istGemacht}
            disabled={busy || istGemacht} onClick={onGemacht}
          >
            <span aria-hidden="true"><SFCheckmark /></span> Gemacht
          </button>
          <button
            className={`sp-switch-btn${istZukunft ? ' active' : ''}`} aria-pressed={istZukunft}
            disabled={busy || !istGemacht} onClick={onVormerken}
            title={istGemacht ? 'Wieder als in Zukunft fällig vormerken' : undefined}
          >
            <span aria-hidden="true"><SFClock size={13} /></span> In Zukunft
          </button>
        </div>
        <button className="sp-icon-btn" onClick={() => onOpen()} aria-label={`${item.name} bearbeiten`} title="Bearbeiten">
          <span aria-hidden="true"><SFPencil size={15} /></span>
        </button>
      </div>
    </li>
  );
}

interface EditorProps {
  item: ServiceItem;
  neu: boolean;
  /** Section to jump to on open. */
  fokus?: EditorFokus;
  busy: boolean;
  /** The Vorlage the item was made from: hint on what to check. */
  vorlage?: Vorlage;
  /** The vehicle's Motorkennbuchstabe: a checked interval can be stored for it. */
  motorcode?: string;
  /** Gearbox / drivetrain a checked interval is stored for (specVariante). */
  vehicle: Vehicle;
  /** Parts stored for this item and vehicle (lib/wartung-teile). */
  teile?: WartungTeile;
  /** The plan has a "Motoröl & Ölfilter" item: the Inspektion takes its interval. */
  oelVorhanden: boolean;
  /** The vehicle's Aufträge, to link a service entry to. */
  auftraege: Order[];
  onAuftrag?: (o: Order) => void;
  /** `teilen`: store the checked interval for every vehicle with this Motorkennbuchstabe;
      `material`: the item's material rows for Offerten of this vehicle. */
  onSave: (it: ServiceItem, teilen: boolean, material: MaterialPosition[]) => void;
  /** Undoes the last "Gemacht". */
  onUndo: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const leeresMaterial = (): MaterialPosition => ({ typ: 'material', beschreibung: '', menge: '1', stueckpreis: '', preis: '' });

function WartungsplanEditor({ item, neu, fokus, busy, vorlage, motorcode, vehicle, teile, oelVorhanden, auftraege, onAuftrag, onSave, onUndo, onDelete, onClose }: EditorProps) {
  const fokusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fokusRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, []);
  const ohneBasis = !neu && !item.letztesDatum && !item.letzteKm && !item.faelligDatum && !item.faelligKm;
  const [f, setF] = useState({
    name: item.name,
    intervallKm: item.intervallKm ? String(item.intervallKm) : '',
    intervallMonate: item.intervallMonate ? String(item.intervallMonate) : '',
    letztesDatum: item.letztesDatum ?? '',
    letzteKm: item.letzteKm ?? '',
    faelligDatum: item.faelligDatum ?? '',
    faelligKm: item.faelligKm ?? '',
    notiz: item.notiz ?? '',
    quelleText: item.quelleText ?? '',
  });
  // Proof of the last service. A new entry starts at the least trusted one:
  // nothing counts as documented unless picked.
  const alt = letzterService(item);
  const [nachweis, setNachweis] = useState<Nachweis>(alt?.nachweis ?? 'kunde');
  const [auftragId, setAuftragId] = useState(alt?.auftragId ?? '');
  const [geprueft, setGeprueft] = useState(item.quelle === 'geprueft');
  const [teilen, setTeilen] = useState(true);
  // Material for Offerten of this vehicle: only what is entered here, nothing assumed.
  const [material, setMaterial] = useState<MaterialPosition[]>(() => {
    const m = teileMaterial(teile);
    return m.length ? m : fokus === 'material' ? [leeresMaterial()] : [];
  });
  const updM = (i: number, k: string, v: string) => setMaterial((rows) => rows.map((m, j) => {
    if (j !== i) return m;
    const n = setMaterialFeld(m, k, v);
    return { ...n, preis: materialPreis(n) };
  }));
  const addM = () => setMaterial((rows) => [...rows, leeresMaterial()]);
  const remM = (i: number) => setMaterial((rows) => rows.filter((_, j) => j !== i));
  /** Link typed in: normalized to the full URL ("autodoc.ch/…" → "https://…"); an
      unusable one stays as typed with a hint and is not stored. Never fetched. */
  const linkFertig = (i: number) => {
    const raw = material[i]?.link?.trim() ?? '';
    const ok = parsePartLink(raw);
    updM(i, 'link', raw ? ok?.href ?? raw : '');
  };
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const q = quelleVon(item, vorlage);
  // Inspektion: interval and source come from "Motoröl & Ölfilter", not edited here.
  const folgtOel = istInspektion(item) && oelVorhanden;
  const key = vorlageVon(item);
  const variante = key ? specVariante(key, vehicle) : null;
  const kannTeilen = !istInspektion(item) && !!motorcode && !!key && variante !== null;
  const fuer = `Motor ${motorcode}${variante ? ` · ${key === 'getriebeoel' ? labelVon(GETRIEBE, vehicle.getriebe) : 'Allrad'}` : ''}`;
  const num = (v: string) => (parseInt(v, 10) > 0 ? parseInt(v, 10) : undefined);
  const opt = (v: string) => v.trim() || undefined;
  const ok = !!f.name.trim() && !busy;

  function submit() {
    if (!ok) return;
    if (folgtOel) {
      onSave(letztenServiceSetzen({ ...item, name: f.name.trim(), notiz: opt(f.notiz) }, {
        datum: opt(f.letztesDatum), km: opt(f.letzteKm), beleg: { nachweis, auftragId: opt(auftragId) },
        faelligDatum: opt(f.faelligDatum), faelligKm: opt(f.faelligKm),
      }), false, material);
      return;
    }
    const intervallKm = num(f.intervallKm), intervallMonate = num(f.intervallMonate);
    const geaendert = intervallKm !== item.intervallKm || intervallMonate !== item.intervallMonate;
    const warGeprueft = item.quelle === 'geprueft';
    // Checked against the OEM schedule: verified. Edited without the check:
    // the vehicle's own value, without a source.
    const quelle: IntervallQuelle | undefined = geprueft ? 'geprueft' : geaendert || warGeprueft ? undefined : item.quelle;
    const neuItem: ServiceItem = {
      ...item,
      name: f.name.trim(),
      intervallKm,
      intervallMonate,
      // An edited or checked interval is the vehicle's own: kept when its profile changes.
      intervallManuell: item.intervallManuell || geaendert || (geprueft && !warGeprueft) || undefined,
      quelle,
      // A researched interval left as it is keeps its source.
      quelleText: geprueft ? opt(f.quelleText) : quelle === 'recherchiert' ? item.quelleText : undefined,
      quelleUrl: quelle === 'recherchiert' ? item.quelleUrl : undefined,
      rechercheFuer: quelle === 'recherchiert' ? item.rechercheFuer : undefined,
      geprueftAm: geprueft ? (warGeprueft && !geaendert && item.geprueftAm ? item.geprueftAm : todayISO()) : undefined,
      notiz: opt(f.notiz),
    };
    onSave(letztenServiceSetzen(neuItem, {
      datum: opt(f.letztesDatum), km: opt(f.letzteKm), beleg: { nachweis, auftragId: opt(auftragId) },
      faelligDatum: opt(f.faelligDatum), faelligKm: opt(f.faelligKm),
    }), geprueft && kannTeilen && teilen, material);
  }
  const auftragVon = (id?: string) => (id ? auftraege.find((o) => o.id === id) : undefined);

  const historie = [...(item.historie ?? [])].reverse();

  return (
    <Sheet
      title={neu ? 'Neue Position' : 'Position bearbeiten'} onClose={onClose}
      barRight={<button className="bar-btn" onClick={onClose}>Abbrechen</button>}
    >
      <form className="sp-editor" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="cf-field">
          <label className="cf-label" htmlFor="sp-name">Bezeichnung</label>
          <input id="sp-name" className="cf-input" value={f.name} onChange={s('name')} placeholder="z.B. Motoröl & Ölfilter" autoFocus={neu} />
        </div>

        <p className="sp-editor-head">Intervall</p>
        <div className="cf-grid-2" ref={fokus === 'intervall' ? fokusRef : undefined}>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-ikm">Alle … km</label><input id="sp-ikm" className="cf-input" type="number" inputMode="numeric" value={f.intervallKm} onChange={s('intervallKm')} placeholder={folgtOel ? '—' : '15000'} disabled={folgtOel} /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-imt">Alle … Monate</label><input id="sp-imt" className="cf-input" type="number" inputMode="numeric" value={f.intervallMonate} onChange={s('intervallMonate')} placeholder={folgtOel ? '—' : '12'} disabled={folgtOel} /></div>
        </div>
        {folgtOel && (
          <p className="sp-hinweis">
            Gleiches Intervall wie „Motoröl &amp; Ölfilter“ – inklusive Quelle und Prüfung. Änderungen am Ölwechsel-Intervall werden automatisch übernommen.
          </p>
        )}

        {!folgtOel && q === 'recherchiert' && (
          <p className="sp-hinweis">
            Herstellervorgabe recherchiert: {item.quelleText}
            {item.quelleUrl && <> · <a href={item.quelleUrl} target="_blank" rel="noreferrer">Quelle öffnen</a></>}
          </p>
        )}
        {!folgtOel && q !== 'geprueft' && q !== 'recherchiert' && (vorlage?.hinweis || q === 'standard') && <p className="sp-hinweis">{vorlage?.hinweis ?? HINWEIS_STANDARD}</p>}
        {!folgtOel && <label className="sp-check">
          <input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} />
          <span>
            <span className="sp-check-title">Intervall nach Herstellervorgabe geprüft</span>
            <span className="sp-check-sub">
              {item.quelle === 'geprueft' && item.geprueftAm ? `Geprüft am ${formatDateCH(item.geprueftAm)}` : 'Serviceheft, Herstellerportal, Autodata, HaynesPro, TecDoc …'}
            </span>
          </span>
        </label>}
        {!folgtOel && geprueft && (
          <div className="cf-field">
            <label className="cf-label" htmlFor="sp-quelle">Quelle</label>
            <input id="sp-quelle" className="cf-input" value={f.quelleText} onChange={s('quelleText')} placeholder="z.B. VW Serviceplan, Autodata" />
          </div>
        )}
        {geprueft && !kannTeilen && motorcode && key && (
          <p className="sp-hinweis">Gilt nur für dieses Fahrzeug: {key === 'getriebeoel' ? 'Getriebeart' : 'Antriebsart'} nicht erfasst – das Intervall hängt davon ab.</p>
        )}
        {geprueft && kannTeilen && (
          <label className="sp-check">
            <input type="checkbox" checked={teilen} onChange={(e) => setTeilen(e.target.checked)} />
            <span>
              <span className="sp-check-title">Für alle Fahrzeuge mit {fuer} übernehmen</span>
              <span className="sp-check-sub">Wird gespeichert und bei diesen Fahrzeugen statt des Richtwerts verwendet</span>
            </span>
          </label>
        )}

        {ohneBasis && <p className="sp-hinweis">Fälligkeit unbekannt: letzten Service (Serviceheft / Rechnung) oder nächste Fälligkeit eintragen. Ohne Angabe wird nichts angenommen.</p>}
        <p className="sp-editor-head">Zuletzt gemacht</p>
        <div className="cf-grid-2" ref={fokus === 'letzte' ? fokusRef : undefined}>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-ld">Datum</label><input id="sp-ld" className="cf-input" type="date" value={f.letztesDatum} onChange={s('letztesDatum')} /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-lkm">KM-Stand</label><input id="sp-lkm" className="cf-input" type="number" inputMode="numeric" value={f.letzteKm} onChange={s('letzteKm')} /></div>
        </div>
        {f.letztesDatum && (
          <div className="cf-grid-2">
            <div className="cf-field">
              <label className="cf-label" htmlFor="sp-nachweis">Nachweis</label>
              <select id="sp-nachweis" className="cf-select" value={nachweis} onChange={(e) => setNachweis(e.target.value as Nachweis)}>
                {(Object.keys(NACHWEIS) as Nachweis[]).map((n) => <option key={n} value={n}>{NACHWEIS[n].label}</option>)}
              </select>
            </div>
            {auftraege.length > 0 && (
              <div className="cf-field">
                <label className="cf-label" htmlFor="sp-auftrag">Auftrag (optional)</label>
                <select id="sp-auftrag" className="cf-select" value={auftragId} onChange={(e) => setAuftragId(e.target.value)}>
                  <option value="">Kein Auftrag</option>
                  {auftraege.map((o) => <option key={o.id} value={o.id}>#{o.orderNumber} · {formatDateCH(o.createdAt)}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {!f.letztesDatum && f.letzteKm && <p className="sp-hinweis">Ohne Datum wird der KM-Stand ohne Beleg und ohne Verlaufseintrag gespeichert.</p>}

        <p className="sp-editor-head">Nächste Fälligkeit</p>
        <div className="cf-grid-2" ref={fokus === 'naechste' ? fokusRef : undefined}>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-fd">Datum</label><input id="sp-fd" className="cf-input" type="date" value={f.faelligDatum} onChange={s('faelligDatum')} /></div>
          <div className="cf-field"><label className="cf-label" htmlFor="sp-fkm">KM-Stand</label><input id="sp-fkm" className="cf-input" type="number" inputMode="numeric" value={f.faelligKm} onChange={s('faelligKm')} /></div>
        </div>

        <p className="sp-editor-head">Material für Offerten</p>
        <div className="sp-teile" ref={fokus === 'material' ? fokusRef : undefined}>
          {material.map((m, i) => {
            const fest = !!m.art;
            const mitEk = parseFloat(m.ek ?? '') > 0;
            return (
              <div key={i} className="sp-teil">
                <div className="sp-teil-kopf">
                  <input
                    className="cf-input" value={m.beschreibung} onChange={(e) => updM(i, 'beschreibung', e.target.value)}
                    placeholder="z.B. Motoröl 5W-30" aria-label="Beschreibung Material"
                  />
                  <button type="button" className="mf-pos-del sp-teil-del" onClick={() => remM(i)} aria-label={`${m.beschreibung || 'Material'} entfernen`} title="Entfernen">
                    <SFXmark />
                  </button>
                </div>
                <div className="sp-teil-werte">
                  <label><span>Menge</span><input className="cf-input" type="number" inputMode="decimal" step="any" min={0} value={m.menge} onChange={(e) => updM(i, 'menge', e.target.value)} /></label>
                  <label><span>EK CHF</span><input className="cf-input" type="number" inputMode="decimal" step="any" min={0} value={fest ? '' : m.ek ?? ''} disabled={fest} placeholder="—" onChange={(e) => updM(i, 'ek', e.target.value)} /></label>
                  <label><span>Marge %</span><input className="cf-input" type="number" inputMode="decimal" step="any" value={fest ? '' : m.marge ?? ''} disabled={fest || !mitEk} placeholder={fest ? '0' : String(getMargin())} title={mitEk ? undefined : 'Zuerst EK eingeben'} onChange={(e) => updM(i, 'marge', e.target.value)} /></label>
                  <label><span>VK CHF</span><input className="cf-input" type="number" inputMode="decimal" step="any" min={0} value={m.stueckpreis} placeholder="0.00" onChange={(e) => updM(i, 'stueckpreis', e.target.value)} /></label>
                  <label><span>ZE</span><input className="cf-input" type="number" inputMode="decimal" step="any" min={0} value={fest ? '' : m.ze ?? ''} disabled={fest} placeholder="—" onChange={(e) => updM(i, 'ze', e.target.value)} /></label>
                </div>
                {(() => {
                  const raw = m.link?.trim() ?? '';
                  const link = parsePartLink(raw);
                  const fehler = !!raw && !link;
                  return (
                    <div className="sp-teil-link">
                      <label htmlFor={`sp-link-${i}`}>Link (optional)</label>
                      <div className="sp-teil-link-feld">
                        <input
                          id={`sp-link-${i}`} className="cf-input" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                          value={m.link ?? ''} placeholder="https://www.autodoc.ch/…" aria-invalid={fehler || undefined}
                          onChange={(e) => updM(i, 'link', e.target.value)} onBlur={() => linkFertig(i)}
                        />
                        {link && (
                          <a className="btn-tinted sp-teil-oeffnen" href={link.href} target="_blank" rel="noopener noreferrer" title={link.href}>Öffnen</a>
                        )}
                      </div>
                      {fehler && <span className="sp-teil-fehler">Kein gültiger Link – nur http:// oder https://. Wird so nicht gespeichert.</span>}
                    </div>
                  );
                })()}
              </div>
            );
          })}
          <button type="button" className="sp-text-btn sp-teil-add" onClick={addM}><SFPlus size={12} /> Material</button>
          <p className="sp-hinweis">
            Nur für dieses Fahrzeug: wird bei jeder Offerte aus dem Wartungsplan mit dieser Position unter Material eingefügt.
            Ohne Eintrag wird kein Material angenommen.
          </p>
        </div>

        <div className="cf-field">
          <label className="cf-label" htmlFor="sp-notiz">Notiz</label>
          <input id="sp-notiz" className="cf-input" value={f.notiz} onChange={s('notiz')} placeholder="z.B. 5W-30, Longlife" />
        </div>

        {historie.length > 0 && (
          <div>
            <p className="sp-editor-head">Verlauf</p>
            <ul className="sp-history">
              {historie.map((h, i) => {
                const b = eintragNachweis(h);
                const info = NACHWEIS[b.nachweis];
                const auftrag = auftragVon(b.auftragId);
                return (
                  <li key={i}>
                    <span className="sp-history-check" style={{ color: info.farbe }}><SFCheckmark /></span>
                    <span className="sp-history-text">
                      {datumKm(h.datum, h.km)} · <span className="sp-history-beleg">{info.kurz}</span>
                      {auftrag && (onAuftrag
                        ? <> · <button type="button" className="sp-erfassen" onClick={() => onAuftrag(auftrag)}>Auftrag #{auftrag.orderNumber}</button></>
                        : <> · Auftrag #{auftrag.orderNumber}</>)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="sp-text-btn sp-undo" onClick={onUndo} disabled={busy}>Letzten Eintrag rückgängig</button>
          </div>
        )}

        <button type="submit" className="btn-system btn-primary" disabled={!ok}>Sichern</button>
        {!neu && <button type="button" className="text-danger-btn" onClick={onDelete} disabled={busy}>Aus Wartungsplan entfernen</button>}
      </form>
    </Sheet>
  );
}
