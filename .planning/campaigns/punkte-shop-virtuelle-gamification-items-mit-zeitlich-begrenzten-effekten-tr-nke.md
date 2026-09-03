---
version: 1
id: "d84bf251-1721-4e41-8981-4c00544b9a25"
status: active
started: "2026-09-03T05:49:21.409Z"
completed_at: null
direction: "Punkte-Shop: virtuelle Gamification-Items mit zeitlich begrenzten Effekten (Tränke)"
phase_count: 4
current_phase: 4
branch: feat/points-shop-virtual-effects
worktree_status: null
---

# Campaign: Punkte-Shop: virtuelle Gamification-Items mit zeitlich begrenzten Effekten (Tränke)

Status: active
Started: 2026-09-03T05:49:21.409Z
Direction: Punkte-Shop: virtuelle Gamification-Items mit zeitlich begrenzten Effekten (Tränke)

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/src/app/rewards/, apps/api/src/app/assignment/candidates.ts, apps/api/src/domain/assignment/eligibility.ts, apps/api/src/app/tasks/completeTask.ts, apps/api/src/domain/points/ledger-math.ts, packages/shared/src/config/schema.ts

## Intake Source

- File: .planning/intake/points-shop-virtual-gamification-items.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

**Depends on** `.planning/intake/points-shop-real-life-rewards.md` — this
item extends that points shop (same purchase-and-ledger-debit mechanism,
same admin catalog) with a second
category of item: **virtual gamification items** whose "fulfillment" is not
an admin action but an automatic, time-boxed gameplay effect applied to the
buyer. Two concrete examples given:

- **Aufgaben-Immunitätstrank**: for 24h after purchase, the member is
  excluded from random assignment (never receives an `ASSIGNED` task by
  draw during that window). Voluntary participation is unaffected.
- **Belohnungs-Multiplikatortrank**: the next 3 voluntary task completions
  within 5 hours of purchase earn 1.5× their normal reward.

**Where this hooks into the existing engine, concretely:**

- Random-assignment eligibility is already a checklist of predicates
  computed per member in `loadCandidates()`
  (`apps/api/src/app/assignment/candidates.ts:124-164` — `isAbsent`,
  `excludedFromTask`, `categoryExcluded`, etc.), consumed by the domain
  eligibility rules referenced there as "the seven predicates of §6.9"
  (`apps/api/src/domain/assignment/eligibility.ts`). Immunity is naturally
  an eighth predicate (e.g. `hasActiveImmunity`), sourced the same way
  `isAbsent` is sourced from `memberAbsence` — a new table of active,
  expiring per-member effects.
- Voluntary reward amount is computed by `voluntaryReward()`
  (`apps/api/src/domain/points/ledger-math.ts`, called from
  `completeTask.ts:109-113`) against a config **pinned at assignment time**
  (§5.5 — `configFor(..., ConfigDecision.VOLUNTARY_REWARD, ...)`,
  `completeTask.ts:101-106`). A per-member, time-and-count-limited
  multiplier is a different kind of thing than the household-wide
  `voluntary.rewardMultiplier` config value it currently reads — it needs
  its own resolution step (consult + decrement the member's active
  multiplier effect) layered on top of, not merged into, the pinned
  household config. Needs a design decision: does buying the potion
  consume a multiplier "charge" atomically with each qualifying
  completion (race-safe under the same concurrency rules as
  `postTransaction.ts`), and what happens to unused charges/time if the
  member disconnects or the household resets?

Both examples share one substrate: **a generic "active member effect"
entity** — item kind, target member, params (e.g. multiplier value,
remaining charges), `expiresAt`, `consumedAt`. Design that substrate once;
don't hand-roll two ad hoc mechanisms for what is the same shape of state.

## Acceptance Criteria

- Reward-catalog entries can be of kind `VIRTUAL_EFFECT` (vs. the
  real-life `MANUAL_FULFILLMENT` kind from the parent intake item), each
  naming an effect type and its parameters (duration, charge count,
  multiplier value) — configurable per item, not hardcoded to exactly
  these two potions, so a third potion later doesn't require new code
  paths, only new config.
- Buying a virtual item debits points through the existing ledger (same
  invariant as the parent item: no bare balance writes) and creates an
  active effect row for that member; no admin fulfillment step — the
  effect just becomes active immediately.
- Immunity effect: `loadCandidates()` gains an eighth eligibility
  predicate sourced from active, unexpired immunity effects; a member
  under immunity is never selected by `runAssignmentSweep`, but can still
  volunteer.
- Multiplier effect: an active, unexpired, non-exhausted multiplier effect
  on the completing member increases the awarded amount by its factor for
  up to its configured charge count, decrementing exactly once per
  qualifying voluntary completion — race-safe (two completions racing to
  consume the last charge must not both succeed).
- Both effect types show their remaining time/charges somewhere the
  member can see before acting (§31 — state consequences up front), e.g.
  on the dashboard or account page.
- Regression tests: immunity excludes a member from a random-assignment
  sweep during its window and stops excluding them after expiry; a
  multiplier is applied to exactly 3 completions and not a 4th, and stops
  applying after 5 hours even if charges remain.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 25 files changed, 936 insertions(+), 82 deletions(-) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run typecheck (root+web+e2e) clean; npm run test -w apps/api: 305/305 passed (31 files) | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/punkte-shop-virtuelle-gamification-items-mit-zeitlich-begrenzten-effekten-tr-nke.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-03T05:49:21.409Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-03: Blocked before implementation.
  Reason: Hard dependency on `.planning/intake/points-shop-real-life-rewards.md`
  (still `pending`) is unbuilt — `apps/api/src/app/rewards/` does not exist,
  there is no reward catalog, no `RewardDefinition`/purchase flow, and no
  `PointTransactionType` for shop redemptions. This item extends that base
  shop (same catalog table shape, same purchase-debit mechanism) rather than
  standing alone. Building it now would mean inventing the base shop ad hoc
  and likely conflicting with the real dependency's design once built.
  Switching autopilot to build points-shop-real-life-rewards first, then
  resuming this campaign.
- 2026-09-03: Phase 2 (build) delegated to a sub-agent with fixed design
  decisions handed down rather than left to the delegate: `MemberEffect` as
  one generic substrate (not two ad hoc tables); rule 8 (immunity) kept out
  of `hardEligibilityReason`/`CONSTRAINT_OF` so it gates the random draw
  without blocking volunteering and is never relaxed by the ladder; the
  multiplier consumed via compare-and-set inside `completeTask.ts`'s
  existing level-3 member lock, no new lock level. Reviewed the resulting
  diff personally (eligibility.ts, candidates.ts, completeTask.ts,
  purchaseReward.ts, schema/migrations, admin.ts validation, the race
  test), independently re-ran `npm run typecheck` and
  `npm run test -w apps/api` (305/305 pass), and dispatched a
  citadel:phase-validator for an independent check — verdict `pass`, 6/6
  conditions met, one warning (dashboard DTO extension not spot-checked by
  the validator) which I closed by reading `reads.ts` directly. Exit
  evidence for phase:2 and phase:3 both validate `PASS`.

## Active Context

Unblocked: `points-shop-real-life-rewards` is now `completed` (campaign
`punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e`).
Before resuming Phase 2, read what actually got built — `apps/api/src/app/rewards/`
(`purchaseReward.ts`, `fulfillRedemption.ts`), `apps/api/src/domain/rewards/rules.ts`,
`RewardDefinition`/`RewardRedemption` in `schema.prisma`, and
`apps/web/src/pages/RewardsShopPage/` — since this item's `VIRTUAL_EFFECT`
catalog kind and purchase flow must extend that shape (same catalog table,
same purchase-debit mechanism) rather than reinvent it. Note in particular
that `RewardDefinition` currently has no `kind` discriminator column at all —
adding `VIRTUAL_EFFECT` alongside the implicit `MANUAL_FULFILLMENT` kind is
itself a schema change this phase must make.

## Continuation State

Phase: 4
Sub-step: build (2) and verify (3) complete and validated; packaging for review
Files modified: 25 files changed, 936 insertions(+), 82 deletions(-), plus 2
new migrations and 3 new test/domain files (see phase:2 exit evidence)
Blocking: none
