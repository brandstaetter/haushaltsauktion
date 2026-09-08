---
title: "Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen Volunteer-Listen, sobald der erste Freiwillige übernimmt"
status: completed
priority: normal
target: apps/api/src/app/queries/taskDto.ts, apps/web/src/pages/TaskListPage/TaskListPage.tsx, apps/web/src/components/TaskCard/TaskCard.tsx
campaign: multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so
---

## Description

Bei einer Aufgabe mit `workerCountMode: AT_LEAST` und `workerCount: 1` ("mindestens
1 Helfer") sollte laut Domainlogik jederzeit ein zweiter (dritter, ...) Freiwilliger
mitmachen können — `AT_LEAST` hat laut `maxAllowed()` in
`apps/api/src/domain/task/worker-slots.ts` kein Limit (`Infinity`). Der Backend-Use-Case
`volunteerForTask.ts` unterstützt das auch korrekt: sein Guard bei Zeile 110 lässt
sowohl `AVAILABLE` als auch `ASSIGNED`-Instanzen als "recruiting states" zu, und die
Slot-Prüfung (`currentCount >= max`) blockiert bei `AT_LEAST` nie.

Das Problem liegt in den **Leseabfragen**, die jede Volunteer-CTA-Oberfläche speisen.
`listAvailableTasks()` in `apps/api/src/app/queries/taskDto.ts` (Zeile ~320) filtert
hart auf `status: 'AVAILABLE'`:

```ts
const instances = await tx.taskInstance.findMany({
  where: {
    householdId: ctx.householdId,
    status: 'AVAILABLE',
    ...
```

Diese eine Funktion versorgt **alle drei** Oberflächen, über die ein Mitglied sich
freiwillig melden kann:

1. `GET /tasks/available` → die "Verfügbar"-Tab-Liste in `TaskListPage.tsx`
   (`useAvailableTasks`), das primäre Ziel für "Freiwillig übernehmen".
2. `GET /tasks/board` (§19 Dashboard, "Familie: aktuelle offene Aufgaben" /
   "Für mich"-Panel) — nutzt intern ebenfalls `listAvailableTasks`
   (`apps/api/src/infra/http/routes/tasks.ts` Zeile ~117).
3. `loadDashboard()` in `apps/api/src/app/queries/reads.ts` (`openTasks`) —
   ebenfalls über `listAvailableTasks`.

Sobald der erste Freiwillige eine `AT_LEAST(1)`- oder `AT_MOST(n)`-Instanz übernimmt,
kreuzt sie `minRequired` und wechselt laut `volunteerForTask.ts` (`nextStatus`) von
`AVAILABLE` zu `ASSIGNED` — und verschwindet damit sofort aus allen drei obigen
Listen, obwohl `activeSlotCount < maxAllowed(...)` weiterhin gilt und ein zweiter Slot
frei ist.

Die einzige Oberfläche, die `ASSIGNED`-Instanzen überhaupt noch anzeigt, ist der
"Alle Aufgaben"-Tab (`GET /tasks/all` → `listAllOpenTasks`, Status
`AVAILABLE`/`ASSIGNED`). Aber `renderHouseholdItems()` in `TaskListPage.tsx` rendert
diese Liste laut eigenem Kommentar bewusst **ohne CTA** ("An `ASSIGNED` card here may
belong to someone else, so 'Erledigen'/'Freiwillig übernehmen' would be misleading") —
es gibt dort also keinen "Freiwillig übernehmen"-Button, selbst wenn noch freie Slots
offen wären.

Ergebnis: Für eine `AT_LEAST`/`AT_MOST`-Aufgabe mit mehr als einem Helfer-Slot gibt es
nach dem ersten Beitritt **keinen erreichbaren Weg mehr im UI**, sich für einen der
verbleibenden Slots zu melden — obwohl das Backend es erlauben würde. Das widerspricht
dem Zweck von `AT_LEAST`/Multi-Worker-Aufgaben (mehrere Personen sollen gemeinsam
mitmachen können) und macht Mehrpersonen-Aufgaben faktisch auf eine Person begrenzt,
sobald die erste zugesagt hat.

## Acceptance Criteria

- Solange eine `TaskInstance` mit `workerCountMode: AT_LEAST` oder `AT_MOST` noch
  freie Slots hat (`activeSlotCount < maxAllowed(workerCountMode, workerCount)`),
  bleibt sie in den Volunteer-Listen sichtbar und mit funktionierender "Freiwillig
  übernehmen"-CTA erreichbar — unabhängig davon, ob ihr Status bereits `ASSIGNED`
  ist, weil `minRequired` erreicht wurde.
- `EXACTLY`-Aufgaben (der heutige Normalfall, `min === max`) und bereits volle
  `AT_MOST`-Aufgaben verhalten sich unverändert: sie verschwinden weiterhin aus den
  Volunteer-Listen, sobald kein Slot mehr frei ist.
- Betrifft konsistent alle drei lesenden Oberflächen (`/tasks/available`,
  `/tasks/board`, Dashboard `openTasks`) — keine Oberfläche darf hinter den anderen
  zurückbleiben.
- Die "Alle Aufgaben"-Card für eine `ASSIGNED`-Instanz mit freien Zusatz-Slots sollte
  entweder ebenfalls eine CTA bekommen oder zumindest klar anzeigen, dass noch Plätze
  offen sind (zu entscheiden im Briefing) — ihr aktueller reiner Read-only-Modus ist
  für diesen Fall nicht mehr korrekt, auch wenn er für "jemand anderes hält die
  Aufgabe bereits vollständig" weiterhin richtig bleibt.
- Serverseitig verbindlich (§36): die eigentliche Beitritts-Berechtigung war nie das
  Problem (`volunteerForTask.ts` war schon korrekt) — hier geht es ausschließlich um
  Sichtbarkeit/Erreichbarkeit im UI, nicht um neue Backend-Businesslogik.
