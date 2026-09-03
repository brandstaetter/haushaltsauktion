---
version: 1
id: "0c2ca995-499a-43f0-a0d3-63c91028d815"
status: completed
started: "2026-09-02T20:37:23.541Z"
completed_at: "2026-09-02T22:49:00.000Z"
direction: "Aufgaben-Seite: dritter Tab \\"Alle\\" mit sämtlichen offenen Aufgaben und ihren Zuweisungen"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Aufgaben-Seite: dritter Tab \"Alle\" mit sämtlichen offenen Aufgaben und ihren Zuweisungen

Status: completed
Started: 2026-09-02T20:37:23.541Z
Direction: Aufgaben-Seite: dritter Tab \"Alle\" mit sämtlichen offenen Aufgaben und ihren Zuweisungen

## Claimed Scope
- apps/web/src/pages/TaskListPage/TaskListPage.tsx, apps/web/src/api/hooks.ts, apps/web/src/components/TaskCard/TaskCard.tsx, apps/api/src/infra/http/routes/tasks.ts, apps/api/src/app/queries/taskDto.ts, packages/shared/src/api/tasks.ts

## Intake Source

- File: .planning/intake/task-list-page-add-all-open-tasks-tab.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |  complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test --workspaces: shared 138/138, api 271/271, web 117/117 — all pass. Reviewed the backend query, DTO, and frontend diffs directly (INSTANCE_INCLUDE assignments join, listAllOpenTasks/toHouseholdTaskDto, GET /tasks/all route, TaskCard's additive assignee prop, read-only household tab). Independently re-run outside the build agent's own session, matching its reported results exactly. | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T20:37:23.541Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-02 (Phase 2 build): Implemented as a new dedicated read endpoint,
  `GET /tasks/all` → `listAllOpenTasks()` in `taskDto.ts`, rather than
  extending `/tasks/board`. `/tasks/board` is the §19 dashboard panel
  ("mine" + "available" + recently completed) and already has consumers
  relying on that exact shape; folding a household-wide roster into it would
  either change its meaning or force a third optional field onto a DTO that
  didn't need it. A new route stays additive and mirrors the existing
  `/tasks/available` / `/tasks/assigned-to-me` convention (household-scoped
  via `requireMember` + `viewerContext`).

- DTO shape: added `HouseholdTaskDto` (`AvailableTaskDto` + `assignee:
  HouseholdTaskAssigneeDto | null`) and `HouseholdTaskAssigneeDto`
  (`MemberRefDto` + `kind`) to `packages/shared/src/api/tasks.ts`, instead of
  reusing the existing `AssignmentSummaryDto`. `AssignmentSummaryDto` carries
  `rewardOnCompletion` and a per-viewer `buyoutQuote` — both meaningless (or
  wastefully computed, since `buyoutQuote` requires a pinned-config lookup)
  for a read-only roster showing *other* members' assignments. The lighter
  DTO also sidesteps any risk of leaking another member's buyout economics.
  `INSTANCE_INCLUDE.assignments.select` in `taskDto.ts` gained a `member: {
  id, displayName, avatarUrl }` join — purely additive (existing consumers
  of that include, e.g. `toAssignmentSummary`, still only read `memberId`)
  and mirrors the same join `admin.ts`'s `/admin/task-definitions/:id`
  route already uses for its live-instances list.

- Tab naming: the existing `Tab = 'all' | 'mine'` union in `TaskListPage.tsx`
  was renamed to `'available' | 'mine' | 'household'`. The old `'all'` value
  was misleading (it only ever showed `AVAILABLE` tasks) — renaming it to
  `'available'` is an internal-only change; its visible label
  (`de.dashboard.available`, "Freiwillig verfügbar") and behavior are
  unchanged. The new tab's visible label is `de.task.allHouseholdTasksTab`
  ("Alle Aufgaben").

- `TaskCard` gained an optional `assignee?: HouseholdTaskAssigneeDto | null`
  prop, rendered only when explicitly passed (`assignee &&
  <p>…</p>`). Every existing call site (`TaskListPage`'s other two tabs,
  `DashboardPage`) omits the prop, so nothing there changes. New strings:
  `de.task.assignmentKind.{VOLUNTARY,RANDOM}` (mirrors the existing
  `admin.taskDefinitions.instances.kindLabels` pattern); `de.task.assignedTo`
  ("an {name}") already existed and was previously unused outside its own
  definition, so it's reused here rather than duplicated.

- The household tab's cards are deliberately read-only (no `onAction`
  passed, so `TaskCard` renders no CTA button). Passing `onAction` would
  reuse the existing `isHeld` logic (`task.status === 'ASSIGNED'` ⇒
  "Erledigen" button, not disabled), which assumes an `ASSIGNED` row is
  always the *viewer's own* — true for `/tasks/assigned-to-me` but false
  here, where an `ASSIGNED` card can belong to any member. Showing an
  actionable "Erledigen" button on someone else's task would be a §31
  violation (a control that doesn't do what it says) even though the
  server would ultimately reject the mutation. Keeping the tab a pure
  roster avoids that without adding assignee-aware branching to `TaskCard`.

## Active Context

Phase 2 (build) complete. Backend: `GET /tasks/all` +
`listAllOpenTasks()`/`toHouseholdTaskDto()` in `taskDto.ts`, `member` join
added to `INSTANCE_INCLUDE.assignments`. Shared: `HouseholdTaskDto`,
`HouseholdTaskAssigneeDto` in `packages/shared/src/api/tasks.ts` (+ export
in `api/index.ts`). Frontend: `useAllHouseholdTasks()` hook, third
"Alle Aufgaben" tab in `TaskListPage.tsx` (renders read-only
`HouseholdTaskDto` cards via `TaskCard`'s new optional `assignee` prop),
new strings in `de.ts`. Tests added: `apps/api/test/integration/tasks-all.test.ts`
(household-wide AVAILABLE+ASSIGNED-to-others listing, assignee correctness,
existing two endpoints unchanged), `apps/web/src/components/TaskCard/TaskCard.test.tsx`
(additive-prop regression), `apps/web/src/pages/TaskListPage/TaskListPage.test.tsx`
(third tab wiring, empty AVAILABLE assignee, other two tabs unchanged).
9 files changed in the claimed scope (63 + backend query, 13 route, 9 hook,
26 TaskCard incl. CSS, 91 TaskListPage, 6 strings, 16 shared DTOs — 194
insertions / 30 deletions), plus 3 new test files. `npm run typecheck`,
`npm run lint`, and `npm run test --workspaces` (shared 138, api 271, web
117 — all green, including the 3 new test files) all pass. Next action:
Phase 3 (verify).

## Completion Record

- Completed At: 2026-09-02T22:48:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting the same commit/PR go-ahead pattern as the other campaigns this
  session)
- Verification: npm run typecheck, npm run lint, npm run test --workspaces
  all pass (shared 138/138, api 271/271, web 117/117), independently re-run
  and diffs reviewed directly, outside the build agent's own session
- Open item for reviewer: the household tab is intentionally read-only (no
  volunteer/complete CTA on any card) — if product wants a direct "volunteer"
  action from an AVAILABLE row on this tab, that's a deliberate follow-up,
  not an oversight (the existing CTA logic assumes ASSIGNED == "mine", which
  isn't true on this tab).

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: apps/api/src/app/queries/taskDto.ts,
  apps/api/src/infra/http/routes/tasks.ts, apps/web/src/api/hooks.ts,
  apps/web/src/components/TaskCard/TaskCard.tsx,
  apps/web/src/components/TaskCard/TaskCard.module.css,
  apps/web/src/components/TaskCard/TaskCard.test.tsx (new),
  apps/web/src/pages/TaskListPage/TaskListPage.tsx,
  apps/web/src/pages/TaskListPage/TaskListPage.test.tsx (new),
  apps/web/src/strings/de.ts, packages/shared/src/api/index.ts,
  packages/shared/src/api/tasks.ts,
  apps/api/test/integration/tasks-all.test.ts (new)
Blocking: none
