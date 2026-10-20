/** Positive whole number as typed in a NummerField; null when invalid. */
export function parseNummer(s: string): number | null {
  const t = s.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

interface NummerFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** The automatically assigned number, offered again after a manual change. */
  vorschlag: number;
  /** Printed after the number, e.g. "_2" for a later Offerte version. */
  suffix?: string;
  /** True when another document already carries the typed number. */
  vergeben: boolean;
}

/* Document number, prefilled with the automatic sequence number and editable
   for corrections; a taken number only warns, saving asks for confirmation. */
export default function NummerField({ label, value, onChange, vorschlag, suffix, vergeben }: NummerFieldProps) {
  const ungueltig = value.trim() !== '' && parseNummer(value) == null;
  return (
    <div className="cf-field">
      <label className="cf-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="cf-input" type="text" inputMode="numeric" value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
          aria-invalid={ungueltig || vergeben}
          style={{ flex: 1, minWidth: 0 }}
        />
        {suffix && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--label2)' }}>{suffix}</span>}
        {String(vorschlag) !== value.trim() && (
          <button type="button" className="btn-plain" style={{ fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => onChange(String(vorschlag))}>
            Auto: {vorschlag}
          </button>
        )}
      </div>
      {(ungueltig || value.trim() === '') && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#FF3B30' }}>Bitte eine ganze Zahl ab 1 eingeben</div>}
      {!ungueltig && vergeben && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#FF9500' }}>Achtung: Diese Nummer existiert bereits</div>}
    </div>
  );
}

/** Checks the typed number before saving; null = don't save (invalid or not confirmed). */
export function nummerBestaetigt(value: string, vergeben: (n: number) => boolean, art: string): number | null {
  const n = parseNummer(value);
  if (n == null) return null;
  if (vergeben(n) && !window.confirm(`Achtung: ${art} #${n} existiert bereits. Trotzdem mit dieser Nummer speichern?`)) return null;
  return n;
}
