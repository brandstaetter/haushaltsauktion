---
title: "Admin \"unassign\" action for random assignments — backend done, no UI"
status: completed
priority: normal
target: apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx, apps/web/src/api/hooks.ts, apps/web/src/strings/de.ts
campaign: admin-unassign-action-for-random-assignments-backend-done-no-ui
---

## Description

This already exists end-to-end on the backend and is simply never exposed anywhere in the UI.

`POST /admin/instances/:id/revoke-assignment` (`apps/api/src/infra/http/routes/admin.ts:969-992`) calls `releaseOrRevokeAssignment(..., mode: 'REVOKE')` (`apps/api/src/app/assignment/reopen.ts:46`), which — unlike the member-facing `RELEASE` path — works on **any** assignment kind, including `RANDOM` (the `kind !== 'VOLUNTARY'` guard at `reopen.ts:92-98` only applies to `RELEASE`, not `REVOKE`). It's free (no points charged either way), resets the task back to `AVAILABLE` with a fresh offer window, handles the `ON_ACCEPT` reward clawback correctly if needed, takes an optional `reason` string, and writes a proper `REVOKED` history event with that reason. This is exactly "an admin should always have the option to unassign an automatically assigned instance of a task" — already built, tested (presumably — it shares the same transaction path as `RELEASE`, which has coverage), and completely unreachable from the app.

Grep confirms zero frontend references to `revoke-assignment` anywhere. There's no admin "live task instances" view at all today (`AdminPage` only has Task Definitions / Categories / Members / Settings — definitions are templates, not running instances), so the natural integration point is the existing `TaskDetailPage`, which every user (including admins) already lands on for a specific task. `TaskDetailPage.tsx:32` already calls `useMemberMe()` and the member DTO already carries `role: 'MEMBER' | 'ADMIN'` (`apps/web/src/api/types.ts:15`) — the admin-check plumbing is already sitting right there, just unused for this purpose.

**One more small gap this will surface:** `de.history.eventTypes` (`apps/web/src/strings/de.ts:185-206`) has no `REVOKED` entry. `renderEvent`'s fallback (`HistoryPage.tsx`) would render it as the raw literal `"REVOKED: {taskTitle}"` today — needs a real string before this ships, or every unassign shows up ugly in Verlauf.

## Acceptance Criteria

- On `TaskDetailPage`, when the viewer is an admin (`me.role === 'ADMIN'`) and the task has an active assignment (regardless of `kind` — voluntary or random), show an "unassign" action calling `POST /admin/instances/{id}/revoke-assignment`, matching the existing `reject-completion` mutation hook's shape in `apps/web/src/api/hooks.ts:320-334` as the template.
- Optional reason field/prompt on the action, passed through as `body.reason` (already supported server-side).
- `de.history.eventTypes.REVOKED` gets a real template (with `{task}` and `{member}`, matching the sibling `RELEASED` pattern once that one exists too — see the separate `history-entries-missing-task-and-value` intake item's note that `RELEASED` isn't wired to any writer yet; `REVOKED` **is** wired, today, and needs its string now, not later).
- Confirm this doesn't need a "why does this button not appear" moment for non-admins — verify the conditional render actually hides it, not just disables it, for `MEMBER` role viewers.
- No backend changes expected — this is UI wiring against an already-complete, already-audited endpoint. If review turns up a real backend gap (e.g. missing test coverage), note it, don't silently expand scope to add it here.
