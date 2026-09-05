---
version: 1
id: "86ffd812-ab47-4be8-a19f-95af80a3a62a"
status: completed
started: "2026-09-05T20:03:25.324Z"
completed_at: "2026-09-05T22:30:00.000Z"
direction: "Due-soon reminder for assigned tasks with a set duration — implement the dormant TASK_DUE_SOON scaffold"
phase_count: 4
current_phase: 4
branch: feat/task-due-soon-reminder
worktree_status: null
---

# Campaign: Due-soon reminder for assigned tasks with a set duration — implement the dormant TASK_DUE_SOON scaffold

Status: completed
Started: 2026-09-05T20:03:25.324Z
Direction: Due-soon reminder for assigned tasks with a set duration — implement the dormant TASK_DUE_SOON scaffold

## Claimed Scope
- apps/api/src/app/assignment/runAssignmentSweep.ts, apps/api/prisma/schema.prisma, packages/shared/src/config/types.ts, packages/shared/src/config/schema.ts, packages/shared/src/config/defaults.ts

## Intake Source

- File: .planning/intake/due-soon-reminder-for-assigned-tasks.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

The request: when a `TaskInstance` is `ASSIGNED` and has **both** an estimated duration (`TaskDefinition.estimatedMinutes`) and a due time (`TaskInstance.dueAt`) set, notify every currently assigned worker that the task is about to become due, at `dueAt - 2 * estimatedMinutes` ("double the duration time before the expiry point" — confirmed `expiryDeadline()`, `apps/api/src/domain/recurrence/next-occurrence.ts:168-175`, returns `dueAt` verbatim whenever it's set, so "expiry point" and `dueAt` are the same instant here).

**This notification type already exists in the schema but has never been implemented.** `NotificationType.TASK_DUE_SOON` (`packages/shared/src/domain/enums.ts:157`) and `NotificationsConfig.dueSoonLeadMinutes` (`packages/shared/src/config/types.ts:160`, default `120` — `defaults.ts:106`) have been sitting in the config/enum/i18n surface since the push-notifications campaign, along with a real `de.ts` string (`de.notifications.types.TASK_DUE_SOON: '„{task}“ wird bald fällig'`). `pushNotifier.ts:51-52` says outright: *"Further types (`TASK_DUE_SOON`, `TASK_VALUE_INCREASED`, …) remain future work — not required by this campaign's acceptance criteria."* A repo-wide grep confirms zero references to `dueSoonLeadMinutes` anywhere under `apps/api/src/app` — nothing reads it, nothing fires `TASK_DUE_SOON`, ever. This item is what finally wires that up — but for a narrower, dynamically-computed trigger than the static `dueSoonLeadMinutes` config was presumably meant for.

### What this item resolves vs. what it's building fresh

- **Reuse, don't duplicate**: `TASK_DUE_SOON` already has a fitting name and a working `de.ts` template. No new `NotificationType` or i18n string is needed — this is the rare case where the scaffold already fits exactly.
- **Leave `dueSoonLeadMinutes` alone.** It's a flat, household-wide lead time with no dependency on a task having a duration estimate — a plausible design for "warn N minutes before anything becomes due, duration or no." The request here is explicitly conditioned on *both* `estimatedMinutes` and `dueAt` being set, with a *dynamic*, per-task lead (`2 × duration`, not a fixed number of minutes). These are two different mechanisms that happen to share a notification type. Implementing this item does **not** close the pre-existing gap of "tasks without a duration estimate never get a due-soon reminder either" — that's `dueSoonLeadMinutes`'s unfinished job, still separately dormant after this ships. Worth its own intake item later if wanted; out of scope here.
- **The "double" multiplier is configurable, not hardcoded** — same reasoning as the sibling `expiry.penaltyIncrement` config added in `assigned-task-expiry-penalty-reoffer.md`: CLAUDE.md §16/§44 wants no bare number in the rules, and there's exactly one parameter here (a multiplier on duration), so a full strategy enum would be overengineering. `NotificationsConfig.dueSoonDurationMultiplier: number`, default `2`, sitting next to the existing `dueSoonLeadMinutes` in the same config block (resolved via `/grill`, see below).
- **Applies to both `RANDOM` and `VOLUNTARY` assignments, and to every active worker on a multi-worker instance.** Unlike the sibling expiry-penalty item, nothing about this feature is punitive — it's a plain heads-up — so there's no reason from the request or from CLAUDE.md to restrict it by assignment kind. "All assigned workers" is explicit in the request and matches how `lockActiveAssignmentsOfInstance` already enumerates every active slot-holder for multi-worker instances (`AT_LEAST`/`AT_MOST` worker-count modes can have more than one).

### The part that needs real design attention: idempotency

The threshold condition (`now >= dueAt - 2 * estimatedMinutes`) stays **true** on every sweep tick from the moment it's crossed until the instance leaves `ASSIGNED` (completion, buyout, or the expiry sweep itself). `runAssignmentSweep` runs on a recurring interval (recently made configurable — see `ba4bdc6`/`191317f` in git history). Without an explicit "already notified" marker, this would refire the same reminder to the same worker on every single sweep tick between the threshold and the due date — a genuine notification-spam bug, not a hypothetical one.

Recommendation: add a nullable `dueSoonNotifiedAt DateTime?` column to **`TaskAssignment`** (`apps/api/prisma/schema.prisma:649-728`), not to `TaskInstance`. Reasoning:
- It's the same style already used on this exact model for one-shot timestamps (`respondedAt`, `completedAt`, `closedAt` are all nullable `DateTime` markers on `TaskAssignment` already).
- **Scoping the flag to the assignment, not the instance, matters because of the sibling buyout/expiry-penalty mechanics.** `TaskInstance.id` is reused across a buyout's or an expiry-penalty's re-offer cycle — the same instance can cycle through several different `TaskAssignment` rows (different `memberId`s) before its `dueAt` arrives, all against the same fixed `dueAt`. If the "already notified" flag lived on `TaskInstance`, a reminder sent to the *first* holder would permanently suppress the reminder for a *later* holder who took over after a buyout — someone who never actually got warned. Scoping to `TaskAssignment` means each new assignee gets their own fresh chance to be notified once, dedup automatically resets across the reassignment, and multi-worker instances (several simultaneously-`ACTIVE` assignment rows on one instance) each get their own independent flag with no cross-talk.
- The existing `@@index([taskInstanceId, status])` on `TaskAssignment` already supports the sweep's "find active assignments of ASSIGNED instances" query; no new index is strictly required at this project's stated scale (§43 — a handful of thousand instances per household per year), though `@@index([householdId, dueSoonNotifiedAt])` would be cheap to add if the sweep query ends up scanning it directly rather than joining through `TaskInstance`.

### Sweep implementation shape

Add a new step to `runAssignmentSweep.ts`, following the same shape as the existing T16-T18 expiry block (`runAssignmentSweep.ts:366-473`) it sits next to:
1. Load `ACTIVE` `TaskAssignment` rows (both kinds) whose instance is `ASSIGNED`, `dueAt IS NOT NULL`, `definition.estimatedMinutes IS NOT NULL`, and `dueSoonNotifiedAt IS NULL` — the same "fetch a bounded candidate set, filter/compute in application code" pattern the expiry block already uses for its per-row `expiryDeadline()` call, since the threshold depends on a joined field (`estimatedMinutes` lives only on `TaskDefinition`, confirmed not copied onto `TaskInstance` — `schema.prisma:483-486` vs. `582-644`) and can't be expressed as a flat SQL predicate without materializing it per row anyway.
2. For each candidate where `now.getTime() >= dueAt.getTime() - dueSoonDurationMultiplier * estimatedMinutes * 60_000`: emit a `TASK_DUE_SOON` notification to that assignment's `memberId` (payload at minimum needs `taskInstanceId` and whatever the `de.ts` template's `{task}` placeholder needs — check `NotificationBell.tsx`'s interpolation call for the exact payload shape other types already send), then stamp `dueSoonNotifiedAt = now` on that assignment row.
3. No history/audit event needed for this one — it's an informational nudge, not a state transition or a money-moving event; the existing `EXPIRED`/`BOUGHT_OUT`/etc. history-event convention is for things that change the task's status or ledger, neither of which happens here.

### Resolved via `/grill` (2026-09-05)

Four forks the first draft left open, now decided:

1. **No pinning of `estimatedMinutes` at assignment time.** The threshold always uses the *live* `TaskDefinition.estimatedMinutes` at sweep time. Unlike `valueAtAssignment`/`configVersion` (which pin money-affecting quotes so a later admin edit can't retroactively change what a member was promised), a duration estimate is display metadata with no fairness or ledger invariant to protect — an admin's correction should take effect immediately on any still-open instance. No extra schema field for this; confirmed no pinning column needed beyond the `dueSoonNotifiedAt` dedup flag already planned.
2. **`dueSoonDurationMultiplier` lives in `NotificationsConfig`**, directly beside `dueSoonLeadMinutes` — both govern the same `TASK_DUE_SOON` type, and splitting them across config sections would scatter one concept's controls for no benefit.
3. **Validation: `z.number().min(0).max(100)`**, not restricted to integers — matches `dueSoonLeadMinutes`'s own `min(0)` precedent (a `0` multiplier is a harmless degenerate case, not a state worth specifically forbidding), allows meaningful fractional values (1.5×), and caps at a generous sanity ceiling that only catches an obvious fat-finger.
4. **`TASK_DUE_SOON` is added to `PUSH_ENABLED_NOTIFICATION_TYPES`** (`pushNotifier.ts:54-58`, a one-line addition to the `Set` literal). A due-*soon* reminder that only reaches someone already looking at the app largely defeats its purpose — the original campaign's "deferred" note reflected scope-cutting at the time, not a considered reason to keep it in-app-only, so the push case wins on its own merits here.

## Acceptance Criteria

- An `ASSIGNED` `TaskInstance` with an `ACTIVE` assignment (either `kind`), a non-null `dueAt`, and a non-null `definition.estimatedMinutes` triggers exactly one `TASK_DUE_SOON` notification per active assignment once `now >= dueAt - dueSoonDurationMultiplier * estimatedMinutes`, sent to that assignment's member.
- An instance missing either `dueAt` or `estimatedMinutes` never triggers this notification (confirms the "if...is set" gating from the request, not just an implicit null-check side effect).
- The notification fires exactly once per `TaskAssignment` row — repeated sweep ticks after the threshold do not re-notify the same still-active assignment.
- A multi-worker instance (`AT_LEAST`/`AT_MOST` mode, 2+ simultaneously `ACTIVE` assignments) notifies every currently active worker independently.
- After a buyout or an expiry-penalty re-offer replaces the assignee on an instance whose `dueAt` is still ahead, the **new** assignment gets its own independent chance to be notified (regression test specifically against the "flag lived on the wrong model" failure mode described above).
- New `NotificationsConfig.dueSoonDurationMultiplier` wired through `types.ts`/`schema.ts`/`defaults.ts`: default `2`, `z.number().min(0).max(100)`, alongside the existing `dueSoonLeadMinutes` (left untouched and still unused by this item).
- `dueSoonLeadMinutes` remains explicitly out of scope — no behavior change to it, and no attempt made here to give it a consumer.
- `TASK_DUE_SOON` is present in `PUSH_ENABLED_NOTIFICATION_TYPES` (`pushNotifier.ts`) — a due-soon reminder is also delivered via Web Push, not in-app only.
- The threshold computation reads `TaskDefinition.estimatedMinutes` fresh at sweep time — a test changing the definition's estimate on an already-open, not-yet-notified instance should observably shift when the reminder fires, confirming no stale/pinned copy is being read instead.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (7 files changed, 199 insertions(+), 2 deletions(-); new migration + new test file untracked) | done | 2 | — |
| phase:3 | verification-command | test_result | yes | npm run test — 3/3 workspaces passed: shared 146/146, api 409/409, web 175/175; repo-wide typecheck clean; eslint clean on changed files | done | 2 | — |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/79 | resolved | 2 | review pull request |

## Decision Log

- 2026-09-05T20:03:25.324Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-05: Phase 2 (build) delegated to a sub-agent on branch `feat/task-due-soon-reminder`.
  Delivered: `TaskAssignment.dueSoonNotifiedAt` column + migration `20260905201151_add_task_assignment_due_soon_notified_at`; `NotificationsConfig.dueSoonDurationMultiplier` (default 2, min 0/max 100) through types/schema/defaults; `TASK_DUE_SOON` added to `PUSH_ENABLED_NOTIFICATION_TYPES`; new T19 sweep step in `runAssignmentSweep.ts` with a live (non-pinned) threshold re-check inside the instance lock; new `apps/api/test/integration/due-soon-notifications.test.ts` (7 tests) plus a `packages/shared/test/config.test.ts` addition for the new field's bounds/default.
  Verified independently by Archon (not just taking the sub-agent's self-report): re-read every diff line-by-line against the campaign's Acceptance Criteria and the `/grill`-resolved design, re-ran `npm run build -w packages/shared`, repo-wide `npm run typecheck`, the new test file alone, the full `apps/api` suite, `packages/shared`'s suite, and `eslint` on every changed file — all clean, matching the sub-agent's claims exactly.
- 2026-09-05: Phase 3 (verify) satisfied by the same test run — root `npm run test` (the phase's declared end condition) passes across all three workspaces (146+409+175 = 730 tests).
- 2026-09-05: Phase 4 (package) — committed the scoped diff (11 files: schema, migration, sweep logic, push allow-list, config types/schema/defaults, both test files, this campaign file, and the originating intake file), pushed `feat/task-due-soon-reminder`, opened PR #79 (https://github.com/brandstaetter/haushaltsauktion/pull/79) after explicit user confirmation for the push/PR step (Red-reversibility gate). `package-delivery.js --pr <url>` recorded the review package and resolved the phase:4 exit-evidence row.
  Note: the sibling intake item `assigned-task-expiry-penalty-reoffer.md` (a separate, not-yet-built feature from the same session) was deliberately left uncommitted/untracked — out of scope for this PR.

## Active Context

Campaign complete. All 4 phases done, PR #79 open awaiting human review/CI. No further action from this campaign; `/pr-watch 79` or the cloud auto-fix toggle can handle CI failures if any arise.

## Continuation State

Phase: 4 (final)
Sub-step: complete
Files modified: see commit ce0a67b on `feat/task-due-soon-reminder`
Blocking: none — awaiting PR review/merge (outside this campaign's scope)
