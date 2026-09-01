---
title: "Task maintenance should show live instances and who they're assigned to"
status: in-progress
priority: normal
target: apps/api/src/infra/http/routes/admin.ts, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
campaign: task-maintenance-should-show-live-instances-and-who-they-re-assigned-to
---

## Description

The admin "task maintenance" screen (`TaskDefinitionsSection.tsx`, under Task Definitions) manages templates only — there's no view anywhere of the actual live instances a definition has produced, or who currently holds them.

The backend is halfway there already: `GET /admin/task-definitions/:id` (`apps/api/src/infra/http/routes/admin.ts:293-329`) already fetches open instances (`status: {in: ['DRAFT','AVAILABLE','ASSIGNED','PAUSED']}`) and returns them in the response — but the `select` only pulls `{ id, status, currentValue, dueAt }` (line 303), no assignee. And the frontend never renders `row.instances` at all today — grep confirms the only place `TaskDefinitionsSection.tsx` even mentions "instance" is the `HAS_OPEN_INSTANCES` delete-conflict error message; the actual instance list from this response is discarded.

The active-assignment join pattern already exists and is used elsewhere: `INSTANCE_INCLUDE` in `apps/api/src/app/queries/taskDto.ts:34-54` (used by `listAvailableTasks`/`listAssignedToMe`) already does `assignments: { where: { status: 'ACTIVE' }, select: { id, kind, status, response, assignedAt, ... } }` with member info joined — the admin endpoint's instance query should extend to something equivalent rather than inventing a new join shape.

This pairs naturally with the separate `admin-unassign-random-assignment` intake item (an admin "unassign" action already exists on the backend but has no UI trigger anywhere) — that ticket makes the action *possible*, this one makes it *discoverable*: today there's no admin screen that even shows which instances are live and assigned, so there's nowhere natural to put an unassign button in the first place. Scope them separately; this ticket is visibility only.

## Acceptance Criteria

- `GET /admin/task-definitions/:id`'s instance query includes the active assignment's member (id + displayName) and kind (`VOLUNTARY`/`RANDOM`), reusing the existing `INSTANCE_INCLUDE`-style join rather than a bespoke one.
- `TaskDefinitionsSection.tsx` (or the definition detail/edit view within it) renders the definition's live instances — status, current value, due date, and assignee (name + how they got it, or "niemand" if `AVAILABLE`) — so an admin editing a task definition can see at a glance what's actually in flight for it.
- Each listed instance links through to `/aufgaben/{id}` (`TaskDetailPage`) so an admin can act on it (complete, and once built, unassign) without hunting for it elsewhere.
- No change to member-facing task list behavior — this is additive to the admin definition view only.
