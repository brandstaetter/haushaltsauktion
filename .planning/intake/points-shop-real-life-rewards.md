---
title: "Punkte-Shop: reale Belohnungen gegen Punkte einlösbar, adminseitig verwaltet und erfüllt"
status: pending
priority: normal
target: apps/api/prisma/schema.prisma, apps/api/src/app/rewards/, apps/api/src/app/points/postTransaction.ts, apps/api/src/infra/http/routes/, apps/web/src/pages/AdminPage/, apps/web/src/pages/ (new RewardsShopPage), apps/web/src/api/hooks.ts
---

## Description

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
