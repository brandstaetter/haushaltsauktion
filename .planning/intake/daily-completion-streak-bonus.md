---
title: "Streaks: konfigurierbarer Tages-Bonus für aufeinanderfolgende Tage mit erledigten Aufgaben"
status: completed
priority: normal
target: apps/api/prisma/schema.prisma, apps/api/src/domain/task/value.ts, apps/api/src/app/tasks/completeTask.ts, apps/api/src/app/tasks/rejectCompletion.ts, apps/api/src/infra/jobs/worker.ts, packages/shared/src/config/schema.ts
campaign: streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten
---

## Description

New reward mechanic: a per-member day-streak. Every day the member
successfully completes at least one task, a bonus is added to the points
they receive. Missing a day resets the streak. Two admin-rejection
outcomes affect it differently — and both map exactly onto mechanics that
already exist in `rejectCompletion.ts` (`RejectCompletionOutcome`):

- **`REOFFER_MARKET`** ("rejected and made open for all", §21/§10's
  "erneut angeboten") → streak ends immediately.
- **`REASSIGN_TO_MEMBER`** ("rejected and returned to the same user") →
  streak only ends if the member did **no other task that day** *and*
  the returned task is not itself later completed successfully. In other
  words: a rejection-and-redo doesn't retroactively break the streak as
  long as either another completion covers that day, or the redo itself
  eventually lands.

Both outcomes already claw back the rejected completion's reward via
`clawback()` (`rejectCompletion.ts:108-117`) — the streak bonus tied to
that reward needs to be clawed back symmetrically, and the streak-state
change needs to be decided per outcome as above.

**Resolved by the requester, following up on the original brief:**

- **Formula:** `dailyBonus = floor(0.5 × currentStreakLength)`, paid once
  for each day the streak continues (not per task). `0.5` is the
  configurable base rate — the multiplier, not a flat amount. This also
  quietly resolves the fractional-ledger problem flagged below: floored,
  the result is always a whole number, so it posts as an ordinary integer
  transaction with no accrual state needed. One direct consequence worth
  confirming is intended: day 1 of every streak pays `floor(0.5×1) = 0`,
  i.e. no ledger row at all that day (consistent with the existing "zero
  means no row" convention `voluntaryReward()` already uses, §4.5) — the
  bonus only becomes visible from day 2 onward.
- **Random-assigned completions:** count toward keeping the streak
  *alive* (a day with only a `RANDOM` completion does not break it), but
  never *advance a payment* — no ledger transaction is posted on account
  of a random completion, consistent with §7/§44 ("keine Punkte für die
  reguläre Erledigung einer zufällig zugewiesenen Aufgabe" — this
  invariant is preserved because the streak bonus is only ever triggered
  by a `VOLUNTARY` completion; a random-only day just means no bonus
  triggers that day, not that the streak resets).

**Remaining implementation issues, each grounded in an existing
invariant:**

1. ~~Fractional amounts don't fit the ledger~~ — resolved above; floor
   makes every posting a whole number by construction.
2. **What triggers a given day's payment, and what does it attach to?**
   Since payment requires a `VOLUNTARY` completion but continuation
   doesn't, the *triggering* completion for a given day is whichever
   voluntary completion happens on a day that has one. Recommend
   attaching the new transaction to that assignment the same way
   `VOLUNTARY_TASK_REWARD` does (`taskAssignmentId`, `assignmentKind`),
   with an idempotency key on the same pattern as
   `reward:<assignmentId>` used in `completeTask.ts:144` — e.g.
   `streak:<assignmentId>` — so a retried request can't double-pay it.
   Needs a new `PointTransactionType` case (e.g. `STREAK_BONUS`) in
   `packages/shared/src/config/schema.ts` / the Prisma enum, with its own
   sign rule in `signRuleViolated()`
   (`apps/api/src/domain/points/ledger-math.ts:122-127`, `amount > 0`
   like `VOLUNTARY_TASK_REWARD`).
3. **Clawback symmetry.** When a voluntary completion that triggered a
   streak-bonus payment is later rejected (either outcome), `clawback()`
   (`apps/api/src/app/points/clawback.ts`, called from
   `rejectCompletion.ts:108-117`) currently only reverses
   `VOLUNTARY_TASK_REWARD`. It needs to also reverse the `STREAK_BONUS`
   transaction tied to the same `taskAssignmentId`, and the streak
   *length* itself needs to roll back per the two outcomes described
   above (immediate break for `REOFFER_MARKET`; conditional break for
   `REASSIGN_TO_MEMBER`).
4. **Detecting an idle day (streak break) needs a daily sweep.** There's
   no task event for "a day ended with zero completions" — it can only be
   detected after the fact. `apps/api/src/infra/jobs/worker.ts` already
   runs `runAssignmentSweep` on an interval; a household-timezone-aware
   daily check (mirroring how `weekKey()` in
   `packages/shared/src/time/week.ts` resolves ISO-week boundaries per
   household timezone) is the natural place to detect and close out a
   broken streak — remembering that a `RANDOM`-only day must NOT be
   treated as idle for this purpose.

## Acceptance Criteria

- Streak state (current length, last-active day) tracked per member,
  likely alongside `pointsCache` on `HouseholdMember`
  (`schema.prisma:241-276`).
- Streak base rate configurable household-wide (default 0.5), wired
  through `packages/shared/src/config/schema.ts` like every other reward
  parameter (§16). Payment per day = `floor(rate × currentStreakLength)`.
- A calendar day (household timezone) with ≥1 completion of *any* kind
  (voluntary or random) extends the streak by one; a day with none breaks
  it to zero.
- A day's streak bonus posts only when that day has a `VOLUNTARY`
  completion, computed from the streak length as of that day (so day 1
  of any streak posts nothing, by construction — see formula above); a
  day with only `RANDOM` completions keeps the streak alive but posts no
  transaction.
- `REOFFER_MARKET` rejection breaks the streak immediately and reverses
  any streak-bonus transaction tied to the rejected assignment, symmetric
  with its existing reward clawback.
- `REASSIGN_TO_MEMBER` rejection breaks the streak (and reverses the
  streak bonus) only when the member has no other qualifying completion
  that day AND the reassigned task is not later completed successfully —
  both conditions checked, not just the immediate rejection moment.
- Every point-affecting streak event is ledger-backed (§14, §44) — no
  bare `pointsCache` writes, matching every other reward path in this
  codebase; random completions never post a transaction, preserving §44.
- Regression tests: `floor(0.5 × length)` matches expected payouts across
  a multi-day streak (0, 1, 1, 2, 2, 3, ...); a random-only day preserves
  the streak without posting anything; streak continues across a
  rejection-and-successful-redo on the same day; streak breaks and its
  bonus is clawed back on a market re-offer rejection; streak breaks
  after a full idle day (random-only days excluded from "idle").
