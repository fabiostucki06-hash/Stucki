/* GarageOS part-import bookmarklet, source. Loaded as raw text by
   lib/bookmarklet.ts, block comments stripped, whitespace collapsed, and
   prefixed with "javascript:". Rules for this file:
   - Block comments only (a line comment would swallow the rest once the
     newlines are collapsed), semicolons everywhere, no "percent" character
     (browsers percent-decode javascript: URLs), no string literal containing
     a newline or two spaces in a row.
   - __ORIGIN__ is replaced with the GarageOS origin.
   - Never guesses: a value that can't be read unambiguously is sent empty and
     entered by hand in GarageOS.
   Sources, best first: schema.org JSON-LD Product, schema.org microdata,
   product meta tags, AUTODOC's product block, then common price containers
   and a strictly unambiguous price next to the h1. */
(function (O) {
  var d = document, L = location;
  var old = d.getElementById('garageos-bm');
  if (old) old.parentNode.removeChild(old);

  function clean(v) {
    return (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/\s+/g, ' ').trim() : '';
  }
  function attr(e) {
    return e ? clean(e.getAttribute('content') || e.getAttribute('value') || e.textContent || '') : '';
  }
  /* Structured price (schema.org uses "." as decimal mark): 69.99 / "69.99". */
  function sp(v) {
    var n = NaN;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) n = parseFloat(v);
    return (isFinite(n) && n > 0) ? n.toFixed(2) : '';
  }
  function cur(v) {
    var s = clean(v).toUpperCase();
    return /^[A-Z]{3}$/.test(s) ? s : '';
  }
  function hidden(e) {
    for (; e && e !== d.body; e = e.parentElement) {
      var tag = e.tagName;
      var cls = (typeof e.className === 'string' ? e.className : '') + ' ' + (e.id || '');
      if (tag === 'HEADER' || tag === 'NAV' || tag === 'FOOTER' || /cart|basket|warenkorb|tooltip|minicart/i.test(cls)) return true;
    }
    return false;
  }

  var t = '', a = '', p = '', c = '';

  /* 1. JSON-LD Product */
  var P = null;
  function walk(x) {
    if (!x || P || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (var i = 0; i < x.length; i++) walk(x[i]); return; }
    var ty = x['@type'];
    if (ty === 'Product' || (Array.isArray(ty) && ty.indexOf('Product') >= 0)) { P = x; return; }
    walk(x['@graph']); walk(x.mainEntity);
  }
  var ld = d.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < ld.length; i++) { try { walk(JSON.parse(ld[i].textContent)); } catch (e) {} }
  if (P) {
    t = clean(P.name);
    a = clean(P.mpn) || clean(P.sku);
    var offers = [].concat(P.offers || []), prices = [], curs = [];
    for (var j = 0; j < offers.length; j++) {
      var o = offers[j];
      if (!o || typeof o !== 'object') continue;
      var ps = o.priceSpecification && !Array.isArray(o.priceSpecification) ? o.priceSpecification : null;
      var v = o.price != null ? o.price : (ps ? ps.price : null);
      if (v == null && o.lowPrice != null && String(o.lowPrice) === String(o.highPrice)) v = o.lowPrice;
      var n = sp(v);
      if (n) { prices.push(n); curs.push(cur(o.priceCurrency || (ps && ps.priceCurrency))); }
    }
    var same = function (arr) { for (var k = 1; k < arr.length; k++) if (arr[k] !== arr[0]) return false; return true; };
    if (prices.length && same(prices) && same(curs)) { p = prices[0]; c = curs[0]; }
  }

  /* 2. Microdata, inside the Product scope only */
  var S = d.querySelector('[itemtype*="schema.org/Product"]');
  if (S) {
    if (!t) t = attr(S.querySelector('[itemprop="name"]'));
    if (!a) a = attr(S.querySelector('[itemprop="mpn"]')) || attr(S.querySelector('[itemprop="sku"]'));
    if (!p) {
      var ip = S.querySelectorAll('[itemprop="price"]');
      if (ip.length === 1 && /\d/.test(attr(ip[0]))) p = attr(ip[0]).slice(0, 60);
      if (p && !c) c = cur(attr(S.querySelector('[itemprop="priceCurrency"]')));
    }
  }

  /* 3. Product meta tags */
  if (!p) {
    var mp = d.querySelector('meta[property="product:price:amount"],meta[property="og:price:amount"]');
    if (mp) {
      p = sp(mp.getAttribute('content'));
      if (p && !c) c = cur(attr(d.querySelector('meta[property="product:price:currency"],meta[property="og:price:currency"]')));
    }
  }

  /* 4. AUTODOC product block: <main data-product-page data-price="69.99">,
     shown as "CHF 69. 99" in .product-card__price */
  if (!p) {
    var main = d.querySelector('[data-product-page][data-price]');
    if (main) {
      p = sp(main.getAttribute('data-price'));
      if (p && !c) {
        var pc = d.querySelector('.product-card__price');
        var cm = pc ? (pc.textContent || '').match(/\b(CHF|EUR)\b|Fr\.|\u20ac/) : null;
        c = cm ? (cm[0] === '\u20ac' ? 'EUR' : cm[0] === 'Fr.' ? 'CHF' : cm[0]) : cur(main.getAttribute('data-currency'));
      }
    }
  }

  /* 5. Common price containers outside header, cart and tooltips */
  var h1 = d.querySelector('h1');
  if (!p) {
    var pe = d.querySelectorAll('.product-card__price,.product-price,.price-value,.p-price,.x-price-primary,[data-product-price]');
    for (var q = 0; q < pe.length && !p; q++) {
      var tx = clean(pe[q].innerText || pe[q].textContent || '');
      if (/\d/.test(tx) && !hidden(pe[q])) p = tx.slice(0, 60);
    }
  }
  /* 6. A single, unambiguous price with currency close to the h1 */
  if (!p && h1) {
    var re = /(?:CHF|EUR|Fr\.|\u20ac)\s?\d[\d'\u2019.,]*(?:\s\d{2}(?!\d))?|\d[\d'\u2019.,]*\s?(?:CHF|EUR|\u20ac)/g;
    for (var e2 = h1.parentElement, lv = 0; e2 && e2 !== d.body && lv < 4 && !p; e2 = e2.parentElement, lv++) {
      var found = (e2.innerText || '').match(re) || [], uniq = {}, keys;
      for (var r = 0; r < found.length; r++) uniq[found[r].replace(/\s/g, '')] = found[r];
      keys = Object.keys(uniq);
      if (keys.length === 1) p = uniq[keys[0]];
      else if (keys.length > 1) break;
    }
  }

  if (!t && h1) t = clean(h1.innerText || h1.textContent);
  if (!t) t = attr(d.querySelector('meta[property="og:title"]')) || clean(d.title);

  /* Article number only from a labelled line ("Artikelnummer: 0 986 430 207") */
  if (!a) {
    var am = ((d.body && d.body.innerText) || '').match(/(?:Artikelnummer|Art\.?\s?-?\s?Nr\.?|Herstellernummer|Teilenummer|MPN)[ \t]*:[ \t]*([^\n]{2,40})/i);
    var av = am ? am[1].trim() : '';
    if (/^[A-Za-z0-9][A-Za-z0-9 .\-\/]*$/.test(av) && /\d/.test(av)) a = av;
  }

  var link = L.href.split('#')[0];
  var can = d.querySelector('link[rel="canonical"]');
  if (can && can.href) { try { if (new URL(can.href).hostname === L.hostname) link = can.href; } catch (e) {} }

  var enc = encodeURIComponent;
  var u = O + '/?import_url=' + enc(link) + '&import_title=' + enc(t.slice(0, 300)) + '&import_price=' + enc(p)
    + '&import_currency=' + enc(c) + '&import_artnr=' + enc(a.slice(0, 60)) + '&import_src=bookmarklet&import_v=__V__';

  var w = null;
  try { w = window.open(u, '_blank'); } catch (e) {}
  if (w) { try { w.opener = null; } catch (e) {} }

  /* Feedback on the shop page. Built with textContent only: page data is never parsed as HTML. */
  var box = d.createElement('div');
  box.id = 'garageos-bm';
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:14px 16px;border-radius:14px;background:#1c1c1e;color:#fff;font:14px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);text-align:left';
  function line(text, color, bold) {
    var el = d.createElement('div');
    el.textContent = text;
    el.style.cssText = 'margin:2px 0;color:' + color + ';font-weight:' + (bold ? '600' : '400');
    box.appendChild(el);
    return el;
  }
  line(w ? 'An GarageOS gesendet' : 'Popup blockiert', w ? '#30d158' : '#ff9f0a', true);
  line(t || 'Bezeichnung nicht gefunden', t ? '#fff' : '#ff9f0a');
  line(p ? ((c ? c + ' ' : '') + p) : 'Preis nicht gefunden, bitte in GarageOS eintragen', p ? '#98989f' : '#ff9f0a');
  if (a) line('Art.-Nr. ' + a, '#98989f');
  if (!w) {
    var lk = d.createElement('a');
    lk.href = u; lk.target = '_blank'; lk.rel = 'noopener';
    lk.textContent = 'In GarageOS \u00f6ffnen';
    lk.style.cssText = 'display:block;margin-top:10px;padding:12px;border-radius:12px;background:#0a84ff;color:#fff;text-align:center;font-weight:600;text-decoration:none';
    lk.onclick = function () { setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 300); };
    box.appendChild(lk);
  }
  var x = d.createElement('button');
  x.type = 'button'; x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Schliessen');
  x.style.cssText = 'position:absolute;top:6px;right:8px;border:0;background:none;color:#98989f;font-size:20px;cursor:pointer;padding:4px';
  x.onclick = function () { if (box.parentNode) box.parentNode.removeChild(box); };
  box.appendChild(x);
  (d.body || d.documentElement).appendChild(box);
  if (w) setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 6000);
})('__ORIGIN__');
