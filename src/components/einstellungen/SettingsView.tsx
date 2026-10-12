import { useState, useEffect } from 'react';
import { ASSETS } from '../../lib/supabase';
import { getIban, setIban, getMargin, setMargin, type BgMode } from '../../lib/settings';
import { buildImportBookmarklet } from '../../lib/bookmarklet';
import { SFCheckmark } from '../Icons';

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

interface SettingsViewProps {
  currentWallpaper: string;
  onWallpaperChange: (url: string) => void;
  bgMode: BgMode;
  bgColor: string;
  onBgColorChange: (hex: string) => void;
}

export default function SettingsView({ currentWallpaper, onWallpaperChange, bgMode, bgColor, onBgColorChange }: SettingsViewProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [iban, setIbanValue] = useState<string>(() => getIban());
  const [margin, setMarginValue] = useState<number>(() => getMargin());
  const [bgTab, setBgTab] = useState<'bilder' | 'unifarben'>(bgMode === 'color' ? 'unifarben' : 'bilder');
  const bookmarklet = buildImportBookmarklet(window.location.origin);
  // Separate draft buffer: the hex text field must let the user type freely
  // ("#", "#1", "#1e"…) without committing/persisting an invalid color on
  // every keystroke. Only a complete, valid hex is forwarded to onBgColorChange.
  const [hexDraft, setHexDraft] = useState(bgMode === 'color' ? bgColor : '');

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

  function handleIbanChange(v: string) {
    setIbanValue(v);
    setIban(v);
  }

  function handleMarginChange(v: string) {
    const n = parseFloat(v);
    const pct = Number.isFinite(n) ? n : 0;
    setMarginValue(pct);
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

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: -0.5,
        color: 'var(--label)',
        margin: '8px 0 24px',
      }}>
        Einstellungen
      </h1>

      {/* Wallpaper Section */}
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
          Hintergrund
        </p>

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
      </div>

      {/* Zahlungsinformationen */}
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
          Zahlungsinformationen
        </p>

        <div className="cf-field">
          <label className="cf-label">Haupt-IBAN / QR-IBAN</label>
          <input
            className="cf-input"
            value={iban}
            onChange={(e) => handleIbanChange(e.target.value)}
            placeholder="CH00 0000 0000 0000 0000 0"
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--label3)', marginTop: 8 }}>
          Wird für den Swiss QR-Code auf der Rechnung verwendet.
        </p>
      </div>

      {/* Teile-Import */}
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
          Teile-Import
        </p>

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
        <p style={{ fontSize: 12, color: 'var(--label3)', marginTop: 8, marginBottom: 16 }}>
          Wird beim Import eines Teils automatisch auf den Einkaufspreis (EK) aufgeschlagen, um den Verkaufspreis (VK) vorzuschlagen.
        </p>

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

        <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Teile per Desktop-Browser importieren</p>
        <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
          Dieses Lesezeichen liest Titel, Preis und Artikelnummer direkt von der geöffneten Autodoc/ATP-Produktseite
          und öffnet GarageOS damit vorausgefüllt.
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
      </div>
    </div>
  );
}
