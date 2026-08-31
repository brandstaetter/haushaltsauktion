---
title: "TASK_TAKEN notification for voluntary pickup"
status: pending
priority: normal
target: apps/api/src/app/tasks/volunteerForTask.ts, apps/api/src/app/assignment/reopen.ts
---

## Description

`volunteerForTask.ts` and `reopen.ts` (voluntary pickup / accept flow) currently call `deps.notifier.emit` nowhere — only `runAssignmentSweep.ts`, `executeBuyout.ts`, and `completeTask.ts` do. This means a member voluntarily taking a chore produces no in-app notification event today, unlike random assignment, buyout, and completion, which all do.

Found and deliberately deferred during the todoist-integration campaign (see `.planning/campaigns/completed/todoist-integration.md`, decision D-07): that campaign's reconciler wires Todoist task creation off ownership events including voluntary pickup, but the underlying `TASK_TAKEN` notification type doesn't exist yet in the domain — it was scoped out as a general in-app-notification gap, not Todoist-specific plumbing, and ledgered here instead of being bundled into that campaign.

Add a `TASK_TAKEN` notification type (do not overload `TASK_ASSIGNED`, whose "you were selected at random" meaning is relied on elsewhere in the UI) and emit it from the voluntary-pickup and accept-assignment code paths, following the same `Notifier.emit(tx, drafts)` pattern already used in the sweep/buyout/completion call sites.

## Acceptance Criteria

- Voluntarily taking an available task emits a `TASK_TAKEN` notification via the existing `Notifier` port, inside the same transaction as the pickup.
- `TASK_ASSIGNED` semantics (random assignment) are left untouched — no overloading.
- Existing notification consumers (in-app list, and the Todoist reconciler's trigger matrix once it's live) can distinguish `TASK_TAKEN` from `TASK_ASSIGNED`.
- Test coverage mirrors the existing notifier tests for the sweep/buyout/completion call sites.
