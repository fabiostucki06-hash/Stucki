import { useState, useEffect } from 'react';
import { setIban, setMargin, setSignature } from '../../lib/settings';
import { connectDrive, disconnectDrive, getDriveStatus, type DriveStatus } from '../../lib/drive';
import { signatureFromFile } from '../../lib/signature';
import { useSettings } from '../../hooks/useSettings';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import SignaturePad from '../ui/SignaturePad';
import { showToast } from '../ui/Toast';
import { buildImportBookmarklet } from '../../lib/bookmarklet';
import { CO_NAME, CO_ADDR, CO_CITY, CO_PHONE, STD_SATZ } from '../../lib/company';
import { VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ, ANZAHLUNG_BEDINGUNG, ANZAHLUNG_PROZENT } from '../../lib/offerte-docs';
import { KLEINTEIL_BETRAG, KLEINTEIL_LABEL } from '../../lib/rechnung-totals';
import { BUILD_DATE, BUILD_SHA } from '../../lib/buildInfo';
import { hardReload } from '../../lib/reload';
import { SFCheckmark, SFWrench, SFDocCheck, SFCloud, SFGear } from '../Icons';
import ShortcutKeySection from './ShortcutKeySection';
import PauschalenSection from './PauschalenSection';
import type { SyncStatus } from '../../types';

type SectionId = 'werkstatt' | 'dokumente' | 'integrationen' | 'system';

const SECTIONS: { id: SectionId; icon: React.ReactNode; tile: string; label: string; short: string; hint: string }[] = [
  { id: 'werkstatt',     icon: <SFWrench />,   tile: 'orange',   label: 'Werkstatt & Firmendaten', short: 'Werkstatt',     hint: 'Adresse, IBAN, Stundensatz, Marge, Pauschalen' },
  { id: 'dokumente',     icon: <SFDocCheck />, tile: 'green', label: 'Unterschrift & Dokumente', short: 'Dokumente',     hint: 'Unterschrift, Zahlungsbedingungen' },
  { id: 'integrationen', icon: <SFCloud />,    tile: 'blue',    label: 'Integrationen & Cloud',   short: 'Integrationen', hint: 'Sync, Google Drive, Teile-Import' },
  { id: 'system',        icon: <SFGear />,     tile: 'gray',     label: 'System & App-Info',       short: 'System',        hint: 'Layout, Build' },
];

const SECTION_KEY = 'garage_settings_section';

function readSection(): SectionId {
  try {
    const v = localStorage.getItem(SECTION_KEY);
    if (SECTIONS.some((s) => s.id === v)) return v as SectionId;
  } catch { /* storage blocked */ }
  return 'werkstatt';
}

/** Settings group: quiet surface with a small uppercase heading. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-card">
      <p className="set-card-title">{title}</p>
      {children}
    </section>
  );
}

/** Read-only label / value line. */
function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--label2)', flex: '0 0 auto', minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--label)', flex: 1, textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

function Hint({ children, mb }: { children: React.ReactNode; mb?: number }) {
  return <p style={{ fontSize: 12, color: 'var(--label3)', marginTop: 8, marginBottom: mb }}>{children}</p>;
}

function StatusDot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 7, verticalAlign: 'middle' }} />;
}

const SYNC_TEXT: Record<SyncStatus, { color: string; text: string }> = {
  idle:   { color: 'var(--label3)', text: 'Bereit' },
  saving: { color: 'var(--orange)', text: 'Synchronisiert…' },
  ok:     { color: 'var(--green)', text: 'Gespeichert' },
  error:  { color: 'var(--red)', text: 'Fehler beim Speichern' },
};

interface SettingsViewProps {
  syncStatus: SyncStatus;
  userEmail: string | null;
}

export default function SettingsView({ syncStatus, userEmail }: SettingsViewProps) {
  const { iban, margin, signature } = useSettings();
  const isDesktop = useIsDesktop();
  const [section, setSection] = useState<SectionId>(readSection);
  const [sigLoading, setSigLoading] = useState(false);
  /** null while loading. */
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [driveError, setDriveError] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  const bookmarklet = buildImportBookmarklet(window.location.origin);
  function selectSection(id: SectionId) {
    setSection(id);
    try { localStorage.setItem(SECTION_KEY, id); } catch { /* storage blocked */ }
  }

  useEffect(() => {
    if (section !== 'integrationen') return;
    let cancelled = false;
    const load = () => getDriveStatus()
      .then((s) => { if (!cancelled) { setDrive(s); setDriveError(''); } })
      .catch((err) => { if (!cancelled) setDriveError(err instanceof Error ? err.message : 'Status nicht verfügbar'); });
    void load();
    window.addEventListener('garage-drive-changed', load);
    return () => { cancelled = true; window.removeEventListener('garage-drive-changed', load); };
  }, [section]);

  async function handleDriveConnect() {
    setDriveBusy(true);
    setDriveError('');
    try {
      await connectDrive(); // leaves the page on success
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
      setDriveBusy(false);
    }
  }

  async function handleDriveDisconnect() {
    if (!window.confirm('Google Drive trennen? Bereits gespeicherte PDFs bleiben in Drive.')) return;
    setDriveBusy(true);
    try {
      await disconnectDrive();
      setDrive(await getDriveStatus());
      showToast('Google Drive getrennt', 'info');
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Trennen fehlgeschlagen');
    } finally {
      setDriveBusy(false);
    }
  }

  function handleIbanChange(v: string) {
    setIban(v);
  }

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSigLoading(true);
    try {
      setSignature(await signatureFromFile(file));
      showToast('Unterschrift gespeichert', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bild konnte nicht gelesen werden', 'error');
    } finally {
      setSigLoading(false);
    }
  }

  function handleMarginChange(v: string) {
    const n = parseFloat(v);
    const pct = Number.isFinite(n) ? n : 0;
    setMargin(pct);
  }

  const active = SECTIONS.find((s) => s.id === section)!;
  const sync = SYNC_TEXT[syncStatus];

  const nav = isDesktop ? (
    <nav aria-label="Einstellungs-Kategorien" style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 16 }}>
      {SECTIONS.map((s) => {
        const on = s.id === section;
        return (
          <button
            key={s.id}
            aria-current={on ? 'page' : undefined}
            onClick={() => selectSection(s.id)}
            className={`settings-tab${on ? ' active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', width: '100%', textAlign: 'left' }}
          >
            <span className={`settings-tab-icon icon-tile tile-${s.tile}`}>{s.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: on ? 600 : 500 }}>{s.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--label3)', marginTop: 1 }}>{s.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  ) : (
    <nav aria-label="Einstellungs-Kategorien" className="settings-chips">
      {SECTIONS.map((s) => {
        const on = s.id === section;
        return (
          <button
            key={s.id}
            aria-current={on ? 'page' : undefined}
            onClick={() => selectSection(s.id)}
            className={`settings-tab settings-chip${on ? ' active' : ''}`}
          >
            <span className={`settings-tab-icon icon-tile tile-${s.tile}`}>{s.icon}</span>
            {s.short}
          </button>
        );
      })}
    </nav>
  );

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: isDesktop ? '0 0 16px' : '4px 0 16px' }}>
        <span className={`settings-tab-icon icon-tile tile-${active.tile}`}>{active.icon}</span>
        <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, color: 'var(--label)', margin: 0 }}>{active.label}</h2>
      </div>

      {section === 'werkstatt' && (<>
        <Card title="Firmendaten">
          <InfoRow label="Firma / Inhaber" value={CO_NAME} />
          <InfoRow label="Adresse" value={CO_ADDR} />
          <InfoRow label="PLZ / Ort" value={CO_CITY} />
          <InfoRow label="Telefon" value={CO_PHONE} />
          <Hint>Fest hinterlegt – erscheint im Kopf jeder Offerte, Auftragsbestätigung und Rechnung.</Hint>
        </Card>

        <Card title="Zahlung">
          <div className="cf-field">
            <label className="cf-label">Haupt-IBAN / QR-IBAN</label>
            <input
              className="cf-input"
              value={iban}
              onChange={(e) => handleIbanChange(e.target.value)}
              placeholder="CH00 0000 0000 0000 0000 0"
            />
          </div>
          <Hint mb={12}>Wird für den Swiss QR-Code auf der Rechnung verwendet.</Hint>
          <InfoRow label="Zahlungsarten" value="Bar, TWINT, E-Banking" />
        </Card>

        <Card title="Preise">
          <InfoRow label="Stundensatz" value={`CHF ${STD_SATZ} / Std`} />
          <Hint mb={16}>Standard für neue Arbeitspositionen; pro Position anpassbar.</Hint>

          <div className="cf-field">
            <label className="cf-label">Standard-Marge auf Einkaufspreis (%)</label>
            <input
              className="cf-input"
              type="number"
              min={0}
              value={margin}
              onChange={(e) => handleMarginChange(e.target.value)}
              placeholder="30"
            />
          </div>
          <Hint>
            Wird bei jeder Materialposition und beim Import eines Teils auf den Einkaufspreis (EK) aufgeschlagen und ergibt den Verkaufspreis (VK). Pro Position im Feld „Marge %“ anpassbar. Auf Offerte und Rechnung erscheint nur der VK.
            Versandkosten und Pauschalen sind davon ausgenommen – sie werden immer 1:1 verrechnet.
          </Hint>
        </Card>

        <Card title="Pauschalen (Festpreis-Pakete)">
          <PauschalenSection />
          <Hint>
            Erscheinen in jeder Offerte und Rechnung unter „+ Pauschale…“ und werden als Festpreis-Position eingefügt – ohne Stundensatz, ZE und Marge.
          </Hint>
        </Card>
      </>)}

      {section === 'dokumente' && (<>
        <Card title="Eigene Unterschrift">
          <SignaturePad value={signature} onChange={setSignature} />
          <label className="btn-system btn-secondary" style={{ marginTop: 12, height: 44, fontSize: 15 }}>
            {sigLoading ? 'Wird geladen…' : 'Bild hochladen'}
            <input type="file" accept="image/*" onChange={handleSignatureUpload} disabled={sigLoading} style={{ display: 'none' }} />
          </label>
          <Hint>Einmal zeichnen oder als Bild hochladen – wird automatisch auf jeder Auftragsbestätigung eingesetzt.</Hint>
        </Card>

        <Card title="Zahlungsbedingungen & Textbausteine">
          <InfoRow label="Anzahlung" value={`${ANZAHLUNG_PROZENT}%`} />
          <InfoRow label={KLEINTEIL_LABEL} value={`CHF ${KLEINTEIL_BETRAG.toFixed(2)}`} />
          {[
            { label: 'Offerte / Auftragsbestätigung', text: VORKASSE_BEDINGUNG },
            { label: 'Anzahlungsrechnung', text: ANZAHLUNG_BEDINGUNG },
            { label: 'Schlussrechnung', text: SCHLUSSRECHNUNG_NOTIZ },
          ].map((t) => (
            <div key={t.label} style={{ marginTop: 14 }}>
              <span className="cf-label">{t.label}</span>
              <div style={{
                fontSize: 13, lineHeight: 1.45, color: 'var(--label)', padding: '10px 12px', borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                {t.text}
              </div>
            </div>
          ))}
          <Hint>Werden als Vorgabe in neue Offerten, Auftragsbestätigungen und Rechnungen übernommen.</Hint>
        </Card>
      </>)}

      {section === 'integrationen' && (<>
        <Card title="Cloud-Sync">
          <InfoRow label="Status" value={<><StatusDot color={sync.color} />{sync.text}</>} />
          <InfoRow label="Konto" value={userEmail || '–'} />
          <Hint>Daten und Einstellungen werden über alle Geräte dieses Kontos synchronisiert.</Hint>
        </Card>

        <Card title="Google Drive">
          <InfoRow
            label="Status"
            value={
              !drive ? (driveError ? <><StatusDot color="var(--red)" />Nicht verfügbar</> : 'Wird geprüft…')
              : drive.connected ? <><StatusDot color="var(--green)" />Verbunden</>
              : drive.configured ? <><StatusDot color="var(--label3)" />Nicht verbunden</>
              : <><StatusDot color="var(--orange)" />Nicht eingerichtet</>
            }
          />
          {drive?.connected && drive.account && <InfoRow label="Google-Konto" value={drive.account} />}
          <InfoRow label="Ablage" value="GarageOS / Aufträge, Rechnungen, Offerten, Wartungspläne, Sonstiges" />

          {driveError && <p role="alert" style={{ fontSize: 13, marginTop: 10, color: 'var(--red)', lineHeight: 1.45 }}>{driveError}</p>}

          {drive?.connected ? (
            <button className="text-danger-btn" onClick={handleDriveDisconnect} disabled={driveBusy}>
              {driveBusy ? 'Wird getrennt…' : 'Verbindung trennen'}
            </button>
          ) : (
            <button
              className="btn-system btn-primary"
              style={{ marginTop: 14, height: 44, fontSize: 15, width: '100%' }}
              onClick={handleDriveConnect}
              disabled={driveBusy || !drive?.configured}
            >
              {driveBusy ? 'Weiterleitung…' : 'Google Drive verbinden'}
            </button>
          )}

          <div role="note" style={{ marginTop: 12, padding: '10px 12px', background: 'var(--orange-tint)', borderRadius: 'var(--radius-sm)', fontSize: 13, lineHeight: 1.45, color: 'var(--label)' }}>
            <strong style={{ color: 'var(--orange)' }}>Wann ein PDF nur lokal bleibt</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>PDFs über 25 MB werden nicht nach Google Drive hochgeladen.</li>
              <li>Schlägt ein Upload endgültig fehl oder wird der Tab vorher geschlossen, gibt es keinen automatischen Nachversuch. Exportiere das PDF dann erneut.</li>
            </ul>
          </div>

          <Hint>
            Jedes heruntergeladene PDF wird zusätzlich in deinem Google Drive unter „GarageOS/Dokumentart/Kunde“ gespeichert, zum Beispiel „GarageOS/Rechnungen/Max Muster“. Die App sieht dort nur die Dateien, die sie selbst angelegt hat. Einen von Hand erstellten Ordner „GarageOS“ erkennt sie deshalb nicht und legt daneben einen eigenen an.
          </Hint>

          {drive && !drive.configured && (
            <details open className="settings-details">
              <summary>Einrichtung</summary>
              <ol>
                <li><strong>console.cloud.google.com</strong> → „APIs &amp; Dienste“ → <strong>Google Drive API</strong> aktivieren.</li>
                <li>OAuth-Zustimmungsbildschirm einrichten, Scope <code>drive.file</code> hinzufügen und auf <strong>In Produktion</strong> stellen (im Modus „Testing“ läuft die Verbindung nach 7 Tagen ab).</li>
                <li>„Anmeldedaten“ → OAuth-Client-ID (Webanwendung) mit dieser Weiterleitungs-URI erstellen: <code>{drive.redirectUri}</code></li>
                <li>Vercel → Settings → Environment Variables (Production): {drive.missing.map((k, i) => <span key={k}>{i > 0 && ', '}<code>{k}</code></span>)} eintragen, danach <strong>Redeploy</strong>.</li>
              </ol>
            </details>
          )}
        </Card>

        <Card title="Teile-Import">
          <p className="cf-label" style={{ marginBottom: 6 }}>Teile per iPhone importieren</p>
          <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: 0 }}>
            Mit einer iOS-Kurzbefehl-Automatisierung lässt sich ein geteilter Link (z.B. aus der Autodoc-App)
            direkt in GarageOS importieren:
          </p>
          <ol style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '8px 0 0', paddingLeft: 18 }}>
            <li>Kurzbefehle-App → Neuer Kurzbefehl → Aktion „Text erhalten, wenn geteilt&nbsp;wird&quot; hinzufügen.</li>
            <li>Aktion „URL öffnen&quot; hinzufügen. Ins URL-Feld <strong>nur genau diesen Text</strong> einfügen (keine Klammern, kein Platzhalter):<br />
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {window.location.origin}/?import_url=
              </code>
            </li>
            <li>Direkt danach im selben URL-Feld auf das blaue <strong>＋</strong> tippen und die Variable „Kurzbefehl-Eingabe&quot; einfügen (nicht abtippen!). Bei dieser Variable unter „Formatieren&quot; → „Text&quot; die Option „URL-codieren&quot; aktivieren.</li>
            <li>Unter „Details&quot; → „Im Freigabe-Sheet anzeigen&quot; aktivieren und Autodoc als zulässige App erlauben.</li>
            <li>In der Autodoc-App auf Teilen tippen und den neuen Kurzbefehl auswählen – GarageOS öffnet sich mit dem erkannten Teil.</li>
          </ol>

          <ShortcutKeySection />

          <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Teile per Desktop-Browser importieren</p>
          <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
            Dieses Lesezeichen liest Titel, Preis und Artikelnummer direkt von der geöffneten Autodoc/ATP-Produktseite
            und öffnet GarageOS damit vorausgefüllt. Ist eine Offerte aktiv (zuletzt geöffnet oder im Offerten-Tab
            gewählt), landet das Teil direkt darin und der Tab schliesst sich wieder – sonst erscheint der Import-Dialog.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <a
              href={bookmarklet}
              className="mf-btn-save"
              style={{ display: 'inline-flex' }}
              onClick={(e) => e.preventDefault()}
              draggable
            >
              🔧 Teil importieren
            </a>
            <span style={{ fontSize: 12, color: 'var(--label3)' }}>← zur Lesezeichenleiste ziehen</span>
          </div>

          <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '0 0 6px' }}>
            Zieht der Browser nicht mit (z.B. per Touchpad), Code manuell als Lesezeichen anlegen:
          </p>
          <ol style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '0 0 10px', paddingLeft: 18 }}>
            <li>Neues Lesezeichen anlegen (beliebiger Name, z.B. „Teil importieren&quot;).</li>
            <li>Unten stehenden Code als URL/Adresse einfügen und speichern.</li>
          </ol>
          <textarea
            readOnly
            value={bookmarklet}
            onFocus={(e) => e.currentTarget.select()}
            className="cf-textarea"
            rows={3}
            style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', resize: 'vertical' }}
          />
        </Card>
      </>)}

      {section === 'system' && (<>
        <Card title="Gerät & Layout">
          <InfoRow label="Aktives Layout" value={isDesktop ? 'Laptop / Desktop' : 'iPhone / Tablet (Touch)'} />
          <Hint>Wechselt automatisch ab 1024 px Fensterbreite – Seitenleiste fest angedockt, Dialoge zentriert.</Hint>
        </Card>

        <Card title="App-Info">
          <InfoRow label="Build" value={BUILD_DATE} />
          {BUILD_SHA && <InfoRow label="Version" value={BUILD_SHA} mono />}
          <button className="btn-system btn-secondary" style={{ marginTop: 16, height: 44, fontSize: 15, width: '100%' }} onClick={() => { void hardReload(); }}>
            App neu laden
          </button>
          <Hint>Lädt die neueste Version und leert veraltete Caches.</Hint>
        </Card>
      </>)}
    </>
  );

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: -0.5,
        color: 'var(--label)',
        margin: '8px 0 20px',
      }}>
        Einstellungen
      </h1>

      {isDesktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          {nav}
          <div style={{ maxWidth: 780 }}>{content}</div>
        </div>
      ) : (
        <>
          {nav}
          {content}
        </>
      )}
    </div>
  );
}
