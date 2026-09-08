---
title: "Kategorie-Label auf der Aufgabenliste farbig hinterlegen"
status: completed
priority: normal
target: apps/web/src/components/TaskCard/TaskCard.tsx, apps/web/src/components/TaskCard/TaskCard.module.css
campaign: kategorie-label-auf-der-aufgabenliste-farbig-hinterlegen
---

## Description

`TaskCard.tsx` (`apps/web/src/components/TaskCard/TaskCard.tsx:38`) zeigt die
Kategorie einer Aufgabe aktuell als reinen Text ohne Farbe:

```tsx
{task.category && <span className={styles.category}>{task.category.name}</span>}
```

`.category` in `TaskCard.module.css` setzt nur `color: var(--ink-3)`, kein
Hintergrund. Dabei ist die Admin-konfigurierte Kategoriefarbe
(`CategoryRefDto.colorHex: string | null`, `packages/shared/src/api/tasks.ts`)
bereits Teil der DTO, die dieser Component ohnehin schon bekommt — sie wird
nur nirgends auf dieser Ansicht benutzt (im Gegensatz zur
Kategorien-Verwaltung, `apps/web/src/pages/AdminPage/CategoriesSection.tsx`,
wo dieselbe `colorHex` bereits als Farbwähler-Swatch dargestellt wird).

`TaskCard` ist eine gemeinsame Component — sie rendert sowohl auf
`TaskListPage` (die eigentliche "Aufgaben"-Liste) als auch im
"Freiwillig verfügbar"/"Meine Aufgaben"-Bereich von `DashboardPage`. Eine
Änderung an `TaskCard` wirkt sich also automatisch auf beide Stellen aus.

Das Repo hat bereits ein Pill/Badge-Muster für farbige Labels
(`apps/web/src/components/StatusBadge/StatusBadge.module.css`: `display:
inline-block`, Padding, `border-radius`, Hintergrundfarbe) — das Kategorie-
Label sollte diesem Muster folgen, nur mit `colorHex` statt einer festen
Akzentfarbe als Hintergrund.

Der Knackpunkt: `colorHex` ist admin-frei wählbar (`apps/web/src/pages/
AdminPage/CategoriesSection.tsx`, `<input type="color">`, kein Contrast-
Check bei der Eingabe) — es kann jede beliebige Farbe sein, hell oder dunkel.
Eine fest codierte Textfarbe (immer Schwarz oder immer Weiß) wird bei vielen
Farben unlesbar. Es gibt im Repo aktuell keine Utility, die aus einer
Hintergrundfarbe eine kontrastsichere Textfarbe berechnet — die muss neu
geschrieben werden (z. B. relative Luminanz nach WCAG-Formel, dann Schwarz
oder Weiß wählen, je nachdem was mehr Kontrast liefert).

## Acceptance Criteria

- Das Kategorie-Label auf der Aufgaben-Card (`TaskCard`) rendert als farbige
  Pille/Badge mit `task.category.colorHex` als Hintergrundfarbe, analog zum
  bestehenden Pill-Muster in `StatusBadge.module.css`.
- Die Textfarbe wird aus der Hintergrundfarbe berechnet (nicht fest codiert)
  und erreicht mindestens WCAG-AA-Kontrast (≥ 4,5:1, oder ≥ 3:1 sofern das
  Label als "large text" im Sinne der WCAG-Definition gilt — die Umsetzung
  legt sich auf einen der beiden Schwellenwerte fest und wendet ihn
  konsequent an) gegenüber der jeweiligen Hintergrundfarbe.
- Kategorien ohne `colorHex` (`null`) fallen auf die heutige schlichte,
  unfarbige Label-Darstellung zurück — kein leerer/kaputter Hintergrund.
- Die Änderung wirkt auf allen Stellen, an denen `TaskCard` verwendet wird
  (`TaskListPage`, `DashboardPage`), da es sich um dieselbe Component
  handelt.
- Die Kontrastberechnung ist als eigene, pure Funktion testbar (unit-testbar
  ohne DOM), mit Tests für mindestens: sehr helle Hintergrundfarbe, sehr
  dunkle Hintergrundfarbe, und `colorHex: null`. Typecheck und Lint bleiben
  grün.
