---
title: "Aufgaben-Seite: dritter Tab \"Alle\" mit sämtlichen offenen Aufgaben und ihren Zuweisungen"
status: pending
priority: normal
target: apps/web/src/pages/TaskListPage/TaskListPage.tsx, apps/web/src/api/hooks.ts, apps/web/src/components/TaskCard/TaskCard.tsx, apps/api/src/infra/http/routes/tasks.ts, apps/api/src/app/queries/taskDto.ts, packages/shared/src/api/tasks.ts
---

## Description

`/aufgaben` (`apps/web/src/pages/TaskListPage/TaskListPage.tsx`) hat aktuell
zwei Tabs (`type Tab = 'all' | 'mine'`, Zeile 9): trotz des internen Namens
`'all'` zeigt dieser Tab nur die **freiwillig übernehmbaren** Aufgaben
(`useAvailableTasks()` → `GET /tasks/available`, Status `AVAILABLE`), und
`'mine'` nur die dem aktuellen Nutzer zugewiesenen (`useAssignedTasks()` →
`GET /tasks/assigned-to-me`). Es gibt aktuell **keine** Ansicht, die
wirklich alle gerade offenen Aufgaben im Haushalt zeigt — insbesondere
nicht die Aufgaben, die anderen Mitgliedern zugewiesen sind.

Gewünscht: ein dritter Tab, der alle aktuell offenen Aufgaben (Status
`AVAILABLE` **und** `ASSIGNED`, householdweit, nicht nur die eigenen)
auflistet und bei zugewiesenen Aufgaben anzeigt, **wem** sie zugewiesen
sind.

Backend-Situation:

- `GET /tasks/available` (`apps/api/src/infra/http/routes/tasks.ts:78`,
  `listAvailableTasks` in `apps/api/src/app/queries/taskDto.ts:262`) liefert
  nur `AVAILABLE`-Aufgaben — naturgemäß ohne Zuweisung.
- `GET /tasks/assigned-to-me` (`tasks.ts:88`, `listAssignedToMe` in
  `taskDto.ts:288`) liefert nur die Zuweisungen des aufrufenden Mitglieds.
- `GET /tasks/board` (`tasks.ts:99`, "§19's family panel") kombiniert
  `listAvailableTasks` + `listAssignedToMe` + zuletzt erledigte Aufgaben
  für das Dashboard — aber das ist weiterhin nur "verfügbar" + "meine",
  keine householdweite "wer hat was zugewiesen"-Sicht.
- Es existiert also noch keine Query, die alle `ASSIGNED`-Instanzen eines
  Haushalts mit Zuweisungsträger liefert. Diese muss neu geschrieben
  werden (vermutlich als weitere Funktion neben `listAvailableTasks`/
  `listAssignedToMe` in `taskDto.ts`, plus neuer Route, z. B. `GET
  /tasks/all` oder `GET /tasks/board` erweitert).
- DTO-seitig: `AvailableTaskDto` (`packages/shared/src/api/tasks.ts:30`)
  hat kein Zuweisungsfeld. `AssignmentSummaryDto` (`tasks.ts:72-84`) hat
  zwar `memberId`, aber keinen Anzeigenamen — das war für "assigned-to-me"
  ausreichend, weil der Betrachter sich selbst kennt. Für die neue,
  householdweite Ansicht braucht es einen Namen/Avatar-Verweis (z. B.
  `MemberRefDto`, bereits vorhanden in `tasks.ts:23-27`, statt nur
  `memberId`), damit die UI "Wem zugewiesen" anzeigen kann, ohne einen
  weiteren Member-Lookup im Frontend zu brauchen.

Frontend-Situation:

- `TaskCard` (`apps/web/src/components/TaskCard/TaskCard.tsx`) rendert
  aktuell keinerlei Zuweisungsträger — muss um eine optionale
  Anzeige (Name/Avatar, nur wenn vorhanden) ergänzt werden, ohne die
  bestehende Nutzung auf `TaskListPage`/`DashboardPage` (wo keine
  Zuweisung angezeigt werden soll) zu verändern.
- `TaskListPage.tsx`s Tab-Leiste (`role="tablist"`, Zeilen 25-42) bekommt
  einen dritten `role="tab"`-Button; das bestehende `Tab`-Union-Type muss
  um einen dritten Wert erweitert werden (Name kollidiert aktuell mit dem
  bestehenden `'all'` — sinnvoll wäre, den neuen Tab z. B. `'household'`
  zu nennen und den bestehenden verwirrend benannten `'all'`-Tab-State
  ggf. klarer zu benennen, ohne das äußere Verhalten zu ändern).

## Acceptance Criteria

- `/aufgaben` zeigt einen dritten, klar beschrifteten Tab (z. B. "Alle
  Aufgaben"), der jede Aufgabe mit Status `AVAILABLE` oder `ASSIGNED` im
  Haushalt auflistet — householdweit, nicht auf den aktuellen Nutzer
  beschränkt.
- Für jede angezeigte Aufgabe mit Status `ASSIGNED` ist sichtbar, welchem
  Mitglied sie zugewiesen ist (Name, optional Avatar wie an anderen
  Stellen der App).
- Aufgaben mit Status `AVAILABLE` zeigen weiterhin keinen Zuweisungsträger
  (es gibt keinen).
- Serverseitig neu berechnet, nicht client-seitig zusammengestellt: die
  neue Liste kommt aus einem eigenen, householdweit scoped Query/Endpoint
  (§28, §36 — keine verbindliche Businesslogik im Client).
- Bestehende zwei Tabs ("Freiwillig verfügbar", "Meine Aufgaben")
  bleiben unverändert in Verhalten und Darstellung.
- `TaskCard`s neue Zuweisungsanzeige ist rein additiv/optional und ändert
  nichts an ihrer bestehenden Nutzung in den anderen zwei Tabs oder auf
  `DashboardPage`.
- Regressions-/Komponententest für den neuen Tab: householdweite Liste
  enthält sowohl `AVAILABLE`- als auch `ASSIGNED`-Aufgaben anderer
  Mitglieder, mit korrektem Zuweisungsträger je Karte.
- `npm run typecheck` und `npm run lint` bleiben grün; bestehende Tests
  für `TaskListPage`/`TaskCard` bleiben grün oder werden angepasst.
