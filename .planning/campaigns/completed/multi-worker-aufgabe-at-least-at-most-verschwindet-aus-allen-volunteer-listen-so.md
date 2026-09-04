---
version: 1
id: "a3f27100-6ad0-4b9b-87c8-ee986a539413"
status: completed
started: "2026-09-04T15:06:50.361Z"
completed_at: "2026-09-04T15:20:00.000Z"
direction: "Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen Volunteer-Listen, sobald der erste Freiwillige übernimmt"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen Volunteer-Listen, sobald der erste Freiwillige übernimmt

Status: completed
Started: 2026-09-04T15:06:50.361Z
Direction: Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen Volunteer-Listen, sobald der erste Freiwillige übernimmt

## Claimed Scope
- apps/api/src/app/queries/taskDto.ts, apps/web/src/pages/TaskListPage/TaskListPage.tsx, apps/web/src/components/TaskCard/TaskCard.tsx
- Grown during Phase 2 (see Decision Log): packages/shared/src/api/tasks.ts,
  apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx,
  apps/api/test/integration/multi-worker-available-list.test.ts (new),
  apps/api/test/integration/tasks-all.test.ts (stale-fixture fix)

## Intake Source

- File: .planning/intake/multi-worker-task-vanishes-from-available-list-after-first-volunteer.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |   complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (9 tracked files, +161/-6) + 1 new untracked test file: apps/api/test/integration/multi-worker-available-list.test.ts | verified | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run test: 627/627 passed (shared 144, api 345, web 138); npm run typecheck: clean (root+web+e2e); eslint on changed api/shared files: 0 errors | pass | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T15:06:50.361Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Root cause had two layers, not one: (1) `listAvailableTasks()`'s
  hard `status: 'AVAILABLE'` filter (as diagnosed in the intake), and (2)
  `toAvailableDto()`'s `canVolunteer: instance.status === 'AVAILABLE' && …`
  and `TaskCard.tsx`'s `isHeld = task.status === 'ASSIGNED'` — both used
  status as a proxy for "is this joinable / does the viewer hold it", which
  was only ever valid under `EXACTLY(1)`. Widening the query alone would have
  shipped a card that renders "Erledigt" for a task the viewer hasn't joined.
  Fixed all three together; added `viewerHasActiveSlot` to `AvailableTaskDto`
  as the explicit per-viewer signal `TaskCard` now uses instead of `status`.
- 2026-09-04: Also had to pass `instanceId` into `viewerEligibility()`'s
  `loadCandidates()` call (taskDto.ts) — without it, a member who already
  holds a slot on a now-recruiting `ASSIGNED` instance would have been shown
  `canVolunteer: true` again (the exclusion existed in candidates.ts since the
  original multi-worker-tasks campaign but was never wired into the DTO read
  path, only into the mutation's own guard).
- 2026-09-04: Scope grew beyond the original claim (taskDto.ts, TaskListPage.tsx,
  TaskCard.tsx) to also include packages/shared/src/api/tasks.ts (new DTO
  field) and apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx (its CTA
  gate had the same `status === 'AVAILABLE'` bug — TaskListPage navigates
  there for the actual volunteer action, so leaving it unfixed would have
  broken the fix's only actionable path). DashboardPage.tsx and the
  "Alle Aufgaben" tab needed no changes — both already consume the fixed
  `TaskCard`/`toAvailableDto` output correctly.
- 2026-09-04: Acceptance criterion #4 ("Alle Aufgaben" card for an ASSIGNED
  instance with free slots) resolved as "clearly indicate open slots" rather
  than "add a CTA" — `TaskCard`'s existing `workerCount > 1` occupancy text
  ("N/M besetzt") already renders unconditionally in that tab, satisfying the
  criterion with no additional code, and preserves that tab's deliberate
  read-only design (TaskListPage.tsx's own comment).
- 2026-09-04: Fixed a stale fixture in tasks-all.test.ts as a side effect —
  it hand-built `ASSIGNED` `TaskInstance` rows via raw Prisma without setting
  `activeSlotCount` (defaulted to 0), which the old status-only filter never
  noticed but the new slot-aware filter does. Added `activeSlotCount: 1` to
  match the real invariant volunteerForTask.ts/the sweep maintain.
- 2026-09-04: Added a new integration test file
  (multi-worker-available-list.test.ts) covering the actual regression:
  AT_LEAST(1) stays listed/joinable after the first volunteer across
  /tasks/available and /tasks/board; AT_MOST(2) stays listed until genuinely
  full; the already-holding member never sees the task offered to them again.

## Active Context

Phases 1-3 complete: implementation done, full test suite green (627/627),
typecheck clean. Next action: Phase 4 — package for review
(node .citadel/scripts/package-delivery.js {slug}).

## Continuation State

Phase: 4
Sub-step: implementation and verification complete; packaging not started
Files modified: apps/api/src/app/queries/taskDto.ts,
  apps/api/test/integration/multi-worker-available-list.test.ts (new),
  apps/api/test/integration/tasks-all.test.ts,
  packages/shared/src/api/tasks.ts,
  apps/web/src/components/TaskCard/TaskCard.tsx,
  apps/web/src/components/TaskCard/TaskCard.test.tsx,
  apps/web/src/components/TaskCard/TaskCard.stories.tsx,
  apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx,
  apps/web/src/pages/TaskDetailPage/TaskDetailPage.test.tsx,
  apps/web/src/pages/TaskListPage/TaskListPage.test.tsx
Blocking: none
checkpoint-phase-2: none (git stash swept the untracked campaign file itself; skipped in favor of per-file diff review)
