---
version: 1
id: "8c7d65e7-a30f-4d10-91d3-3a0c47ea5442"
status: active
started: "2026-09-01T03:57:12.531Z"
completed_at: null
direction: "History entries missing task name and new value (NO_VOLUNTEER, VALUE_RESET, RANDOMLY_ASSIGNED)"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: History entries missing task name and new value (NO_VOLUNTEER, VALUE_RESET, RANDOMLY_ASSIGNED)

Status: active
Started: 2026-09-01T03:57:12.531Z
Direction: History entries missing task name and new value (NO_VOLUNTEER, VALUE_RESET, RANDOMLY_ASSIGNED)

## Claimed Scope
- apps/web/src/strings/de.ts, apps/web/src/pages/HistoryPage/HistoryPage.tsx

## Intake Source

- File: .planning/intake/history-entries-missing-task-and-value.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Three entries in the "Verlauf" (history) view are unreadable in a household with more than one open task, reported directly from the UI:

- **"Zufallszuweisung an Elke"** — doesn't say for which task. Same shape as the other two below: `RANDOMLY_ASSIGNED: 'Zufallszuweisung an {member}'` (`de.ts:188`) has no `{task}` placeholder either, and `event.taskTitle` is available on this event the same way it is on every other one.

- **"Keine freiwillige Übernahme"** — doesn't say which task. `de.history.eventTypes.NO_VOLUNTEER` (`apps/web/src/strings/de.ts:187`) has no `{task}` placeholder, unlike its sibling `OFFERED: '{task} wurde angeboten — Wert {value}'` (line 186). This isn't a missing-data problem: `HistoryPage.tsx`'s `renderEvent` (`apps/web/src/pages/HistoryPage/HistoryPage.tsx:55-69`) already receives `event.taskTitle` on every event and substitutes `{task}` when the template has one — `NO_VOLUNTEER`'s template simply never references it.

- **"Aufgabenwert auf zurückgesetzt"** — renders with no number at all (literally a double space where the value should be). `VALUE_RESET: 'Aufgabenwert auf {value} zurückgesetzt'` (`de.ts:195`) interpolates `{value}` from `event.payload.value` (`HistoryPage.tsx:65`), but both places that write a `VALUE_RESET` history event — `apps/api/src/app/tasks/completeTask.ts:239-246` and `apps/api/src/app/assignment/runAssignmentSweep.ts:314-320` — write the payload as `{ from, to, strategy }`, never a `value` key. `event.payload.value` is always `undefined` for this event type, so the placeholder silently resolves to an empty string. Same missing-`{task}`-placeholder issue as `NO_VOLUNTEER` applies here too.

Worth a quick check whether the same missing-`{task}` gap applies to other task-scoped event types in the same table (`ASSIGNMENT_ACCEPTED`, `VALUE_INCREASED`, `EXPIRED`, `RELEASED`, `PAUSED`, `RESUMED` all currently lack `{task}` too) — scope that as part of the same pass rather than a second ticket, since it's the identical one-line fix repeated.

## Acceptance Criteria

- `NO_VOLUNTEER` and `RANDOMLY_ASSIGNED` (and any other task-scoped event type found missing it) include `{task}` in their templates and render the actual task title, matching `OFFERED`'s pattern.
- `VALUE_RESET` renders the actual new value — either the frontend reads `{to}` instead of `{value}` for this event type, or the backend's payload gains a `value` key at both write sites (`completeTask.ts`, `runAssignmentSweep.ts`); pick whichever keeps `renderEvent`'s replace-chain from needing a type-specific branch, since every other event type there is a flat `{placeholder}` → `payload[key]` mapping.
- Existing history-rendering tests (if any) cover both fixed strings with a real payload, not just the empty-payload case that let the `{value}` gap through.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | `de.ts` 13 event-type templates gained `{task}`; `VALUE_RESET` switched `{value}`→`{to}` (matching the actual payload key); `HistoryPage.tsx` exports `renderEvent` and adds a `{to}` replace line; new `HistoryPage.test.tsx` (5 tests) | complete | 2 | — |
| phase:3 | verification-command | test_result | yes | `npx tsc --noEmit` (root) clean; `npm run typecheck -w apps/web` clean; `npx eslint` on all three touched files clean; `npm run test -w apps/web` — 72/72 passed (5 new + 67 existing, no regressions) | complete | 2 | — |
| phase:4 | review-package | review_package | yes | .planning/review-packages/history-entries-missing-task-name-and-new-value-no-volunteer-value-reset-randoml.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-01T03:57:12.531Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01T04:00:00Z: Swept every event-type template in `de.ts`, not just the 3 confirmed in the intake report — 13 total gained `{task}` (the 3 confirmed + `ASSIGNMENT_ACCEPTED`, `BOUGHT_OUT`, `VALUE_INCREASED`, `POINTS_AWARDED`, `RELEASED`, `EXPIRED`, `CONSTRAINT_RELAXED`, `NO_ELIGIBLE_CANDIDATES`, `PAUSED`, `RESUMED`, `POINTS_CLAWED_BACK`). Verified each has a required `taskInstanceId` in its backend write site (or, for `PAUSED`/`RESUMED`/`RELEASED`, is task-scoped by name and not yet wired to any writer) before adding the placeholder. Left `CONFIG_CHANGED` alone — household-level, no task relation.
  Reason: Acceptance criterion #1 explicitly asked for "any other task-scoped event type found missing it," not just the named examples.
- 2026-09-01T04:00:00Z: Fixed `VALUE_RESET`'s value gap by changing the template to `{to}` and adding a generic `.replace('{to}', ...)` line to `renderEvent`, instead of adding a duplicate `value` key at the two backend write sites.
  Reason: `renderEvent` is already a flat `{placeholder}` → `payload[key]` replace chain with no type-specific branches; matching that shape needed one frontend-only line instead of touching two backend files to duplicate `to` as `value`.
- 2026-09-01T04:00:00Z: Found but did NOT fix — `CONSTRAINT_RELAXED`'s `{constraint}` and `CONFIG_CHANGED`'s `{key}` placeholders have no matching `.replace()` in `renderEvent` at all (pre-existing, unrelated to what was reported).
  Reason: Out of this ticket's scope — not reported, not in the acceptance criteria. Worth its own intake item later.

## Active Context

Phase 3 (verify) complete — typecheck, lint, and tests all clean. Phase 4 next: package for review (PR).

## Continuation State

Phase: 4
Sub-step: not yet packaged
Files modified: apps/web/src/strings/de.ts, apps/web/src/pages/HistoryPage/HistoryPage.tsx, apps/web/src/pages/HistoryPage/HistoryPage.test.tsx (new)
Blocking: none
