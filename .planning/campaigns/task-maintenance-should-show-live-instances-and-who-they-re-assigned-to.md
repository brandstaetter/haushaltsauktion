---
version: 1
id: "5d4e634b-4aa5-46b9-bbc7-3f42235081e5"
status: active
started: "2026-09-01T04:39:18.263Z"
completed_at: null
direction: "Task maintenance should show live instances and who they're assigned to"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Task maintenance should show live instances and who they're assigned to

Status: active
Started: 2026-09-01T04:39:18.263Z
Direction: Task maintenance should show live instances and who they're assigned to

## Claimed Scope
- apps/api/src/infra/http/routes/admin.ts, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx

## Intake Source

- File: .planning/intake/admin-visibility-live-instances-and-assignees.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

The admin "task maintenance" screen (`TaskDefinitionsSection.tsx`, under Task Definitions) manages templates only — there's no view anywhere of the actual live instances a definition has produced, or who currently holds them.

The backend is halfway there already: `GET /admin/task-definitions/:id` (`apps/api/src/infra/http/routes/admin.ts:293-329`) already fetches open instances (`status: {in: ['DRAFT','AVAILABLE','ASSIGNED','PAUSED']}`) and returns them in the response — but the `select` only pulls `{ id, status, currentValue, dueAt }` (line 303), no assignee. And the frontend never renders `row.instances` at all today — grep confirms the only place `TaskDefinitionsSection.tsx` even mentions "instance" is the `HAS_OPEN_INSTANCES` delete-conflict error message; the actual instance list from this response is discarded.

The active-assignment join pattern already exists and is used elsewhere: `INSTANCE_INCLUDE` in `apps/api/src/app/queries/taskDto.ts:34-54` (used by `listAvailableTasks`/`listAssignedToMe`) already does `assignments: { where: { status: 'ACTIVE' }, select: { id, kind, status, response, assignedAt, ... } }` with member info joined — the admin endpoint's instance query should extend to something equivalent rather than inventing a new join shape.

This pairs naturally with the separate `admin-unassign-random-assignment` intake item (an admin "unassign" action already exists on the backend but has no UI trigger anywhere) — that ticket makes the action *possible*, this one makes it *discoverable*: today there's no admin screen that even shows which instances are live and assigned, so there's nowhere natural to put an unassign button in the first place. Scope them separately; this ticket is visibility only.

## Acceptance Criteria

- `GET /admin/task-definitions/:id`'s instance query includes the active assignment's member (id + displayName) and kind (`VOLUNTARY`/`RANDOM`), reusing the existing `INSTANCE_INCLUDE`-style join rather than a bespoke one.
- `TaskDefinitionsSection.tsx` (or the definition detail/edit view within it) renders the definition's live instances — status, current value, due date, and assignee (name + how they got it, or "niemand" if `AVAILABLE`) — so an admin editing a task definition can see at a glance what's actually in flight for it.
- Each listed instance links through to `/aufgaben/{id}` (`TaskDetailPage`) so an admin can act on it (complete, and once built, unassign) without hunting for it elsewhere.
- No change to member-facing task list behavior — this is additive to the admin definition view only.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat — 10 files changed, 359 insertions(+), 5 deletions(-) | pass | 2 | — |
| phase:3 | verification-command | test_result | yes | `npm run typecheck` clean; `npm run lint` clean; `npm run test --workspaces` — shared (128/128), api (244/244, incl. new admin-task-definitions integration test against local Postgres), web (73/73, incl. new instance-list test) all passed | pass | 2 | — |
| phase:4 | review-package | review_package | yes | .planning/review-packages/task-maintenance-should-show-live-instances-and-who-they-re-assigned-to.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-01T04:39:18.263Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01T05:00:00.000Z: Implemented visibility-only as scoped — extended `GET /admin/task-definitions/:id`'s instance select with the active assignment's kind and member (id, displayName), added `useAdminTaskDefinitionDetail` and rendered a "Laufende Instanzen" list inside the edit sheet, each row linking to `/aufgaben/{id}`. Also wired `useMaterializeTaskDefinition` to invalidate the admin task-definitions query key so a freshly materialized instance shows up in the list without a manual refresh.
  Reason: The detail endpoint already existed and was already fetching instances but discarding assignee data and never being called from the frontend — extending the existing join and adding one hook was enough; no bespoke join shape or new endpoint was needed.

## Active Context

Implementation and verification complete. Next action: package for review (open a PR) and complete the campaign.

## Continuation State

Phase: 4
Sub-step: implementation and verification done, packaging next
Files modified: apps/api/src/infra/http/routes/admin.ts, apps/api/test/integration/admin-task-definitions.test.ts, apps/web/src/api/hooks.ts, apps/web/src/api/types.ts, apps/web/src/pages/AdminPage/AdminPage.module.css, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx, apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx, apps/web/src/strings/de.ts
Blocking: none
