import { useState, useEffect } from 'react';
import { setIban, setMargin, setSignature, setDriveFolderId } from '../../lib/settings';
import { parseDriveFolderId, isDriveFolderId, testDriveFolder } from '../../lib/drive';
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

const SECTIONS: { id: SectionId; icon: React.ReactNode; label: string; short: string; hint: string }[] = [
  { id: 'werkstatt',     icon: <SFWrench />,   label: 'Werkstatt & Firmendaten', short: 'Werkstatt',     hint: 'Adresse, IBAN, Stundensatz, Marge, Pauschalen' },
  { id: 'dokumente',     icon: <SFDocCheck />, label: 'Unterschrift & Dokumente', short: 'Dokumente',     hint: 'Unterschrift, Zahlungsbedingungen' },
  { id: 'integrationen', icon: <SFCloud />,    label: 'Integrationen & Cloud',   short: 'Integrationen', hint: 'Sync, Google Drive, Teile-Import' },
  { id: 'system',        icon: <SFGear />,     label: 'System & App-Info',       short: 'System',        hint: 'Layout, Build' },
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
  idle:   { color: '#64748b', text: 'Bereit' },
  saving: { color: '#fbbf24', text: 'Synchronisiert…' },
  ok:     { color: '#4ade80', text: 'Gespeichert' },
  error:  { color: '#f87171', text: 'Fehler beim Speichern' },
};

type DriveState = 'checking' | 'on' | 'off' | 'unavailable';

interface SettingsViewProps {
  syncStatus: SyncStatus;
  userEmail: string | null;
}

export default function SettingsView({ syncStatus, userEmail }: SettingsViewProps) {
  const { iban, margin, signature, driveFolderId } = useSettings();
  const isDesktop = useIsDesktop();
  const [section, setSection] = useState<SectionId>(readSection);
  const [sigLoading, setSigLoading] = useState(false);
  const [drive, setDrive] = useState<DriveState>('checking');
  // Raw text of the folder field (may be a pasted URL); only a valid ID is stored.
  const [folderDraft, setFolderDraft] = useState(driveFolderId);
  const [driveTest, setDriveTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; message?: string }>({ state: 'idle' });
  /** Required Vercel env vars the server reports as unset. */
  const [driveMissing, setDriveMissing] = useState<string[]>([]);
  /** Google account the uploads run as (from the last successful test). */
  const [driveAccount, setDriveAccount] = useState('');
  const [linkFixed, setLinkFixed] = useState(false);
  const folderValid = isDriveFolderId(parseDriveFolderId(folderDraft));
  const bookmarklet = buildImportBookmarklet(window.location.origin);
  function selectSection(id: SectionId) {
    setSection(id);
    try { localStorage.setItem(SECTION_KEY, id); } catch { /* storage blocked */ }
  }

  // Adopt a folder ID changed on another device (keep a pasted URL that resolves to it).
  useEffect(() => {
    setFolderDraft((d) => (parseDriveFolderId(d) === driveFolderId ? d : driveFolderId));
  }, [driveFolderId]);

  function handleFolderInput(v: string) {
    setDriveTest({ state: 'idle' });
    const id = parseDriveFolderId(v);
    // A pasted Drive link is reduced to its ID right away, so the field shows what is stored.
    const fixed = id !== v.trim() && isDriveFolderId(id);
    setLinkFixed(fixed);
    setFolderDraft(fixed ? id : v);
    if (!id) setDriveFolderId('');
    else if (isDriveFolderId(id)) setDriveFolderId(id);
  }

  async function handleDriveTest() {
    setDriveTest({ state: 'running' });
    const r = await testDriveFolder(folderValid ? parseDriveFolderId(folderDraft) : '');
    if (r.ok) {
      setDrive('on');
      setDriveMissing([]);
      setDriveAccount(r.account);
    } else if (r.missing?.length) {
      setDrive('off');
      setDriveMissing(r.missing);
    }
    setDriveTest(r.ok
      ? { state: 'ok', message: `Verbindung OK – Zielordner: „${r.name}“` }
      : { state: 'error', message: r.error });
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

  // Google Drive status: the upload endpoint answers GET with { configured, missing }.
  // 404 = no /api (local vite dev). Once configured, the connection is tested
  // right away so the status can say "Eingerichtet & Verbunden".
  useEffect(() => {
    if (section !== 'integrationen' || drive !== 'checking') return;
    let cancelled = false;
    fetch('/api/drive-upload', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: boolean; missing?: string[] } | null) => {
        if (cancelled) return;
        setDrive(!j ? 'unavailable' : j.configured ? 'on' : 'off');
        setDriveMissing(j?.missing ?? []);
        if (j?.configured) void handleDriveTest();
      })
      .catch(() => { if (!cancelled) setDrive('unavailable'); });
    return () => { cancelled = true; };
    // handleDriveTest reads the current field; it must not re-trigger this probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, drive]);

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
            <span className="settings-tab-icon">{s.icon}</span>
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
            <span className="settings-tab-icon">{s.icon}</span>
            {s.short}
          </button>
        );
      })}
    </nav>
  );

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: isDesktop ? '0 0 16px' : '4px 0 16px' }}>
        <span className="settings-tab-icon active">{active.icon}</span>
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
              drive === 'checking' ? 'Wird geprüft…'
              : drive === 'on' && driveTest.state === 'ok' ? <><StatusDot color="#4ade80" />Eingerichtet &amp; Verbunden</>
              : drive === 'on' && driveTest.state === 'error' ? <><StatusDot color="#f87171" />Eingerichtet – Verbindung fehlgeschlagen</>
              : drive === 'on' ? <><StatusDot color="#4ade80" />Eingerichtet</>
              : drive === 'off' ? <><StatusDot color="#fbbf24" />Nicht eingerichtet</>
              : <><StatusDot color="#64748b" />Nicht verfügbar</>
            }
          />
          {driveAccount && <InfoRow label="Google-Konto" value={driveAccount} />}
          <InfoRow label="Ablage" value={`${driveFolderId ? 'Eigener Ordner' : 'GarageOS'} / Typ / Jahr`} />

          {drive === 'off' && driveMissing.length > 0 && (
            <div role="alert" style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, color: 'var(--label)',
              background: 'var(--orange-tint)', border: 'none',
            }}>
              In Vercel fehlen: {driveMissing.map((k, i) => (
                <span key={k}>{i > 0 && ', '}<code style={{ fontSize: 12, fontWeight: 600 }}>{k}</code></span>
              ))}. Anleitung unten unter „Einrichtung auf Vercel“.
            </div>
          )}

          <div className="cf-field" style={{ marginTop: 16 }}>
            <label className="cf-label" htmlFor="drive-folder">Google Drive Ordner-ID</label>
            <input
              id="drive-folder"
              className="cf-input"
              value={folderDraft}
              onChange={(e) => handleFolderInput(e.target.value)}
              placeholder="ID oder Ordner-Link einfügen"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              style={{ fontFamily: 'monospace', fontSize: 14 }}
            />
          </div>
          {folderDraft.trim() && !folderValid ? (
            <p style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>Keine gültige Ordner-ID – bitte ID oder Ordner-Link einfügen.</p>
          ) : linkFixed ? (
            <p style={{ fontSize: 12, color: '#4ade80', marginTop: 8 }}>✓ Link erkannt – nur die Ordner-ID wurde übernommen und gespeichert.</p>
          ) : (
            <Hint>
              Ordner in Google Drive öffnen und die ID aus der Adresse kopieren:{' '}
              <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>drive.google.com/drive/folders/<strong>&lt;ID&gt;</strong></span>.
              Der ganze Link darf auch eingefügt werden. Leer lassen = Standardordner „GarageOS“.
            </Hint>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              className="mf-btn-save"
              style={{ height: 40, padding: '0 20px', fontSize: 14 }}
              onClick={handleDriveTest}
              disabled={driveTest.state === 'running' || (!!folderDraft.trim() && !folderValid)}
            >
              {driveTest.state === 'running' ? 'Wird getestet…' : 'Verbindung testen'}
            </button>
            {driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}
              >
                Ordner öffnen ↗
              </a>
            )}
          </div>
          {(driveTest.state === 'ok' || driveTest.state === 'error') && (
            <p role="status" style={{ fontSize: 13, marginTop: 10, color: 'var(--label)', lineHeight: 1.45 }}>
              <StatusDot color={driveTest.state === 'ok' ? '#4ade80' : '#f87171'} />
              {driveTest.message}
            </p>
          )}

          <Hint>
            Jedes exportierte PDF (Offerten, Auftragsbestätigungen, Rechnungen …) wird automatisch als Archivkopie auf Google Drive gespeichert.
            Die Google-Zugangsdaten liegen aus Sicherheitsgründen nur auf dem Server (Vercel) – der Ordner muss für dieses Google-Konto beschreibbar sein.
          </Hint>

          <details open={drive === 'off'} className="settings-details">
            <summary>Einrichtung auf Vercel</summary>
            <p>Vercel → Projekt → <strong>Settings → Environment Variables</strong> (Production), danach <strong>Redeploy</strong>:</p>
            <ul className="settings-envlist">
              {[
                { k: 'GOOGLE_CLIENT_ID', d: 'OAuth-Client-ID (Typ „Webanwendung“)' },
                { k: 'GOOGLE_CLIENT_SECRET', d: 'Clientschlüssel zum selben OAuth-Client' },
                { k: 'GOOGLE_REFRESH_TOKEN', d: 'Refresh-Token des Google-Kontos, in dessen Drive gespeichert wird' },
                { k: 'GOOGLE_DRIVE_FOLDER_ID', d: 'optional – Standardordner, wenn oben keiner eingetragen ist' },
              ].map(({ k, d }) => {
                const isMissing = driveMissing.includes(k);
                return (
                  <li key={k}>
                    <code style={{ color: isMissing ? '#fbbf24' : undefined }}>{k}</code>
                    {isMissing && <span style={{ color: '#fbbf24', fontWeight: 600 }}> · fehlt</span>}
                    <br /><span>{d}</span>
                  </li>
                );
              })}
            </ul>
            <ol>
              <li><strong>console.cloud.google.com</strong> → Projekt wählen → „APIs &amp; Dienste“ → <strong>Google Drive API</strong> aktivieren.</li>
              <li>„Anmeldedaten“ → OAuth-Client-ID erstellen (Webanwendung), Weiterleitungs-URI <code>https://developers.google.com/oauthplayground</code> eintragen → ID + Schlüssel kopieren.</li>
              <li><strong>developers.google.com/oauthplayground</strong> → Zahnrad → „Use your own OAuth credentials“ → ID + Schlüssel eintragen → Scope <code>https://www.googleapis.com/auth/drive</code> autorisieren → „Exchange authorization code for tokens“ → <strong>Refresh token</strong> kopieren.</li>
              <li>Ist der OAuth-Zustimmungsbildschirm im Modus „Testing“, läuft der Token nach 7 Tagen ab – auf „In Produktion“ stellen.</li>
              <li>Ordner von einem anderen Konto? Dort in Drive „Freigeben“ → das oben angezeigte Google-Konto als <strong>Bearbeiter</strong> hinzufügen.</li>
            </ol>
            <p style={{ color: 'var(--label3)' }}>
              Ein Service-Account (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY) funktioniert hier nicht: Er hat keinen eigenen Speicherplatz und kann
              in „Meine Ablage“ keine Dateien anlegen – deshalb nutzt die App den Refresh-Token eines normalen Google-Kontos.
            </p>
          </details>
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
