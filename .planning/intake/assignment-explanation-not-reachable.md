---
title: "Fairness explanation ('why was I assigned this') is effectively unreachable"
status: completed
priority: normal
target: apps/web/src/components/NotificationBell/NotificationBell.tsx, apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx
---

## Description

The §32 Fairness-Transparenz feature ("Warum wurde mir diese Aufgabe zugewiesen?") is fully implemented — `AssignmentExplanation.tsx` correctly calls `GET /assignments/:id/explain`, renders eligible candidates, weights, and exclusion reasons, and is already wired into `TaskDetailPage.tsx:104-106` (shown whenever `task.activeAssignment.kind === 'RANDOM'`). The bug isn't in that component — it's that nothing actually gets a user there.

**Confirmed root cause:** `NotificationBell.tsx:90-101` — clicking a notification in the bell dropdown only does `markRead.mutate(n.id)`. It doesn't navigate anywhere. `NotificationRow` already carries `taskInstanceId` (`apps/api/src/app/queries/reads.ts:224-229`), so the data needed to route to the task is right there — the click handler just never uses it. A "You were randomly assigned to Bad putzen" notification — the single most natural place a user would go looking for "why" — currently does nothing but clear its own unread dot when tapped.

**Secondary, related gap:** the dedicated "you were selected, decide now" screen CLAUDE.md §21 describes (with its own explicit "why" link — see `de.decision.why: 'Warum wurde mir das zugewiesen?'` in `apps/web/src/strings/de.ts`) was apparently never built as a distinct surface — grep confirms **zero** usages of any `de.decision.*` string anywhere in the frontend, 14 dead keys. The equivalent functionality lives on the generic `TaskDetailPage` instead, where the fairness trigger is a small `variant="ghost"` button (`de.fairness.trigger`) sitting under the assignee line — functionally fine, but easy to miss compared to what the spec's mockup implies, and only reachable at all via `NotificationBell`'s dead click handler or manually browsing to the task from the dashboard.

## Acceptance Criteria

- Clicking a `RANDOMLY_ASSIGNED` notification (and reasonably, other task-scoped notification types) navigates to `/aufgaben/{taskInstanceId}` in addition to marking it read, so the explanation is one tap away from the point where a user is actually told they were assigned something.
- Confirm the fairness-explanation button on `TaskDetailPage` is reasonably prominent for a fresh, undecided random assignment (`activeAssignment.response === 'PENDING'` per `TaskDetailPage.tsx:51`) — decide during build whether the current ghost-button placement is sufficient or needs to move closer to the accept/buyout decision itself.
- Either wire up the dead `de.decision.*` strings to a real surface, or remove them if the generic `TaskDetailPage` is the intended permanent home for this flow — don't leave 14 unused keys as silent drift between the spec and the implementation.
- Add a regression test asserting the notification click navigates (existing `NotificationBell` tests, if any, plus a `TaskDetailPage`/routing-level check) — the current bug is exactly the kind of thing that's invisible to unit tests scoped to `markRead` alone.
