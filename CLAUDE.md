# GarageOS – Design System: Minimal Dark (Zinc / Slate)

## PFLICHT: Jede visuelle Änderung MUSS diesem System folgen.

Flach, ruhig, platzsparend. Eine dunkle Fläche, zwei leise Erhöhungen, eine Akzentfarbe.
Alle Tokens stehen in `src/styles/globals.css` (`:root`). Keine Hex-Werte oder rgba-Farben
inline in Komponenten, wenn ein Token existiert.

---

## Tokens

### Flächen & Linien
```css
--bg:            #09090b;  /* App-Hintergrund */
--surface:       #121217;  /* Cards, Listen, Panels */
--surface-2:     #18181b;  /* Inputs, Segment-Controls, Sticky-Bars */
--surface-hover: #1f1f23;
--border:        #27272a;  /* 1px Trennung */
--border-strong: #3f3f46;
```

### Text
```css
--label:  #f8fafc;  /* Primärinhalt, Beträge */
--label2: #94a3b8;  /* Sekundär: Labels, Metadaten */
--label3: #64748b;  /* Hinweise, Section-Header */
--label4: #475569;  /* Disabled */
```

### Akzent & Semantik
```css
--accent: #3b82f6;  --accent-hover: #60a5fa;  --accent-text: #93c5fd;  --accent-soft: rgba(59,130,246,0.12);
--green:  #4ade80 / --green-tint   --orange: #fbbf24 / --orange-tint
--red:    #f87171 / --red-tint     --purple: #c4b5fd / --purple-tint
```

---

## Regeln

- **Keine** backdrop-filter / Glas-Effekte, Glanz-Gradients, inset-Shines oder text-shadows.
  Einzige Ausnahme: Nav-Bar (leicht transluzent + blur).
- Trennung über `1px solid var(--border)`, nicht über Schatten. Schatten nur für schwebende
  Ebenen (Dialoge, Menüs, Toasts, Sticky-Bars): `var(--shadow-lg)`.
- **Eine** gefüllte Akzent-Schaltfläche pro Bereich (`.btn-system` / `.btn-primary`) für die
  nächste Hauptaktion. Alles andere: `.btn-secondary` (Surface + Border) oder Text-Button.
- Selten benötigte destruktive Aktionen: `.text-danger-btn` (roter Text), kein grosser roter Button.
- Status-Badges: getönter Hintergrund (`--*-tint`) + farbiger Text, keine gefüllten Farbflächen.
  Gruppen-Header: neutraler Text + kleiner Farbpunkt (`.dot`).
- Beträge und Zahlen in `--label`, mit `font-variant-numeric: tabular-nums`. Nicht blau/grün einfärben.
- Keine Emojis als Icons in Karten/Listen; SVG-Icons aus `Icons.tsx` oder gar kein Icon.
- Radien klein: 6–10px (`--radius-sm` … `--radius-lg`), Pills nur für Badges/Chips.
- Kompakt: Listenzeilen ~44px (Touch 48px), Card-Padding 12–14px, Section-Header 11px uppercase `--label3`.
- Hover: `--surface-hover`, kein Anheben/Verschieben. Active: `scale(0.98)`.
- Fokus: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--ring)`.
- Inputs auf Touch-Geräten ≥16px Schrift (sonst zoomt iOS).

## Farbpalette (Kurzreferenz)
- Canvas #09090b · Surface #121217 · Surface-2 #18181b · Border #27272a
- Text #f8fafc · Sekundär #94a3b8
- Akzent #3B82F6 · Erfolg #4ADE80 · Warnung #FBBF24 · Fehler #F87171
