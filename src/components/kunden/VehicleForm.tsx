import { useEffect, useMemo, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';
import { ACHSANTRIEBE, ANTRIEBE, GETRIEBE, STEUERTRIEBE, fahrzeugProfil, labelVon, motorfamilieAusCode } from '../../lib/wartung';
import { vinAbrufen, vinGueltig, type VinVariante } from '../../lib/vin';
import { motorVarianten } from '../../lib/motorkatalog';
import type { FahrzeugFeld, FahrzeugFelder } from '../../types';

/** The empty option of a technical select: nothing is presumed for an open field. */
const AUTO = 'Automatisch – unbekannt';

const FELD_LABEL: Partial<Record<keyof FahrzeugFelder, string>> = {
  marke: 'Marke', modell: 'Modell', antrieb: 'Antrieb', getriebe: 'Getriebe', achsantrieb: 'Antriebsart', motor: 'Motor', motorcode: 'Motorkennbuchstabe', steuertrieb: 'Steuertrieb', erstzulassung: '1. Inv. Setzung',
};
const WERT_LABEL: Partial<Record<keyof FahrzeugFelder, (v: string) => string | undefined>> = {
  antrieb: (v) => labelVon(ANTRIEBE, v as never), getriebe: (v) => labelVon(GETRIEBE, v as never), steuertrieb: (v) => labelVon(STEUERTRIEBE, v as never), achsantrieb: (v) => labelVon(ACHSANTRIEBE, v as never),
};
const anzeige = (k: keyof FahrzeugFelder, v: string) => WERT_LABEL[k]?.(v) ?? v;

interface VinStatus {
  laden?: boolean;
  /** Lookup failed, nothing found, or a general note. */
  text?: string;
  warnung?: boolean;
  /** Reliably recognized: "Marke: VW". */
  erkannt?: string[];
  /** Fields still empty, to be checked or entered by hand. */
  offen?: string[];
  /** Model year and sources. */
  info?: string;
  /** VIN values differing from what was entered by hand: taken over only on request. */
  abweichend?: Partial<FahrzeugFelder>;
  /** Unconfirmed model name, entered only on request. */
  modellVorschlag?: string;
  /** Unconfirmed engine variants (AI or Motorkatalog for the decoded model). */
  varianten?: VinVariante[];
}

/** "1.5 TSI · 110 kW (150 PS) · DPCA" */
const variantenText = (v: VinVariante) => [v.motor, v.motorcode, v.hinweis].filter(Boolean).join(' · ');

/** The vehicle inputs, shared by the vehicle sheet and the new-customer form.
    Where Marke / Modell are known but the engine isn't, the factory engines of
    the built-in Motorkatalog are offered as chips (also without a VIN).
    "Daten abrufen" looks up a complete VIN (lib/vin): only reliably resolved values
    fill empty fields, values entered by hand are only replaced on request, and the
    status names what was recognized and what is still to be checked. */
export function VehicleFields({ f, onChange }: { f: FahrzeugFelder; onChange: (k: keyof FahrzeugFelder, v: string) => void }) {
  const s = (k: keyof FahrzeugFelder) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(k, e.target.value);
  const p = fahrzeugProfil(f);
  const katalog = useMemo(() => motorVarianten(f.marke, f.modell, p.baujahr), [f.marke, f.modell, p.baujahr]);

  const [vin, setVin] = useState<VinStatus | null>(null);
  const aktuell = useRef(f);
  aktuell.current = f;
  const abbruch = useRef<AbortController | null>(null);
  /** Values the last lookup entered: a lookup for another VIN must not leave them behind. */
  const eingetragen = useRef(new Map<keyof FahrzeugFelder, string>());
  useEffect(() => () => abbruch.current?.abort(), []);

  async function vinLaden() {
    const nr = vinGueltig(aktuell.current.chassisnummer);
    if (!nr) {
      setVin({ text: 'Ungültige VIN: 17 Zeichen, ohne I, O und Q.', warnung: true });
      return;
    }
    abbruch.current?.abort();
    const ac = new AbortController();
    abbruch.current = ac;
    setVin({ laden: true, text: 'VIN wird geprüft, beim ersten Mal kann das bis zu einer Minute dauern…' });
    try {
      const r = await vinAbrufen(nr, ac.signal);
      if (vinGueltig(aktuell.current.chassisnummer) !== nr) return; // VIN changed meanwhile
      const werte: Record<string, unknown> = { ...aktuell.current };
      for (const [k, v] of eingetragen.current) {
        if (String(werte[k] ?? '') === v) { onChange(k, ''); werte[k] = ''; }
      }
      eingetragen.current = new Map();

      const erkannt: string[] = [];
      const abweichend: Partial<FahrzeugFelder> = {};
      for (const [k, v] of Object.entries(r.felder) as [keyof FahrzeugFelder, string][]) {
        const alt = String(werte[k] ?? '').trim();
        if (!alt) { onChange(k, v); werte[k] = v; eingetragen.current.set(k, v); }
        else if (alt.toLowerCase() !== v.toLowerCase()) { (abweichend as Record<string, string>)[k] = v; continue; }
        erkannt.push(`${FELD_LABEL[k] ?? k}: ${anzeige(k, v)}`);
      }
      const offen = r.offen.filter((k) => !String(werte[k] ?? '').trim()).map((k) => FELD_LABEL[k] ?? k);
      // Neither is in a European VIN as a rule: no reason for a warning on their own.
      const nurDatum = offen.every((x) => x === FELD_LABEL.erstzulassung || x === FELD_LABEL.achsantrieb);
      setVin({
        text: [
          r.offline ? 'VIN-Server nicht erreichbar: nur die lokale Auswertung wurde verwendet.' : '',
          erkannt.length ? '' : 'Zu dieser VIN wurden keine verlässlichen Fahrzeugdaten gefunden. Es wurde nichts eingetragen.',
          r.hinweis ?? '',
        ].filter(Boolean).join(' ') || undefined,
        warnung: !erkannt.length || !!r.offline || !!r.hinweis || (offen.length > 0 && !nurDatum),
        erkannt, offen,
        info: [
          r.modelljahr ? `Modelljahr ${r.modelljahr} (entspricht nicht zwingend der 1. Inv. Setzung)` : '',
          r.quellen.length ? `Quelle: ${r.quellen.join(', ')}${r.cache ? ' (gespeichert)' : ''}` : '',
        ].filter(Boolean).join(' · ') || undefined,
        abweichend: Object.keys(abweichend).length ? abweichend : undefined,
        modellVorschlag: r.modellVorschlag,
        varianten: r.varianten.length ? r.varianten : undefined,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setVin({ text: 'VIN-Abfrage fehlgeschlagen. Es wurde nichts eingetragen, bitte später erneut versuchen oder die Daten manuell erfassen.', warnung: true });
    }
  }

  /** A changed VIN invalidates the shown result and a lookup still running. */
  function vinGeaendert(wert: string) {
    abbruch.current?.abort();
    setVin(null);
    onChange('chassisnummer', wert);
  }

  // Offered while the engine is open, and kept visible once one of them is picked.
  const varianten = vin?.varianten ?? katalog;
  const zeigeVarianten = varianten.length > 0 && !(varianten.length === 1 && varianten[0].antrieb === 'elektro')
    && ((!f.motor && !f.motorcode) || varianten.some((x) => x.motor === f.motor));

  /** A picked engine variant overwrites the engine fields; a field the variant leaves open is cleared
      only for the Motorkennbuchstabe (it belongs to the previous pick). */
  function varianteWaehlen(v: VinVariante) {
    const code = v.motorcode.includes('/') ? '' : v.motorcode;
    onChange('motor', v.motor);
    onChange('motorcode', code);
    if (v.antrieb) onChange('antrieb', v.antrieb);
    if (v.getriebe) onChange('getriebe', v.getriebe);
    if (v.steuertrieb) onChange('steuertrieb', v.steuertrieb);
  }

  function uebernehmen() {
    if (!vin?.abweichend) return;
    const neu = Object.entries(vin.abweichend) as [keyof FahrzeugFelder, string][];
    for (const [k, v] of neu) onChange(k, v);
    setVin({ ...vin, erkannt: [...(vin.erkannt ?? []), ...neu.map(([k, v]) => `${FELD_LABEL[k] ?? k}: ${anzeige(k, v)}`)], abweichend: undefined });
  }

  function modellUebernehmen() {
    if (!vin?.modellVorschlag) return;
    onChange('modell', vin.modellVorschlag);
    setVin({ ...vin, modellVorschlag: undefined, offen: vin.offen?.filter((x) => x !== FELD_LABEL.modell) });
  }

  // Shown only for a Motorkennbuchstabe of a documented family, never from free text.
  const familie = motorfamilieAusCode(f.marke, f.motorcode);

  return (
    <div className="cf-group">
      {/* VIN first: a complete VIN fills the vehicle data below. */}
      <div className="vin-bar">
        <label className="cf-label" htmlFor="vf-vin">Chassisnummer (VIN)</label>
        <div className="vin-row">
          <input
            id="vf-vin" className="cf-input vin-input" value={f.chassisnummer ?? ''} placeholder="z.B. WAUZZZ8TX9A020101" maxLength={20}
            autoCapitalize="characters" autoComplete="off" spellCheck={false}
            onChange={(e) => vinGeaendert(e.target.value)}
          />
          <button
            type="button" className="btn-system btn-secondary vin-btn" disabled={vin?.laden || !vinGueltig(f.chassisnummer)}
            onClick={() => void vinLaden()} title="Fahrzeugdaten aus der VIN ermitteln"
          >
            {vin?.laden ? <Spinner size={13} color="var(--accent)" /> : 'Daten abrufen'}
          </button>
        </div>
        {vin ? (
          <div className={`vin-status${vin.warnung ? ' vin-status-warn' : ''}`} role="status" aria-live="polite">
            {vin.text && <span>{vin.text}</span>}
            {!!vin.erkannt?.length && (
              <span className="vin-zeile"><span className="vin-zeile-titel">Erkannt</span><span className="vin-zeile-wert">{vin.erkannt.join(' · ')}</span></span>
            )}
            {!!vin.offen?.length && (
              <span className="vin-zeile"><span className="vin-zeile-titel">Bitte prüfen / ergänzen</span><span className="vin-zeile-wert">{vin.offen.join(', ')}</span></span>
            )}
            {vin.abweichend && (
              <span className="vin-abweichend">
                VIN abweichend: {Object.entries(vin.abweichend).map(([k, v]) => `${FELD_LABEL[k as keyof FahrzeugFelder]} ${anzeige(k as keyof FahrzeugFelder, v)}`).join(' · ')}
                <button type="button" className="sp-text-btn" onClick={uebernehmen}>Übernehmen</button>
              </span>
            )}
            {vin.modellVorschlag && !f.modell && (
              <span className="vin-abweichend">
                Modell-Vorschlag (nicht bestätigt): {vin.modellVorschlag}
                <button type="button" className="sp-text-btn" onClick={modellUebernehmen}>Übernehmen</button>
              </span>
            )}
            {vin.info && <span className="vin-info">{vin.info}</span>}
          </div>
        ) : (
          <p className="vin-hint">17 Zeichen. Übernimmt nur verlässlich erkannte Daten, offene Felder werden danach angezeigt.</p>
        )}
      </div>

      {/* Vehicle data (from the VIN). Technical data decides which Wartungsplan items apply and their intervals. */}
      <div className="cf-grid-2">
        <div className="cf-field">
          <label className="cf-label">Marke</label>
          <input className="cf-input" value={f.marke ?? ''} onChange={s('marke')} placeholder="z.B. BMW" />
        </div>
        <div className="cf-field">
          <label className="cf-label">Modell</label>
          <input className="cf-input" value={f.modell ?? ''} onChange={s('modell')} placeholder="z.B. 320d" />
        </div>
      </div>
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Antrieb</label>
          <select className="cf-select" data-feld="antrieb" value={f.antrieb ?? ''} onChange={s('antrieb')}>
            <option value="">{AUTO}</option>
            {ANTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="cf-field">
          <label className="cf-label">Getriebe</label>
          <select className="cf-select" data-feld="getriebe" value={f.getriebe ?? ''} onChange={s('getriebe')}>
            <option value="">{AUTO}</option>
            {GETRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Motor</label>
          <input className="cf-input" value={f.motor ?? ''} onChange={s('motor')} placeholder="z.B. 2.0 TDI 150 PS" />
        </div>
        <div className="cf-field">
          <label className="cf-label">Motorkennbuchstabe</label>
          <input className="cf-input" data-feld="motorcode" value={f.motorcode ?? ''} onChange={s('motorcode')} placeholder="z.B. CFFB / B47D20 / OM651" autoCapitalize="characters" />
        </div>
      </div>
      {zeigeVarianten && (
        <div className="vin-varianten">
          <span className="vin-varianten-titel">
            Mögliche Motorisierungen{f.modell ? ` – ${[f.marke, f.modell].filter(Boolean).join(' ')}` : ''}: nicht bestätigt, nur nach Prüfung am Fahrzeug oder Fahrzeugausweis wählen
          </span>
          <div className="vin-chips">
            {varianten.map((v, i) => {
              const aktiv = v.motor === f.motor;
              return (
                <button
                  key={i} type="button" className={`vin-chip${aktiv ? ' vin-chip-aktiv' : ''}`} aria-pressed={aktiv}
                  onClick={() => varianteWaehlen(v)} title="Antrieb, Getriebe, Motor, Motorkennbuchstabe und Steuertrieb übernehmen"
                >
                  {variantenText(v)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {familie && <p className="cf-hint" style={{ margin: '6px 2px 0', fontSize: 12, color: 'var(--label3)' }}>Motorfamilie: {familie.name}</p>}
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Steuertrieb</label>
          <select className="cf-select" data-feld="steuertrieb" value={f.steuertrieb ?? ''} onChange={s('steuertrieb')}>
            <option value="">{AUTO}</option>
            {STEUERTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="cf-field">
          <label className="cf-label" htmlFor="vf-achsantrieb">Antriebsart</label>
          <select id="vf-achsantrieb" className="cf-select" data-feld="achsantrieb" value={f.achsantrieb ?? ''} onChange={s('achsantrieb')}>
            <option value="">{AUTO}</option>
            {ACHSANTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Registration / workshop data: entered by hand. */}
      <div className="cf-grid-2 vf-manual">
        <div className="cf-field">
          <label className="cf-label">Kontrollschild</label>
          <input className="cf-input" value={f.kennzeichen ?? ''} onChange={s('kennzeichen')} placeholder="ZH 123456" />
        </div>
        <div className="cf-field">
          <label className="cf-label">1. Inv. Setzung</label>
          <input className="cf-input" data-feld="erstzulassung" type="date" value={f.erstzulassung ?? ''} onChange={s('erstzulassung')} />
        </div>
        <div className="cf-field">
          <label className="cf-label">KM-Stand</label>
          <input className="cf-input" type="number" inputMode="numeric" value={f.km ?? ''} onChange={s('km')} placeholder="85000" />
        </div>
      </div>
    </div>
  );
}

interface VehicleFormProps {
  initial?: FahrzeugFelder;
  onSave: (data: FahrzeugFelder) => Promise<void> | void;
  onCancel: () => void;
  /** Field to focus on open, e.g. a missing Getriebe flagged by the Wartungsplan. */
  fokus?: FahrzeugFeld;
}

export default function VehicleForm({ initial, onSave, onCancel, fokus }: VehicleFormProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fokus) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-feld="${fokus}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [fokus]);
  const [f, setF] = useState<FahrzeugFelder>({
    marke:         initial?.marke         ?? '',
    modell:        initial?.modell        ?? '',
    kennzeichen:   initial?.kennzeichen   ?? '',
    km:            initial?.km            ?? '',
    chassisnummer: initial?.chassisnummer ?? '',
    erstzulassung: initial?.erstzulassung ?? '',
    antrieb:       initial?.antrieb,
    getriebe:      initial?.getriebe,
    steuertrieb:   initial?.steuertrieb,
    achsantrieb:   initial?.achsantrieb,
    motor:         initial?.motor         ?? '',
    motorcode:     initial?.motorcode     ?? '',
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      // Empty inputs are not stored.
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) if (String(v ?? '').trim()) data[k] = String(v).trim();
      await onSave(data as FahrzeugFelder);
    } catch {
      // Error toast already shown by the context (syncOk). Form stays open, input intact.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root}>
      <div className="cf-section-title" style={{ marginTop: 0 }}>Fahrzeug</div>
      <VehicleFields f={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
      <div className="cf-actions">
        <button className="cf-btn-save" onClick={submit} disabled={busy}>
          {busy ? 'Wird gespeichert…' : 'Sichern'}
        </button>
        <button className="cf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
