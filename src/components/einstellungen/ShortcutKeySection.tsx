import { useState } from 'react';

const codeStyle = { fontSize: 11, wordBreak: 'break-all' } as const;
const stepsStyle = { fontSize: 12, color: 'var(--label2)', lineHeight: 1.6, margin: '0', paddingLeft: 18 } as const;

/** Runs in the Shortcut's "JavaScript auf Webseite ausführen" step on the Safari
    page the user shared: Safari has already passed the shop's bot check, so it
    can read title/price that a server fetch never gets (auto-doc.ch blocks it).
    Returns the query string for /api/import-part. */
const SAFARI_JS = `var d = document, body = (d.body && d.body.innerText) || '';
var meta = function (k) { var m = d.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]'); return m ? m.content : ''; };
var ld = {};
d.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
  try {
    var j = JSON.parse(s.textContent), nodes = [].concat(j);
    nodes.forEach(function (n) { [].concat(n['@graph'] || n).forEach(function (c) { if (c && c.offers && !ld.name) ld = c; }); });
  } catch (e) {}
});
var offer = [].concat(ld.offers || {})[0] || {};
var title = ld.name || meta('og:title') || d.title;
var price = String(offer.price || meta('product:price:amount') || meta('og:price:amount') || '');
if (!price) { var pm = body.match(/(?:CHF|Fr\\.?)\\s?(\\d{1,3}(?:['\\s]\\d{3})*[.,]\\d{2})/i); price = pm ? pm[1] : ''; }
var am = body.match(/(?:Art(?:ikel)?\\.?-?Nr\\.?|Artikelnummer)[:\\s]*([A-Za-z0-9\\-\\/.]{3,})/i);
completion('import_url=' + encodeURIComponent(location.href)
  + '&import_title=' + encodeURIComponent((title || '').trim())
  + '&import_price=' + encodeURIComponent(price)
  + '&import_artnr=' + encodeURIComponent(ld.sku || ld.mpn || (am ? am[1] : '')));`;

/** Settings block for the background import: a Shortcut GETs the shared link
    from /api/import-part, which adds the part to the active Offerte without
    opening the app. No key needed. */
export default function ShortcutKeySection() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(SAFARI_JS).then(() => setCopied(true), () => setCopied(false));
  }

  return (
    <>
      <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Teile im Hintergrund importieren (ohne App zu öffnen)</p>
      <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Statt „URL öffnen&quot; kann der Kurzbefehl den Link direkt an GarageOS senden. Das Teil landet dann in der
        aktiven Offerte, und der Kurzbefehl zeigt nur eine kurze Bestätigung an. Ein Schlüssel ist nicht nötig.
      </p>

      <ol style={stepsStyle}>
        <li>Kurzbefehl wie oben anlegen, aber statt „URL öffnen&quot; die Aktion „Inhalte von URL abrufen&quot; verwenden. Als URL genau diesen Text:<br />
          <code style={codeStyle}>{window.location.origin}/api/import-part?import_url=</code>
        </li>
        <li>Direkt danach über das blaue <strong>＋</strong> die Variable „Kurzbefehl-Eingabe&quot; einfügen (unter „Formatieren&quot; → „URL-codieren&quot;). Optional{' '}
          <code style={codeStyle}>&amp;active_offerte_id=…</code> für eine bestimmte Offerte. Methode „GET&quot; reicht.</li>
        <li>Aktion „Wörterbuchwert abrufen&quot; für <code style={codeStyle}>message</code> und danach „Mitteilung anzeigen&quot;.</li>
        <li>Optional: Ist <code style={codeStyle}>open_url</code> vorhanden (keine aktive Offerte, Preis nicht erkannt), diese mit „URL öffnen&quot; öffnen – dann erscheint der Import-Dialog.</li>
        <li>Bestehende Kurzbefehle mit <code style={codeStyle}>token=…</code> funktionieren weiterhin.</li>
      </ol>

      <p className="cf-label" style={{ marginTop: 20, marginBottom: 6 }}>Mit Preis importieren: aus Safari teilen</p>
      <p style={{ fontSize: 12, color: 'var(--label2)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Autodoc (auto-doc.ch) blockiert Abfragen vom Server, deshalb kommt aus der Autodoc-App meist nur der Teilename
        an. Teile das Produkt stattdessen aus <strong>Safari</strong>: Dann liest der Kurzbefehl Titel, Preis und
        Artikelnummer direkt aus der geöffneten Seite.
      </p>
      <ol style={stepsStyle}>
        <li>Neuer Kurzbefehl → unter „Details&quot; „Im Freigabe-Sheet anzeigen&quot; aktivieren und als Eingabe nur „Safari-Webseiten&quot; erlauben.</li>
        <li>Aktion „JavaScript auf Webseite ausführen&quot; hinzufügen und den gesamten Code unten einfügen.</li>
        <li>Aktion „Inhalte von URL abrufen&quot; mit dieser URL, direkt dahinter über das blaue <strong>＋</strong> das Ergebnis „JavaScript-Ergebnis&quot; einfügen:<br />
          <code style={codeStyle}>{window.location.origin}/api/import-part?</code>
        </li>
        <li>Danach wie oben „Wörterbuchwert abrufen&quot; für <code style={codeStyle}>message</code> und „Mitteilung anzeigen&quot;.</li>
      </ol>
      <div style={{ margin: '10px 0 0' }}>
        <textarea
          readOnly
          value={SAFARI_JS}
          onFocus={(e) => e.currentTarget.select()}
          className="cf-textarea"
          rows={6}
          style={{ fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" className="mf-btn-save" onClick={handleCopy}>JavaScript kopieren</button>
          {copied && <span style={{ fontSize: 12, color: '#34C759' }}>Kopiert.</span>}
        </div>
      </div>
    </>
  );
}
