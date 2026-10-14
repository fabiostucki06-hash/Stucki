import { useState } from 'react';
import { generateShortcutKey } from '../../lib/shortcutKey';

const codeStyle = { fontSize: 11, wordBreak: 'break-all' } as const;

/** Settings block for the background import: a Shortcut POSTs the shared link
    to /api/import-shortcut, which adds the part to the active Offerte without
    opening the app. The key is shown only right after generating it. */
export default function ShortcutKeySection() {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setBusy(true); setError(null); setCopied(false);
    try {
      setKey(await generateShortcutKey());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Schlüssel konnte nicht erzeugt werden.');
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    if (!key) return;
    navigator.clipboard?.writeText(key).then(() => setCopied(true), () => setCopied(false));
  }

  return (
    <>
      <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Teile im Hintergrund importieren (ohne App zu öffnen)</p>
      <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Statt „URL öffnen&quot; kann der Kurzbefehl den Link direkt an GarageOS senden. Das Teil landet dann in der
        aktiven Offerte, und der Kurzbefehl zeigt nur eine kurze Bestätigung an.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" className="mf-btn-save" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Wird erzeugt…' : 'Kurzbefehl-Schlüssel erzeugen'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--label3)' }}>Ein neuer Schlüssel macht den alten ungültig.</span>
      </div>
      {error && <p style={{ fontSize: 12, color: '#FF3B30', margin: '0 0 10px' }}>{error}</p>}
      {key && (
        <div style={{ marginBottom: 10 }}>
          <textarea
            readOnly
            value={key}
            onFocus={(e) => e.currentTarget.select()}
            className="cf-textarea"
            rows={2}
            style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', resize: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <button type="button" className="mf-btn-save" onClick={handleCopy}>Kopieren</button>
            <span style={{ fontSize: 12, color: copied ? '#34C759' : 'var(--label3)' }}>
              {copied ? 'Kopiert.' : 'Wird nur jetzt angezeigt – gleich in den Kurzbefehl einfügen.'}
            </span>
          </div>
        </div>
      )}

      <ol style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '0', paddingLeft: 18 }}>
        <li>Kurzbefehl wie oben anlegen, aber statt „URL öffnen&quot; die Aktion „Inhalte von URL abrufen&quot; verwenden. Als URL genau diesen Text, dahinter den Schlüssel von oben:<br />
          <code style={codeStyle}>{window.location.origin}/api/import-shortcut?token=</code>
        </li>
        <li>Direkt danach <code style={codeStyle}>&amp;import_url=</code> anhängen und über das blaue <strong>＋</strong> die Variable „Kurzbefehl-Eingabe&quot; einfügen (unter „Formatieren&quot; → „URL-codieren&quot;). Optional{' '}
          <code style={codeStyle}>&amp;active_offerte_id=…</code> für eine bestimmte Offerte. Methode „GET&quot; reicht.</li>
        <li>Aktion „Wörterbuchwert abrufen&quot; für <code style={codeStyle}>message</code> und danach „Mitteilung anzeigen&quot;.</li>
        <li>Optional: Ist <code style={codeStyle}>open_url</code> vorhanden (keine aktive Offerte, Preis nicht erkannt), diese mit „URL öffnen&quot; öffnen – dann erscheint der Import-Dialog.</li>
      </ol>
    </>
  );
}
