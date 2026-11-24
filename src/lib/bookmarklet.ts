/** Desktop bookmarklet: runs on the active Autodoc/ATP product page, pulls
    title/price/article-number straight out of the live DOM (more reliable than
    a server-side re-fetch, which only sees raw HTML and can hit anti-bot
    blocks), then opens GarageOS's import flow with them pre-filled in a NEW
    tab — the original product page must stay open. `window.open` can get
    popup-blocked depending on the browser's heuristics for bookmarklet-
    triggered calls, so a synthetic `<a target="_blank">` click is the
    fallback; neither path ever navigates the current tab away.
    The shop page can't read GarageOS's storage (other origin), so which
    Offerte is active is decided in the opened tab; `import_src=bookmarklet`
    lets that tab close itself again once the part went straight into it.
    The price goes out as the raw text next to it ("EUR 45,00", "29.90 CHF")
    plus `import_currency` from the page's structured data, if any; GarageOS
    reads the currency from both and converts to CHF (lib/currency.ts).
    NOTE: no `//` line comments inside the `code` template below — whitespace
    collapse below turns a trailing newline into a space, which would make an
    unterminated `//` comment swallow the rest of the script. */
export function buildImportBookmarklet(origin: string): string {
  const code = `(function(){
    var d=document,b=(d.body&&d.body.innerText)||'';
    var og=d.querySelector('meta[property="og:title"]');
    var t=(og&&og.content)||d.title||'';
    var cm=d.querySelector('meta[property="product:price:currency"],meta[property="og:price:currency"],[itemprop="priceCurrency"]');
    var c=cm?(cm.getAttribute('content')||cm.textContent||''):'';
    if(!c){var lj=d.querySelectorAll('script[type="application/ld+json"]');
      for(var i=0;i<lj.length&&!c;i++){var mm=(lj[i].textContent||'').match(/"priceCurrency"\\s*:\\s*"([A-Za-z]{3})"/);if(mm)c=mm[1];}}
    c=c.trim();c=/^[A-Za-z]{3}$/.test(c)?c.toUpperCase():'';
    var pe=d.querySelector('.x-price-primary, [itemprop="price"], .product-price, .price-value, [data-price], .p-price');
    var pt=pe?(pe.innerText||'').trim():'';
    if(pe&&!/\\d/.test(pt))pt=pe.getAttribute('data-price')||pe.getAttribute('content')||'';
    if(!/\\d/.test(pt)){var bm=b.match(/(?:CHF|EUR|USD|GBP|US ?\\$|Fr\\.|\\u20ac|\\u00a3)\\s?\\d[\\d.,'\\s]*|\\d[\\d.,']*\\s?(?:CHF|EUR|USD|GBP|\\u20ac|\\u00a3)/i);pt=bm?bm[0]:'';}
    var p=pt.replace(/\\s+/g,' ').trim().slice(0,80);
    var am=b.match(/(?:Art(?:ikel)?\\.?-?Nr\\.?|Artikelnummer|SKU|MPN)[:\\s]*([A-Za-z0-9\\-\\/]{3,})/i);
    var a=am?am[1]:'';
    var q='import_url='+encodeURIComponent(location.href)
      +'&import_title='+encodeURIComponent(t.trim())
      +'&import_price='+encodeURIComponent(p)
      +'&import_currency='+encodeURIComponent(c)
      +'&import_artnr='+encodeURIComponent(a)
      +'&import_src=bookmarklet';
    var u='${origin}/?'+q;
    var w=window.open(u,'_blank','noopener,noreferrer');
    if(!w){
      var link=document.createElement('a');
      link.href=u; link.target='_blank'; link.rel='noopener noreferrer';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  })();`;
  // Not URI-encoded: browsers execute the text after "javascript:" as literal JS
  // source, they don't percent-decode it first. Only whitespace is collapsed.
  return `javascript:${code.replace(/\s+/g, ' ').trim()}`;
}
