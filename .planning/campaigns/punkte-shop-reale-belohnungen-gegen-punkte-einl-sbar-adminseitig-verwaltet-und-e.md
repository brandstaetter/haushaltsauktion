---
version: 1
id: "72d14b9e-35e0-4bd6-8151-82def1b82561"
status: completed
started: "2026-09-03T05:50:14.743Z"
completed_at: null
direction: "Punkte-Shop: reale Belohnungen gegen Punkte einlösbar, adminseitig verwaltet und erfüllt"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Punkte-Shop: reale Belohnungen gegen Punkte einlösbar, adminseitig verwaltet und erfüllt

Status: completed
Started: 2026-09-03T05:50:14.743Z
Direction: Punkte-Shop: reale Belohnungen gegen Punkte einlösbar, adminseitig verwaltet und erfüllt

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/src/app/rewards/, apps/api/src/app/points/postTransaction.ts, apps/api/src/infra/http/routes/, apps/web/src/pages/AdminPage/, apps/web/src/pages/ (new RewardsShopPage), apps/web/src/api/hooks.ts

## Intake Source

- File: .planning/intake/points-shop-real-life-rewards.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

New feature request: a points shop where household members can spend their
points on real-life rewards (e.g. "Filmabend aussuchen", "Ausschlafen am
Samstag") that an admin defines and fulfills manually — this is not
automation, it's a request/approval queue on top of the existing points
ledger.

**Three pieces, mapped onto existing patterns:**

1. **Reward catalog (admin-maintained).** A new entity — e.g.
   `RewardDefinition` (title, description, cost in points, active/inactive)
   — parallel to `TaskDefinition` (`schema.prisma:359-401`). Admin CRUD UI
   as a new page, following the already-established split-per-domain admin
   nav pattern (`AdminCategoriesPage.tsx`, `AdminMembersPage.tsx`,
   `AdminTasksPage.tsx` — see also the sibling intake item
   `split-verwaltung-nav-pages.md`), not a tab bolted onto an existing page.

2. **Purchase → debit points.** When a member buys a reward, points must be
   deducted through the existing ledger, never as a bare balance write
   (CLAUDE.md §14, §44 — "Jede Punkteänderung ist über ein Ledger
   nachvollziehbar"). `PointTransactionType`
   (`schema.prisma:80-88`) currently has no case for this; it needs a new
   type (e.g. `REWARD_REDEMPTION`) alongside `VOLUNTARY_TASK_REWARD`,
   `BUYOUT`, `MANUAL_ADJUSTMENT`. Model the write on
   `apps/api/src/app/points/postTransaction.ts` and
   `apps/api/src/app/buyout/executeBuyout.ts` (both already do
   check-balance-then-atomically-debit under the hash-chained ledger). A
   new `RewardRedemption` entity (parallel to `TaskAssignment`) tracks who
   bought what and its fulfillment state (`PENDING` / `FULFILLED`).
   Decide (with the requester) whether insufficient-balance and
   negative-balance rules should reuse the buyout config
   (`allowNegativeBalance`, `minimumBalance` in
   `packages/shared/src/config/schema.ts`) or get their own.

3. **Admin fulfillment queue.** "Admins see an entry similar to a free
   task that tells them who bought what reward" — i.e. a list of pending
   `RewardRedemption` rows (member, reward, cost, timestamp), each with a
   single fulfill action. On click: mark `FULFILLED`, write a
   `TaskHistoryEvent`-equivalent audit trail entry, and the entry
   disappears for everyone — this is a live/shared view, not a
   per-member cache, so it needs the same invalidation care flagged in
   `.planning/intake/todoist-activation-not-persisted.md` (every mutation
   invalidates the query key every viewer reads from).

## Acceptance Criteria

- `RewardDefinition` CRUD (title, description, point cost, active flag),
  admin-only, on its own admin page.
- Member-facing shop view: browse active rewards, see own point balance,
  buy a reward (with the same up-front consequence display CLAUDE.md §31
  demands for buyouts — balance before/after — since this is the same
  category of "spend points" action).
- Buying a reward atomically: validates balance per configured rules,
  debits points through the ledger with a new `PointTransactionType`,
  creates a `RewardRedemption` row, no client-computed or client-trusted
  price (§36 — server is the sole source of truth for cost).
- Admin fulfillment queue lists all pending redemptions household-wide
  (who bought what, when); a "Erfüllt" action marks it fulfilled and it
  disappears from every viewer's queue, not just the acting admin's.
- Regression tests: purchase with sufficient points succeeds and ledger
  balance matches; purchase with insufficient points is rejected per
  configured negative-balance rule; two concurrent fulfillments of the
  same redemption resolve to exactly one `FULFILLED` transition (race
  condition, same class as the volunteer-race case in CLAUDE.md §35).
- Decide and document whether fulfillment is reversible (e.g. an
  accidental click) or terminal — not specified by the requester yet.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat — 26 files changed, 501 insertions(+), 7 deletions(-); plus new files (2 migrations, app/rewards/, domain/rewards/, infra/http/routes/rewards.ts, RewardsShopPage, AdminRewardsPage, RewardsSection, RewardRedemptionsSection, RewardPurchaseDisclosure, packages/shared/src/api/rewards.ts, 2 new test files) | done | 2 | — |
| phase:3 | verification-command | test_result | yes | npm run typecheck (root, clean) · npm run lint (root, clean) · npm run test (shared 144 passed, api 293 passed incl. new reward-shop domain+integration tests, web 118 passed) — all against a live Postgres via migrate dev | done | 2 | — |
| phase:4 | review-package | review_package | yes | .planning/review-packages/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-03T05:50:14.743Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-03: Reward-shop balance rules get their own `rewards` config section
  (`enabled`, `allowNegativeBalance`, `minimumBalance`, `maximumDebt`) rather
  than reusing `buyout`'s — the intake explicitly left this open. Reason: a
  reward purchase is a discretionary spend, not the buyout mechanic's
  punishment-avoidance; an admin tightening buyout debt limits should not
  silently also change what the shop allows.
- 2026-09-03: Fulfillment is terminal (no "un-fulfill" action) — the intake
  left this undecided too. Reason: matches the codebase's existing precedent
  (task completion has no plain undo either — only the admin
  reject-completion moderation path, which has no analog here since a reward
  isn't machine-verifiable); an accidental click can be corrected with a
  manual points adjustment if ever needed, same as any other admin mistake.
- 2026-09-03: `REWARD_REDEMPTION` gets its own link column
  (`point_transactions.reward_redemption_id`) rather than reusing
  `task_assignment_id`, with its own pair of CHECK constraints mirroring the
  `BUYOUT`/`STREAK_BONUS` pattern (§1.5) — a redemption is not a
  `TaskAssignment` row, so overloading the existing column would have broken
  the composite-FK trick that keeps `assignment_kind` honest.

## Active Context

Implementation, typecheck, lint, and the full test suite (domain +
integration against live Postgres) are all done and green. Remaining:
package the delivery for review (Phase 4).

## Continuation State

Phase: 4
Sub-step: implementation, verification complete — package for review next
Files modified: see Exit Evidence phase:2 row
Blocking: none

## Completion Record

- Completed At: 2026-09-03T06:15:55.067Z
- Outcome: review-package
- Note: All acceptance criteria implemented and tested; local review package created for user review before commit.
