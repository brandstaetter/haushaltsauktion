---
title: "Admin-Bottom-Navigation: „Einstellungen“ bricht auf schmalen Handybildschirmen um und verschiebt die Ausrichtung"
status: completed
priority: normal
target: apps/web/src/components/Nav/Nav.tsx, apps/web/src/components/Nav/Nav.module.css, e2e/mobile-layout.spec.ts
campaign: admin-bottom-navigation-einstellungen-bricht-auf-schmalen-handybildschirmen-um-u
---

## Description

Auf einem iPhone 13 (390×844 CSS-Pixel — der projekteigene Referenz-Mobil-
Viewport, siehe `e2e/mobile-layout.spec.ts`) ist die untere Navigation
verrutscht: das Label "Einstellungen" bricht in eine zweite Zeile um,
wodurch dieser Eintrag höher wird als die anderen und die ganze Leiste
optisch aus der Ausrichtung gerät.

Betroffen ist nur die **ADMIN**-Ansicht: `Nav.tsx` (`apps/web/src/
components/Nav/Nav.tsx:12-23`) rendert für normale Mitglieder 3 Einträge
(Start/Verlauf/Ich), aber für Admins zusätzlich 4 weitere
(`adminItems`: Einstellungen/Benutzer/Aufgaben/Kategorien) — macht 7
Einträge in derselben schmalen Leiste. "Einstellungen" (`de.nav
.adminSettings`, `apps/web/src/strings/de.ts:8`) ist mit 13 Zeichen das
längste Label aller sieben.

Ursache in `Nav.module.css`:

- `.list` ist `display: flex; justify-content: space-around` ohne
  `flex-wrap`-Kontrolle auf den Kindern.
- `.link` hat `min-width: 56px`, aber keine Regel, die Umbruch am Label
  verhindert (kein `white-space: nowrap`, kein `overflow: hidden`/
  `text-overflow: ellipsis`, keine kleinere Schrift oder Kürzung für den
  schmalen 7-Spalten-Fall).
- `.link span` setzt `font-size: 11px` — bereits recht klein — aber bei 7
  Spalten auf 390px bleiben pro Spalte nur ~50-55px, zu wenig für
  "Einstellungen" bei dieser Schriftgröße.

Das Projekt hat bereits genau dieses Muster einmal gelöst (siehe die
gemergte PR #38, `fix: TaskCard action button no longer wraps mid-word on
narrow phones` — dort wurde für `Button` kontrolliertes Wortgrenzen-
Verhalten statt Mitten-im-Wort-Umbruch erzwungen). Hier reicht das
vermutlich nicht: selbst am Wortende umgebrochen bliebe "Einstellungen"
zweizeilig und würde die Zeile weiterhin verschieben, weil es keinen
Zwei-Wort-Fallback gibt.

Vom Melder vorgeschlagener Lösungsansatz: nur Icons ohne Labels anzeigen
(zumindest ab einer bestimmten Eintragsanzahl oder Bildschirmbreite) —
`item.icon` wird bereits gerendert (`Nav.tsx:31`/`40`), `<span>{item
.label}</span>` müsste dann per CSS ausgeblendet werden, wobei das Label
für Screenreader/Barrierefreiheit erhalten bleiben muss (`aria-label`
oder `sr-only`-Klasse statt vollständigem Entfernen — `nav` selbst hat
bereits `aria-label="Hauptnavigation"`, die einzelnen Links aktuell
keines). Alternativen, die dieselbe Ursache beheben, sind ebenfalls
denkbar (z. B. eine kleinere Schrift/kompaktere `min-width` speziell für
den 7-Spalten-Admin-Fall, ein zweizeiliges Nav-Layout, horizontales
Scrollen der Leiste) — welcher Ansatz umgesetzt wird, entscheidet die
Umsetzung.

## Acceptance Criteria

- Bei 390×844 (iPhone 13, Referenz-Mobil-Viewport) bricht kein Label der
  unteren Navigation mehr um — weder als Admin (7 Einträge) noch als
  normales Mitglied (3 Einträge) — und alle Einträge bleiben in einer
  gemeinsamen, gleich hohen Zeile ausgerichtet.
- Falls Labels ausgeblendet werden (Icon-only): jeder Navigationslink
  bleibt für Screenreader/Barrierefreiheit benannt (z. B. `aria-label`
  aus `de.nav.*`), auch ohne sichtbaren Text.
- Die Desktop-Darstellung (`@media (min-width: 900px)` in `Nav.module
  .css:42-68`, seitliche Navigation mit Text) bleibt unverändert.
- `e2e/mobile-layout.spec.ts` bekommt eine zusätzliche Prüfung (oder
  einen neuen Test in derselben Datei) für diesen Fall bei 390×844 als
  ADMIN — analog zum bereits vorhandenen Muster für den TaskCard-Button-
  Umbruch (dieselbe Datei, gleicher Referenz-Viewport).
- Typecheck und Lint bleiben grün; bestehende Nav-Tests (falls
  vorhanden) bleiben grün oder werden angepasst.
