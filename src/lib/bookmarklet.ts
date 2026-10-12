/** Desktop bookmarklet: runs on the active Autodoc/ATP product page, pulls
    title/price/article-number straight out of the live DOM (more reliable than
    a server-side re-fetch, which only sees raw HTML and can hit anti-bot
    blocks), then opens GarageOS's import flow with them pre-filled in a NEW
    tab — the original product page must stay open. `window.open` can get
    popup-blocked depending on the browser's heuristics for bookmarklet-
    triggered calls, so a synthetic `<a target="_blank">` click is the
    fallback; neither path ever navigates the current tab away.
    NOTE: no `//` line comments inside the `code` template below — whitespace
    collapse below turns a trailing newline into a space, which would make an
    unterminated `//` comment swallow the rest of the script. */
export function buildImportBookmarklet(origin: string): string {
  const code = `(function(){
    var d=document,b=(d.body&&d.body.innerText)||'';
    var og=d.querySelector('meta[property="og:title"]');
    var t=(og&&og.content)||d.title||'';
    var pm=b.match(/(?:CHF|EUR|\\u20ac|Fr\\.?)\\s?([\\d]{1,3}(?:[.'\\s]\\d{3})*(?:[.,]\\d{2})?)/i);
    var p=pm?pm[1].replace(/['\\s]/g,'').replace(',', '.'):'';
    var am=b.match(/(?:Art(?:ikel)?\\.?-?Nr\\.?|Artikelnummer|SKU|MPN)[:\\s]*([A-Za-z0-9\\-\\/]{3,})/i);
    var a=am?am[1]:'';
    var q='import_url='+encodeURIComponent(location.href)
      +'&import_title='+encodeURIComponent(t.trim())
      +'&import_price='+encodeURIComponent(p)
      +'&import_artnr='+encodeURIComponent(a);
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
