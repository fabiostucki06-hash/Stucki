import { useState, useEffect } from 'react';
import { ASSETS } from '../../lib/supabase';
import { setIban, setMargin, setSignature, setDriveFolderId, type BgMode } from '../../lib/settings';
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
import type { SyncStatus } from '../../types';

const WALLPAPERS = [
  { id: 'wp1', label: 'Wallpaper 1', url: ASSETS.wallpaper1 },
  { id: 'wp2', label: 'Wallpaper 2', url: ASSETS.wallpaper2 },
  { id: 'wp3', label: 'Wallpaper 3', url: ASSETS.wallpaper3 },
];

const SOLID_COLORS = [
  { id: 'black',     label: 'Schwarz',       hex: '#000000' },
  { id: 'anthrazit', label: 'Anthrazit',     hex: '#1e293b' },
  { id: 'midnight',  label: 'Mitternacht',   hex: '#0f172a' },
  { id: 'indigo',    label: 'Dunkelblau',    hex: '#312e81' },
  { id: 'green',     label: 'Dunkelgrün',    hex: '#14532d' },
  { id: 'gray',      label: 'Neutrales Grau', hex: '#6b7280' },
  { id: 'lightgray', label: 'Hellgrau',      hex: '#F2F2F7' },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

type SectionId = 'werkstatt' | 'dokumente' | 'integrationen' | 'system';

const SECTIONS: { id: SectionId; icon: React.ReactNode; label: string; short: string; hint: string }[] = [
  { id: 'werkstatt',     icon: <SFWrench />,   label: 'Werkstatt & Firmendaten', short: 'Werkstatt',     hint: 'Adresse, IBAN, Stundensatz, Marge' },
  { id: 'dokumente',     icon: <SFDocCheck />, label: 'Unterschrift & Dokumente', short: 'Dokumente',     hint: 'Unterschrift, Zahlungsbedingungen' },
  { id: 'integrationen', icon: <SFCloud />,    label: 'Integrationen & Cloud',   short: 'Integrationen', hint: 'Sync, Google Drive, Teile-Import' },
  { id: 'system',        icon: <SFGear />,     label: 'System & App-Info',       short: 'System',        hint: 'Hintergrund, Layout, Build' },
];

const SECTION_KEY = 'garage_settings_section';

function readSection(): SectionId {
  try {
    const v = localStorage.getItem(SECTION_KEY);
    if (SECTIONS.some((s) => s.id === v)) return v as SectionId;
  } catch { /* storage blocked */ }
  return 'werkstatt';
}

/** Glass card with an uppercase heading — the container every settings group uses. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.70)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.5)',
      boxShadow: '0 8px 32px 0 rgba(0,0,0,0.10)',
      borderRadius: 18,
      padding: '18px 18px 22px',
      marginBottom: 20,
    }}>
      <p style={{
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color: 'var(--label2)',
        marginBottom: 16,
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

/** Read-only label / value line. */
function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
      <span style={{ fontSize: 13, color: 'var(--label2)', flex: '0 0 auto', minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 15, color: 'var(--label)', flex: 1, textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

function Hint({ children, mb }: { children: React.ReactNode; mb?: number }) {
  return <p style={{ fontSize: 12, color: 'var(--label3)', marginTop: 8, marginBottom: mb }}>{children}</p>;
}

function StatusDot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, boxShadow: `0 0 6px ${color}`, marginRight: 7, verticalAlign: 'middle' }} />;
}

const SYNC_TEXT: Record<SyncStatus, { color: string; text: string }> = {
  idle:   { color: '#8E8E93', text: 'Bereit' },
  saving: { color: '#FF9500', text: 'Synchronisiert…' },
  ok:     { color: '#34C759', text: 'Gespeichert' },
  error:  { color: '#FF3B30', text: 'Fehler beim Speichern' },
};

type DriveState = 'checking' | 'on' | 'off' | 'unavailable';

interface SettingsViewProps {
  currentWallpaper: string;
  onWallpaperChange: (url: string) => void;
  bgMode: BgMode;
  bgColor: string;
  onBgColorChange: (hex: string) => void;
  syncStatus: SyncStatus;
  userEmail: string | null;
}

export default function SettingsView({ currentWallpaper, onWallpaperChange, bgMode, bgColor, onBgColorChange, syncStatus, userEmail }: SettingsViewProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const { iban, margin, signature, driveFolderId } = useSettings();
  const isDesktop = useIsDesktop();
  const [section, setSection] = useState<SectionId>(readSection);
  const [sigLoading, setSigLoading] = useState(false);
  const [drive, setDrive] = useState<DriveState>('checking');
  // Raw text of the folder field (may be a pasted URL); only a valid ID is stored.
  const [folderDraft, setFolderDraft] = useState(driveFolderId);
  const [driveTest, setDriveTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; message?: string }>({ state: 'idle' });
  const folderValid = isDriveFolderId(parseDriveFolderId(folderDraft));
  const [bgTab, setBgTab] = useState<'bilder' | 'unifarben'>(bgMode === 'color' ? 'unifarben' : 'bilder');
  const bookmarklet = buildImportBookmarklet(window.location.origin);
  // Separate draft buffer: the hex text field must let the user type freely
  // ("#", "#1", "#1e"…) without committing/persisting an invalid color on
  // every keystroke. Only a complete, valid hex is forwarded to onBgColorChange.
  const [hexDraft, setHexDraft] = useState(bgMode === 'color' ? bgColor : '');

  function selectSection(id: SectionId) {
    setSection(id);
    try { localStorage.setItem(SECTION_KEY, id); } catch { /* storage blocked */ }
  }

  function handleHexInput(v: string) {
    setHexDraft(v);
    if (HEX_RE.test(v)) onBgColorChange(v);
  }

  // Keep the draft in sync when the color changes via a preset swatch or the
  // native <input type="color"> picker (not while the user is mid-typing an
  // invalid draft — HEX_RE above already filters those commits out).
  useEffect(() => {
    setHexDraft(bgMode === 'color' ? bgColor : '');
  }, [bgMode, bgColor]);

  // Adopt a folder ID changed on another device (keep a pasted URL that resolves to it).
  useEffect(() => {
    setFolderDraft((d) => (parseDriveFolderId(d) === driveFolderId ? d : driveFolderId));
  }, [driveFolderId]);

  function handleFolderInput(v: string) {
    setFolderDraft(v);
    setDriveTest({ state: 'idle' });
    const id = parseDriveFolderId(v);
    if (!id) setDriveFolderId('');
    else if (isDriveFolderId(id)) setDriveFolderId(id);
  }

  async function handleDriveTest() {
    setDriveTest({ state: 'running' });
    const r = await testDriveFolder(folderValid ? parseDriveFolderId(folderDraft) : '');
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

  useEffect(() => {
    const blobs: string[] = [];
    WALLPAPERS.forEach(({ id, url }) => {
      fetch(url, { cache: 'no-cache' })
        .then(r => r.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          blobs.push(blobUrl);
          setThumbs(prev => ({ ...prev, [id]: blobUrl }));
        })
        .catch(() => {});
    });
    return () => blobs.forEach(URL.revokeObjectURL);
  }, []);

  // Google Drive status: the upload endpoint answers GET with { configured }.
  // 404 = no /api (local vite dev).
  useEffect(() => {
    if (section !== 'integrationen' || drive !== 'checking') return;
    let cancelled = false;
    fetch('/api/drive-upload', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: boolean } | null) => {
        if (!cancelled) setDrive(!j ? 'unavailable' : j.configured ? 'on' : 'off');
      })
      .catch(() => { if (!cancelled) setDrive('unavailable'); });
    return () => { cancelled = true; };
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
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', width: '100%', textAlign: 'left' }}
          >
            <span className="settings-tab-icon">{s.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: on ? 600 : 500, letterSpacing: -0.3 }}>{s.label}</span>
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
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: 'var(--label)', margin: 0 }}>{active.label}</h2>
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
            Wird beim Import eines Teils automatisch auf den Einkaufspreis (EK) aufgeschlagen, um den Verkaufspreis (VK) vorzuschlagen.
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
                background: 'rgba(120,120,128,0.12)', border: '1px solid rgba(255,255,255,0.14)',
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
              : drive === 'on' ? <><StatusDot color="#34C759" />Eingerichtet</>
              : drive === 'off' ? <><StatusDot color="#FF9500" />Nicht eingerichtet</>
              : <><StatusDot color="#8E8E93" />Nicht verfügbar</>
            }
          />
          <InfoRow label="Ablage" value={`${driveFolderId ? 'Eigener Ordner' : 'GarageOS'} / Typ / Jahr`} />

          <div className="cf-field" style={{ marginTop: 16 }}>
            <label className="cf-label" htmlFor="drive-folder">Google Drive Ordner-ID</label>
            <input
              id="drive-folder"
              className="cf-input"
              value={folderDraft}
              onChange={(e) => handleFolderInput(e.target.value)}
              placeholder="z.B. 1AbCdEfGhIjKlMnOpQrStUvWxYz"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              style={{ fontFamily: 'monospace', fontSize: 14 }}
            />
          </div>
          {folderDraft.trim() && !folderValid ? (
            <p style={{ fontSize: 12, color: '#FF3B30', marginTop: 8 }}>Keine gültige Ordner-ID – bitte ID oder Ordner-Link einfügen.</p>
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
              <StatusDot color={driveTest.state === 'ok' ? '#34C759' : '#FF3B30'} />
              {driveTest.message}
            </p>
          )}

          <Hint>
            Jedes exportierte PDF (Offerten, Auftragsbestätigungen, Rechnungen …) wird automatisch als Archivkopie auf Google Drive gespeichert.
            Die Google-Zugangsdaten liegen aus Sicherheitsgründen nur auf dem Server (Vercel) – der Ordner muss für dieses Google-Konto beschreibbar sein.
          </Hint>
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
        <Card title="Hintergrund">
          <div className="seg-ctrl" style={{ marginBottom: 16 }}>
            <button className={`seg-item${bgTab === 'bilder' ? ' active' : ''}`} onClick={() => setBgTab('bilder')}>Bilder</button>
            <button className={`seg-item${bgTab === 'unifarben' ? ' active' : ''}`} onClick={() => setBgTab('unifarben')}>Unifarben</button>
          </div>

          {bgTab === 'bilder' && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {WALLPAPERS.map((wp) => {
              const active = bgMode === 'image' && currentWallpaper === wp.url;
              return (
                <button
                  key={wp.id}
                  onClick={() => onWallpaperChange(wp.url)}
                  style={{
                    position: 'relative',
                    width: 160,
                    height: 100,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: active
                      ? '2.5px solid #007AFF'
                      : '2.5px solid rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'rgba(120,120,128,0.12)',
                    boxShadow: active
                      ? '0 0 0 4px rgba(0,122,255,0.18), 0 4px 16px rgba(0,0,0,0.15)'
                      : '0 2px 10px rgba(0,0,0,0.12)',
                    transition: 'all 0.18s ease',
                    transform: active ? 'scale(1.03)' : 'scale(1)',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                  aria-label={wp.label}
                  aria-pressed={active}
                >
                  <img
                    src={thumbs[wp.id] ?? wp.url}
                    alt={wp.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />

                  {/* Selection badge */}
                  {active && (
                    <div style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: 'linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.2)',
                      border: '1px solid #004fb0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}>
                      <SFCheckmark />
                    </div>
                  )}

                  {/* Label */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 8px 6px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#fff',
                    textAlign: 'left',
                    letterSpacing: -0.2,
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}>
                    {wp.label}
                  </div>
                </button>
              );
            })}
          </div>
          )}

          {bgTab === 'unifarben' && (
          <div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              {SOLID_COLORS.map((c) => {
                const active = bgMode === 'color' && bgColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.id}
                    onClick={() => onBgColorChange(c.hex)}
                    style={{
                      position: 'relative',
                      width: 64,
                      height: 64,
                      borderRadius: 14,
                      cursor: 'pointer',
                      padding: 0,
                      background: c.hex,
                      border: active ? '2.5px solid #007AFF' : '2.5px solid rgba(255,255,255,0.6)',
                      boxShadow: active
                        ? '0 0 0 4px rgba(0,122,255,0.18), 0 4px 16px rgba(0,0,0,0.15)'
                        : '0 2px 10px rgba(0,0,0,0.12)',
                      transition: 'all 0.18s ease',
                      transform: active ? 'scale(1.05)' : 'scale(1)',
                      flexShrink: 0,
                    }}
                    aria-label={c.label}
                    aria-pressed={active}
                    title={c.label}
                  >
                    {active && (
                      <div style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        background: 'linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.2)',
                        border: '1px solid #004fb0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                      }}>
                        <SFCheckmark />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="cf-field">
              <label className="cf-label">Eigene Farbe</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="color"
                  value={bgMode === 'color' ? bgColor : '#1C1C1E'}
                  onChange={(e) => onBgColorChange(e.target.value)}
                  style={{ width: 44, height: 36, border: '1.5px solid var(--input-border)', borderRadius: 8, padding: 2, cursor: 'pointer', background: 'var(--input-bg)' }}
                  aria-label="Eigene Hintergrundfarbe"
                />
                <input
                  className="cf-input"
                  style={{ flex: 1 }}
                  value={hexDraft}
                  onChange={(e) => handleHexInput(e.target.value)}
                  placeholder="#1e293b"
                />
              </div>
            </div>
          </div>
          )}
        </Card>

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
