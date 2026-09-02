---
title: "Kategorien per Drag-and-Drop sortieren statt Reihenfolge-Feld"
status: completed
priority: normal
target: apps/web/src/pages/AdminPage/CategoriesSection.tsx
campaign: kategorien-per-drag-and-drop-sortieren-statt-reihenfolge-feld
---

## Description

`CategoriesSection.tsx` (Verwaltung > Kategorien) zeigt `sortOrder` aktuell
als eigenes Zahlenfeld pro Kategorie-Zeile (`de.admin.categories.sortOrder`
= "Reihenfolge", `CategoryRow` → `.memberFields`-Zahleneingabe). Das ist
fehleranfällig — Admins müssen für jede Kategorie eine passende Zahl finden
und im Kopf konsistent halten, um die gewünschte Reihenfolge zu erreichen.

Die Sortierung soll stattdessen per Drag-and-Drop auf der Kategorienliste
erfolgen. Das "Reihenfolge"-Zahlenfeld entfällt aus der UI (Formular und
Zeilenanzeige) vollständig — `sortOrder` bleibt als internes Datenfeld
bestehen, wird aber nur noch durch Drag-and-Drop geschrieben, nicht mehr
direkt editiert.

Backend-Lage: `PUT /admin/categories/:id` (`admin.ts`) nimmt aktuell den
vollen `CategoryBody` (`name`, `colorHex`, `sortOrder`) entgegen; es gibt
noch keinen Bulk-/Reorder-Endpunkt. Bei der erwarteten Kategorienanzahl
(einstellig bis niedriger zweistelliger Bereich pro Haushalt) reicht es
vermutlich, nach einem Drop sequenziell `sortOrder` je verschobener
Kategorie über den bestehenden Endpunkt zu aktualisieren — ein dedizierter
Bulk-Reorder-Endpunkt ist eine mögliche, aber keine zwingende Erweiterung;
das entscheidet die Umsetzung nach Bedarf (z. B. wenn sequenzielle Requests
sich als ruckelig erweisen).

## Acceptance Criteria

- Das "Reihenfolge"-Zahlenfeld ist weder im Add- noch im Edit/Row-UI der
  Kategorienliste sichtbar.
- Kategorien lassen sich per Drag-and-Drop in der Liste neu anordnen
  (Touch- und Maus-Bedienung, da die App primär auf Smartphones genutzt
  wird — §31 UX-Prinzipien).
- Nach einem Drop ist die neue Reihenfolge persistiert (`sortOrder`
  serverseitig aktualisiert) und bleibt nach Reload erhalten.
- Die Kategorienliste ist überall dort, wo sie nach `sortOrder` angezeigt
  wird (z. B. Kategorie-Dropdown bei Aufgaben), weiterhin korrekt sortiert.
- Neue Kategorien erhalten weiterhin automatisch eine sinnvolle `sortOrder`
  (z. B. ans Ende angehängt), ohne dass der Admin sie manuell eingeben muss.
- Bestehende Tests (`CategoriesSection.test.tsx`) sind auf die neue UI
  angepasst; Typecheck und Lint bleiben grün.
