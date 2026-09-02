---
title: "Aktions-Button auf der Aufgaben-Card bricht auf schmalen Handybildschirmen mitten im Wort um"
status: completed
priority: normal
target: apps/web/src/components/TaskCard/TaskCard.tsx, apps/web/src/components/Button/Button.tsx, apps/web/src/components/Button/Button.module.css, e2e/mobile-layout.spec.ts
campaign: aktions-button-auf-der-aufgaben-card-bricht-auf-schmalen-handybildschirmen-mitte
---

## Description

Auf schmalen Handybildschirmen sieht die Aufgabenliste kaputt aus: der
Aktions-Button auf jeder `TaskCard` (`apps/web/src/components/TaskCard/
TaskCard.tsx`) bekommt seinen Text ("Freiwillig übernehmen" /
"Als erledigt markieren", `de.action.volunteer` / `de.action.complete`,
`apps/web/src/strings/de.ts:45,49`) in mehrere Zeilen zerrissen, teils
mitten im Wort.

`TaskCard` ist die Component, die sowohl auf `TaskListPage` (die eigentliche
"Aufgaben"-Liste) als auch im "Freiwillig verfügbar"/"Meine Aufgaben"-
Bereich von `DashboardPage` rendert — beide Stellen sind also betroffen.

Ursache in der aktuellen Umsetzung:

- `.row` in `TaskCard.module.css` ist ein `justify-content: space-between`-
  Flex-Container mit `ValueChip` und `Button` als Geschwister, ohne
  `flex-shrink: 0` oder Mindestbreite auf dem Button — auf einem schmalen
  Bildschirm bleibt dem Button wenig Platz.
- `Button.module.css`s `.button` setzt `font: var(--t-h3)` (die `md`-Größe,
  die `TaskCard` hier verwendet) — eine für einen schmalen Button relativ
  große Schrift — und hat kein `white-space`/`overflow-wrap`, das
  kontrolliertes Umbrechen an Wortgrenzen statt mitten im Wort erzwingt.

Der vorgeschlagene Ansatz aus der Meldung: Ab einer bestimmten
Bildschirmbreite auf einen reinen Icon-Button umschalten (mit `aria-label`
für Screenreader/Barrierefreiheit, da `Button` aktuell `children:
ReactNode` als Pflichtfeld hat und keinen Icon-only-Modus kennt — siehe
`ButtonProps` in `Button.tsx`). Das Repo hat bereits einen einzigen
etablierten Breakpoint (`@media (min-width: 900px)`, u. a. in `Layout.module
.css`, `Nav.module.css`, `AdminPage.module.css` — Desktop-vs.-Mobil-
Umschaltung), aber noch keinen engeren "kleines Handy"-Breakpoint.

Zielgerät für die Optimierung: **iPhone 13** (390×844 CSS-Pixel). Das ist
kein Zufallswert, sondern bereits der projekteigene Referenz-Mobil-Viewport:
`e2e/mobile-layout.spec.ts` setzt `test.use({ viewport: { width: 390,
height: 844 } })` und beschreibt ihn im Kommentar dort als "iPhone 14/15,
das kleinste Gerät, das in dieser Familie realistisch vorkommt" — dieselbe
CSS-Viewportgröße gilt für die komplette iPhone-12/13/14-Standardreihe
(nicht mini, nicht Plus/Pro Max), das iPhone 13 eingeschlossen. Diese Datei
enthält bereits einen Test `'Aufgabenliste scrollt nicht seitlich'`, der
`/aufgaben` bei genau dieser Breite aufruft (aktuell wird dort nur auf
horizontales Scrollen geprüft, nicht auf den hier gemeldeten Zeilenumbruch)
— das ist der naheliegende Ort, um eine Prüfung für dieses Problem zu
ergänzen, statt einen neuen, abweichenden Breakpoint zu erfinden.

Alternativ zu einem reinen Breakpoint-Umschalten könnten auch andere
Lösungen die Ursache beheben (z. B. `Button` in diesem Kontext eine engere/
kleinere Variante geben, das Layout von `.row` von nebeneinander auf
gestapelt ändern, `Button` ein `truncate`- oder `hyphens: auto`-Verhalten
geben) — welcher Ansatz umgesetzt wird, entscheidet die Umsetzung; das aus
der Meldung vorgeschlagene "Icon-only unterhalb eines Schwellenwerts" ist
ein akzeptabler, aber nicht der einzig mögliche Lösungsweg.

## Acceptance Criteria

- Bei 390×844 (iPhone 13 — der bereits in `e2e/mobile-layout.spec.ts`
  konfigurierte Referenz-Mobil-Viewport) bricht der Text des Aktions-
  Buttons auf `TaskCard` nicht mehr mitten im Wort um — entweder durch
  Umbruch an Wortgrenzen, durch Kürzung/Icon-only-Darstellung, oder durch
  ein angepasstes Layout, das dem Button genug Platz für den vollen Text
  garantiert. Kein neuer, abweichender Breakpoint für "kleines Handy" ohne
  Bezug zu diesem bereits etablierten Referenzwert.
- Falls eine Icon-only-Variante umgesetzt wird: Der Button bleibt für
  Screenreader/Barrierefreiheit über `aria-label` (Text aus
  `de.action.volunteer`/`de.action.complete`) benannt, auch wenn kein
  sichtbarer Text mehr angezeigt wird.
- Die Änderung wirkt auf allen Stellen, an denen `TaskCard` verwendet wird
  (`TaskListPage`, `DashboardPage`), da es sich um dieselbe Component
  handelt.
- `e2e/mobile-layout.spec.ts`s bestehender Test `'Aufgabenliste scrollt
  nicht seitlich'` bekommt eine zusätzliche Prüfung (oder einen neuen Test
  in derselben Datei) für dieses Problem bei 390×844 — z. B. dass der
  Button nicht mehr Zeilen umfasst als erwartet, oder ein Screenshot-
  Vergleich. Nicht nur Unit-Tests — §31 mobile-first verlangt, dass mobile
  Darstellung tatsächlich am Zielgerät geprüft wird, nicht nur angenommen.
- Typecheck und Lint bleiben grün; bestehende Tests (falls vorhanden für
  `TaskCard`/`Button`) bleiben grün oder werden angepasst.
