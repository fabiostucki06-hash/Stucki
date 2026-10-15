const codeStyle = { fontSize: 11, wordBreak: 'break-all' } as const;

/** Settings block for the background import: a Shortcut GETs the shared link
    from /api/import-part, which adds the part to the active Offerte without
    opening the app. No key needed. */
export default function ShortcutKeySection() {
  return (
    <>
      <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Teile im Hintergrund importieren (ohne App zu öffnen)</p>
      <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Statt „URL öffnen&quot; kann der Kurzbefehl den Link direkt an GarageOS senden. Das Teil landet dann in der
        aktiven Offerte, und der Kurzbefehl zeigt nur eine kurze Bestätigung an. Ein Schlüssel ist nicht nötig.
      </p>

      <ol style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '0', paddingLeft: 18 }}>
        <li>Kurzbefehl wie oben anlegen, aber statt „URL öffnen&quot; die Aktion „Inhalte von URL abrufen&quot; verwenden. Als URL genau diesen Text:<br />
          <code style={codeStyle}>{window.location.origin}/api/import-part?import_url=</code>
        </li>
        <li>Direkt danach über das blaue <strong>＋</strong> die Variable „Kurzbefehl-Eingabe&quot; einfügen (unter „Formatieren&quot; → „URL-codieren&quot;). Optional{' '}
          <code style={codeStyle}>&amp;active_offerte_id=…</code> für eine bestimmte Offerte. Methode „GET&quot; reicht.</li>
        <li>Aktion „Wörterbuchwert abrufen&quot; für <code style={codeStyle}>message</code> und danach „Mitteilung anzeigen&quot;.</li>
        <li>Optional: Ist <code style={codeStyle}>open_url</code> vorhanden (keine aktive Offerte, Preis nicht erkannt), diese mit „URL öffnen&quot; öffnen – dann erscheint der Import-Dialog.</li>
        <li>Bestehende Kurzbefehle mit <code style={codeStyle}>token=…</code> funktionieren weiterhin.</li>
      </ol>
    </>
  );
}
