---
title: "Verwaltung in vier eigene Navigationspunkte aufteilen"
status: completed
priority: normal
target: apps/web/src/components/Nav/, apps/web/src/pages/AdminPage/, apps/web/src/router.tsx
---

## Description

Der bisherige einzelne "Verwaltung"-Navigationspunkt (Shield-Icon, `/verwaltung`)
führte zu einer Übersichtsseite mit allen Admin-Bereichen untereinander. Er wird
durch vier eigene Navigationspunkte ersetzt:

- (Gear-Icon) Einstellungen — `/verwaltung/einstellungen`
- (People-Icon) Benutzer — `/verwaltung/benutzer`
- (Tasklist-Icon) Aufgaben — `/verwaltung/aufgaben`
- (Folder-Icon) Kategorien — `/verwaltung/kategorien`

Zusätzlich entfällt der bisherige oberste "Aufgaben"-Navigationspunkt
(List-Icon, `/aufgaben`) aus der Hauptnavigation — die Seite bleibt über den
"Alle"-Link im Dashboard-Abschnitt "Meine Aufgaben" erreichbar.

## Acceptance Criteria

- Nav zeigt für ADMIN-Rolle vier eigene Einträge statt einem "Verwaltung"-Eintrag.
- Der Haupt-Nav-Eintrag "Aufgaben" (List-Icon) ist entfernt; `/aufgaben` bleibt
  über den "Alle"-Link im Dashboard erreichbar.
- Jede der vier Verwaltungsseiten ist über die Nav direkt erreichbar und zeigt
  den jeweils zugehörigen Inhalt (Einstellungen, Mitgliederverwaltung,
  Aufgabendefinitionen inkl. Sweep-Aktionen, Kategorien).
- `/verwaltung` bleibt für Admins gültig (Redirect auf `/verwaltung/einstellungen`)
  und weiterhin für Nicht-Admins gesperrt.
- Typecheck, Lint und bestehende Unit-Tests bleiben grün; betroffene
  Playwright-Specs sind auf die neue Struktur angepasst.

## Notes

Umgesetzt: `Nav.tsx`, drei neue Seiten (`AdminMembersPage`, `AdminTasksPage`,
`AdminCategoriesPage`), `AdminSettingsPage`/`AccountPage`/`router.tsx`
angepasst, alte `AdminPage.tsx`-Übersicht entfernt, `de.ts`-Strings,
betroffene `e2e/*.spec.ts` und README aktualisiert. E2E-Suite nicht live
ausgeführt (Docker-Webcontainer belegt Port 8080 mit altem Build) — durch
`npm run typecheck:e2e`, `tsc --noEmit`, `eslint` und die volle Vitest-Suite
abgesichert.
