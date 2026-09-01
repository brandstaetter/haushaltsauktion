---
version: 1
id: "cf6f4be1-689e-46b5-abf4-04e5f075013e"
status: active
started: "2026-09-01T05:02:35.148Z"
completed_at: null
direction: "Admin \\"unassign\\" action for random assignments — backend done, no UI"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Admin \"unassign\" action for random assignments — backend done, no UI

Status: active
Started: 2026-09-01T05:02:35.148Z
Direction: Admin \"unassign\" action for random assignments — backend done, no UI

## Claimed Scope
- apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx, apps/web/src/api/hooks.ts, apps/web/src/strings/de.ts

## Intake Source

- File: .planning/intake/admin-unassign-random-assignment.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | pending | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | pending | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | pending | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test | pending | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-unassign-action-for-random-assignments-backend-done-no-ui.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-01T05:02:35.148Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

## Active Context

Delivery preflight complete. Next action: implement Phase 2 using the claimed scope, acceptance criteria, map context, and evidence contract.

## Continuation State

Phase: 2
Sub-step: implementation not started
Files modified: campaign scaffold only
Blocking: none
