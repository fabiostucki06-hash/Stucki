import { useEffect, useRef, useState } from 'react';

/** Number field of a document form. A new document shows the next free number
    right away and follows the sequence until the user types their own. The
    database has the last word on an automatic number when the document is first
    saved (see `create_document`), and the form then shows the number it got. */
export function useDokNummer(gespeichert: number | undefined, lokal: number, lade: () => Promise<number>) {
  const start = gespeichert ?? lokal;
  const [vorschlag, setVorschlag] = useState(start);
  const [nummer, setNummerState] = useState(String(start));
  const r = useRef({
    vorschlag: start,
    lokal,
    server: 0,
    manuell: false,
    fest: gespeichert != null,
    ersetzt: null as { von: number; zu: number } | null,
  });
  r.current.lokal = lokal;

  function vorschlagen(n: number) {
    const s = r.current;
    if (s.fest || n === s.vorschlag) return;
    s.vorschlag = n;
    setVorschlag(n);
    if (!s.manuell) setNummerState(String(n));
  }

  useEffect(() => { vorschlagen(Math.max(lokal, r.current.server)); }, [lokal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fresh from the database on open: the loaded rows may be behind another device.
  useEffect(() => {
    if (r.current.fest) return;
    let aktiv = true;
    lade().then((n) => {
      if (!aktiv) return;
      r.current.server = n;
      vorschlagen(Math.max(n, r.current.lokal));
    }).catch((e) => console.warn('[Nummer] next number not loaded:', e));
    return () => { aktiv = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setNummer(v: string) {
    r.current.manuell = v !== String(r.current.vorschlag);
    setNummerState(v);
  }

  /** True while the number is still the automatic one of an unsaved document. */
  const istAuto = () => !r.current.fest && !r.current.manuell;

  /** After the first save: shows the number the database assigned. */
  function uebernehmen(n: number, warAuto: boolean) {
    const s = r.current;
    s.fest = true;
    if (!warAuto) return;
    if (n !== s.vorschlag) s.ersetzt = { von: s.vorschlag, zu: n };
    s.vorschlag = n;
    setVorschlag(n);
    if (!s.manuell) setNummerState(String(n));
  }

  /** A save queued before the assigned number reached the form must not write the old one back. */
  function aktuell(n: number): number {
    const s = r.current;
    return !s.manuell && s.ersetzt?.von === n ? s.ersetzt.zu : n;
  }

  return { nummer, setNummer, vorschlag, istAuto, uebernehmen, aktuell };
}
