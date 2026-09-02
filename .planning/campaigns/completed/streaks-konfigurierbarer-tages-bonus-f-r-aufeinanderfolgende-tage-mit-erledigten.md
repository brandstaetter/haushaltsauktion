---
version: 1
id: "ed3e85c8-e3e8-4439-a2db-c3a583064ee0"
status: completed
started: "2026-09-02T18:38:44.415Z"
completed_at: "2026-09-02T19:13:00.000Z"
direction: "Streaks: konfigurierbarer Tages-Bonus für aufeinanderfolgende Tage mit erledigten Aufgaben"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Streaks: konfigurierbarer Tages-Bonus für aufeinanderfolgende Tage mit erledigten Aufgaben

Status: completed
Started: 2026-09-02T18:38:44.415Z
Direction: Streaks: konfigurierbarer Tages-Bonus für aufeinanderfolgende Tage mit erledigten Aufgaben

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/src/domain/task/value.ts, apps/api/src/app/tasks/completeTask.ts, apps/api/src/app/tasks/rejectCompletion.ts, apps/api/src/infra/jobs/worker.ts, packages/shared/src/config/schema.ts

## Intake Source

- File: .planning/intake/daily-completion-streak-bonus.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |   complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 26 files changed, 1467 insertions(+), 44 deletions(-) across apps/api, apps/web, packages/shared, and this campaign file — see Decision Log for the full file list | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test: shared 138/138, api 269/269, web 110/110 — all pass, independently re-run outside the build agent's session and matching its reported counts exactly. | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T18:38:44.415Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-02T21:10:00Z: Phase 2 implemented and verified locally (`npm run
  typecheck`, `npm run lint`, `npm run test` all clean across every
  workspace: shared 138/138, api 269/269 incl. 20 new streak tests, web
  110/110). Key implementation choices:

  - **Day representation**: streak state is stored as household-local civil
    days in `"YYYY-MM-DD"` string form (`HouseholdMember.streakLastActiveDate`
    / `.streakBonusPaidDate`), not as `DateTime` columns re-interpreted
    through a timezone at read time. New helpers `civilDateKey`, `dayKey`,
    `parseCivilDateKey`, `civilDaysBetween` were added to
    `packages/shared/src/time/week.ts` alongside the existing `weekKey()`
    pattern this mirrors. Rationale: a `DateTime` column would require
    re-resolving "which civil day was this" against the household's *current*
    timezone every time it's read, which silently reinterprets history if the
    timezone is ever changed administratively; a stored civil-day string is
    unambiguous and directly comparable/sortable.
  - **Domain module**: `apps/api/src/domain/streak/streak.ts` is a single
    pure reducer, `applyCompletionToStreak(cfg, state, {kind, today})`,
    mirroring `domain/task/value.ts`'s shape (no Prisma, no `Date`, no
    `Math.random`). It tracks three fields per member: `length`,
    `lastActiveDate` (extends on any completion kind), and `bonusPaidDate`
    (a separate marker so a day that starts with a RANDOM completion and
    later gets a VOLUNTARY one can still pay exactly once — this was not
    spelled out in the brief's formula section but follows directly from
    "paid once per day, not per task" combined with "day 1 pays 0"; see the
    "at most one payment per household-local day" tests in
    `apps/api/test/domain/streak.test.ts` for the two orderings this covers).
  - **Migration split**: Postgres refuses to reference a new enum value
    inside a CHECK constraint in the same transaction that adds it ("unsafe
    use of new value ... New enum values must be committed before they can be
    used"). The generated migration was split into
    `20260902184836_add_streak_bonus` (enum values + `HouseholdMember`
    columns) and `20260902184900_add_streak_bonus_constraints` (the mirrored
    `pt_streak_bonus_*` CHECKs and the `pt_one_streak_bonus_per_assignment`
    partial unique index, symmetric with the existing
    `pt_reward_*`/`pt_one_reward_per_assignment` constraints from
    `20260830000100_constraints`).
  - **Clawback restructuring**: `clawback()` (`apps/api/src/app/points/
    clawback.ts`) changed its return shape from `ClawbackResult | null` to
    `{ reward, streak }` so it can reverse both an ordinary reward and a
    streak bonus tied to the same assignment through one idempotent helper.
    This is a breaking change to its two existing callers
    (`rejectCompletion.ts`, `reopen.ts`'s release/revoke path) — both were
    updated (`reversed.reward` / `reversed.streak`); `reopen.ts`'s path can
    never actually produce a non-null `streak` (a `STREAK_BONUS` only ever
    posts from `completeTask`, never at acceptance), so that arm is
    write-only defensiveness, not exercised behavior.
  - **REASSIGN_TO_MEMBER deliberately touches no streak state at rejection
    time**, in either direction (not even to eagerly break it when no other
    completion covers the day). Reasoning worked through in
    `rejectCompletion.ts`'s docstring: the brief's condition ("breaks only if
    no other qualifying completion AND the redo is never completed") mixes a
    present-tense fact with a future one that cannot be known yet at
    rejection time. Leaving state untouched and only clearing the specific
    day's `bonusPaidDate` marker is sufficient for *both* branches: a
    same-day (or later) successful redo simply continues the streak through
    the ordinary `completeTask` path with nothing to undo, and a redo that
    never happens is caught later by the idle sweep once the day goes stale
    — so no separate "pending reassignment" bookkeeping was needed. This is
    an interpretation, not a literal transcription of the brief's wording,
    and is the one item most worth a reviewer double-checking against the
    original intent.
  - **REOFFER_MARKET breaks unconditionally**, even if the member had another
    standing completion the same day — read literally from the brief's
    "ends immediately" (vs. REASSIGN_TO_MEMBER's explicitly conditional
    wording), not re-derived independently.
  - **Idle sweep** (`apps/api/src/app/streak/runStreakSweep.ts`) is
    deliberately simpler than `runAssignmentSweep.ts`: no level-0 advisory
    lock, since there is no cross-row aggregate to protect — an unlocked scan
    for candidates followed by a per-member row lock (`lockMember`) and a
    re-check under that lock is enough. Wired into the existing interval in
    `apps/api/src/infra/jobs/worker.ts` right after `runAssignmentSweep`, one
    try/catch per household so one household's failure can't freeze another's
    sweep (matching the existing pattern there).
  - **Scope decisions**: `CompletionResultDto` was deliberately left
    unchanged — the streak bonus is fully visible through the ledger,
    `GET /api/members/me/points`, and the new `STREAK_BONUS_AWARDED` history
    event, but `POST /tasks/:id/complete`'s own response still reports only
    the ordinary reward in `pointsAwarded`. Extending that DTO (and any
    frontend surface for it) was out of the claimed scope for this phase and
    is a natural follow-up. No admin HTTP endpoint was added to trigger the
    idle sweep manually (unlike `POST /admin/assignments/run` for the
    assignment sweep) — the interval worker is the only trigger; add one if
    manual/on-demand testing in production turns out to be needed.

  Full file list (26 changed, +1467/-44): `apps/api/prisma/schema.prisma`;
  new migrations `20260902184836_add_streak_bonus/migration.sql` and
  `20260902184900_add_streak_bonus_constraints/migration.sql`;
  `apps/api/src/domain/streak/streak.ts` (new);
  `apps/api/src/app/streak/runStreakSweep.ts` (new);
  `apps/api/src/app/tasks/completeTask.ts`;
  `apps/api/src/app/tasks/rejectCompletion.ts`;
  `apps/api/src/app/points/clawback.ts`; `apps/api/src/app/assignment/
  reopen.ts`; `apps/api/src/app/tx.ts` (lockMember/lockAssignment gained
  streak fields / completedAt); `apps/api/src/domain/points/ledger-math.ts`
  (STREAK_BONUS sign rule + integrity checks);
  `apps/api/src/infra/http/routes/admin.ts` (pass `timezone` to
  `rejectCompletion`); `apps/api/src/infra/jobs/worker.ts`;
  `apps/api/test/domain/streak.test.ts` (new, 16 tests);
  `apps/api/test/integration/streak.test.ts` (new, 4 tests, real Postgres);
  `packages/shared/src/domain/enums.ts` (`STREAK_BONUS`,
  `STREAK_BONUS_AWARDED`); `packages/shared/src/config/{types,defaults,
  schema,index}.ts` (new `streak` config section); `packages/shared/src/
  time/week.ts` (+`civilDateKey`/`dayKey`/`parseCivilDateKey`/
  `civilDaysBetween`) and `packages/shared/src/index.ts`;
  `packages/shared/test/{config,week}.test.ts`; `apps/web/src/strings/de.ts`
  (`STREAK_BONUS` label — the enum grew, this was a compile error otherwise).
  Reason: record the evidence and the reasoning behind every non-obvious
  choice so phase 3 (verify) and a reviewer don't have to re-derive it.

- 2026-09-02T21:12:00Z: Phase 2 handoff independently validated (phase-validator,
  verdict pass). Confirmed key source files present and matching the HANDOFF's
  claims (`streak.ts`, `runStreakSweep.ts`, `completeTask.ts`,
  `rejectCompletion.ts`, `clawback.ts`). Flagged one warning worth a human
  reviewer's attention: the REASSIGN_TO_MEMBER deviation (streak state
  untouched at rejection time, deferred to the idle sweep) is a defensible
  but non-literal reading of the brief's "both conditions" wording — tests
  cover it correctly, but the architectural choice itself should be
  double-checked against original intent before/at PR review.
  Reason: no non-manual phase-2 exit condition failed, so the phase advances;
  the interpretive judgment call is surfaced for human review rather than
  re-litigated here.

- 2026-09-02T21:15:00Z: Phase 3 (verify) run independently, outside the build
  agent's own session: `npm run typecheck` clean, `npm run lint` clean,
  `npm run test` — shared 138/138, api 269/269 (incl. 20 new streak tests),
  web 110/110 — all pass, exactly matching the build agent's self-reported
  counts. `git diff --stat` on tracked files (19 files, +440/-44) plus 6 new
  untracked paths (2 migrations, 2 src dirs, 2 test files) is consistent with
  the claimed 26-file/+1467/-44 total once new-file content is counted.
  Reason: independent re-verification per Archon protocol step 5, rather than
  trusting the build agent's self-report alone.

## Active Context

All four phases complete. Local review package generated and readiness
confirmed `ready` after correcting the Exit Evidence Status column (see
Decision Log). Implementation is fully verified locally but **not yet
committed or pushed** — that decision belongs to the user, not this
campaign, per this session's operating rules around Red-reversibility
actions (git push, PR creation).

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: see Decision Log's full file list (phase 2, build)
Blocking: none

## Completion Record

- Completed At: 2026-09-02T19:13:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting explicit user go-ahead)
- Review package: .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
- Verification: npm run typecheck, npm run lint, npm run test --workspaces
  all pass (shared 138/138, api 269/269, web 110/110), independently
  re-run outside the build agent's session
- Open item for reviewer: the REASSIGN_TO_MEMBER streak-state handling
  (deferred entirely to the idle sweep rather than decided at rejection
  time) is an interpretation of the brief, not a literal transcription —
  flagged twice (build agent + independent phase validator) as worth
  confirming against original intent.
