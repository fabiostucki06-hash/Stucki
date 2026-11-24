# GarageOS – Design System: Apple Dark

## PFLICHT: Jede visuelle Änderung MUSS diesem System folgen.

Apple-Stil (iOS / macOS dark): echtes Schwarz als Fläche, graue Tonstufen statt Rahmen,
grosse fette Titel, viel Luft zwischen Abschnitten, eine Akzentfarbe (iOS-Blau).
Alle Tokens stehen in `src/styles/globals.css` (`:root`); die Apple-spezifischen Komponenten-
Overrides im Block `APPLE DARK LAYER` am Dateiende. Keine Hex-Werte oder rgba-Farben inline
in Komponenten, wenn ein Token existiert.

---

## Tokens

### Flächen & Linien
```css
--bg:            #000000;  /* App-Hintergrund */
--surface:       #1c1c1e;  /* Cards, Listen, Panels */
--surface-2:     #2c2c2e;  /* Inputs, Segment-Controls, sekundäre Buttons */
--surface-hover: #2a2a2d;
--border:        #38383a;  /* Haarlinien innerhalb von Listen */
--border-strong: #48484a;
```

### Text
```css
--label:  #ffffff;  /* Primärinhalt, Beträge, Abschnittstitel */
--label2: #98989f;  /* Sekundär: Labels, Metadaten */
--label3: #6e6e73;  /* Hinweise */
--label4: #48484a;  /* Disabled */
```

### Akzent & Semantik (iOS-Systemfarben dark)
```css
--accent: #0a84ff;  --accent-hover: #409cff;  --accent-text: #4da3ff;  --accent-soft: rgba(10,132,255,0.16);
--green:  #30d158 / --green-tint   --orange: #ff9f0a / --orange-tint
--red:    #ff453a / --red-tint     --purple: #bf5af2 / --purple-tint
```

---

## Regeln

- **Keine** Glas-Effekte, Glanz-Gradients, inset-Shines oder text-shadows.
  Einzige Ausnahme: Nav-Bar (transluzent schwarz + blur/saturate).
- Container (Cards, Listen, Panels) heben sich durch Tonstufe vom Schwarz ab, **ohne Rahmen**.
  Linien nur als eingerückte Haarlinie zwischen Listenzeilen (iOS-Stil, `.list-row::after`).
  Schatten nur für schwebende Ebenen (Dialoge, Menüs, Toasts): `var(--shadow-lg)`.
- **Eine** gefüllte Akzent-Schaltfläche pro Bereich (`.btn-system` / `.btn-primary`) für die
  nächste Hauptaktion. Alles andere: `.btn-secondary` (Surface-2, randlos) oder Text-Button.
  Kleine Kopf-Aktionen (`.btn-tinted`) sind Kapseln.
- Selten benötigte destruktive Aktionen: `.text-danger-btn` (roter Text), kein grosser roter Button.
- Status-Badges: getönter Hintergrund (`--*-tint`) + farbiger Text, keine gefüllten Farbflächen.
  Gruppen-Header: neutraler Text + kleiner Farbpunkt (`.dot`).
- Beträge und Zahlen in `--label`, mit `font-variant-numeric: tabular-nums`. Nicht blau/grün einfärben.
- Keine Emojis als Icons in Karten/Listen; SVG-Icons aus `Icons.tsx` oder gar kein Icon.
- Radien: 8–18px (`--radius-sm` 8 · `--radius-md` 10 · `--radius-lg` 14 · `--radius-xl` 18).
- Typografie: Seitentitel `.sf-title1` 32–40px bold in `.page-head`; Abschnittstitel
  `.section-header` 20px bold `--label`, normale Schreibweise (keine Versalien).
- Listenzeilen ~52px, Buttons 48px hoch (Radius 12px).
- Hover: `--surface-hover`, kein Anheben/Verschieben. Active: `scale(0.98)`.
- Fokus: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--ring)`.
- Inputs auf Touch-Geräten ≥16px Schrift (sonst zoomt iOS).

## Farbpalette (Kurzreferenz)
- Canvas #000000 · Surface #1C1C1E · Surface-2 #2C2C2E · Separator #38383A
- Text #FFFFFF · Sekundär #98989F
- Akzent #0A84FF · Erfolg #30D158 · Warnung #FF9F0A · Fehler #FF453A
