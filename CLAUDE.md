# GarageOS – Design System: Apple Liquid Glass (Aqua)

## PFLICHT: Jede visuelle Änderung MUSS diesem Design-Skill folgen.

---

## CSS Design Tokens – Apple Aqua / Liquid Glass

### 3D-Glanzbuttons (Primary Action)
```css
background: linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%);
box-shadow: inset 0 1px 0px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.15);
border: 1px solid #004fb0;
text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.3);
```

### Milchglas-Arbeitsbereiche (Glass Container)
```css
background: rgba(255, 255, 255, 0.7);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.5);
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
```

---

## Regeln

- Alle Buttons: 3D-Glanzeffekt mit dem obigen Gradient + inset Shine + text-shadow
- Alle Container/Cards/Sheets: Glassmorphism mit rgba(255,255,255,0.7) + blur(12px)
- Keine flachen, einfarbigen CSS-Klassen
- Kein reines Weiß als Hintergrund – immer transluzent
- Hover-States: leicht aufgehellt (`#68C6FF` oben) + leicht angehoben (translateY(-1px))
- Active-States: scale(0.98) + reduzierter Schatten
- Dark Mode: dunkle Glasgradients (`rgba(28–48, 32–54, 50–82, 0.78–0.90)`)
- Immer -webkit-backdrop-filter UND backdrop-filter setzen

## Farbpalette
- Primary Blue: #007AFF
- Light Blue: #54A4FF
- Dark Blue: #0056B3
- Border Blue: #004FB0
- Success Green: #34C759
- Warning Orange: #FF9500
- Danger Red: #FF3B30
