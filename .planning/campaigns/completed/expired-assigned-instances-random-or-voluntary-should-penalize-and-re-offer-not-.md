---
version: 1
id: "5ff79800-8a38-44fd-9e0e-e8cf92bda5fd"
status: completed
started: "2026-09-06T01:06:19.690Z"
completed_at: "2026-09-06T03:02:00.000Z"
direction: "Expired ASSIGNED instances (random or voluntary) should penalize and re-offer — not silently terminate"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Expired ASSIGNED instances (random or voluntary) should penalize and re-offer — not silently terminate

Status: completed
Started: 2026-09-06T01:06:19.690Z
Direction: Expired ASSIGNED instances (random or voluntary) should penalize and re-offer — not silently terminate

## Claimed Scope
- apps/api/src/app/assignment/runAssignmentSweep.ts, packages/shared/src/config/types.ts, packages/shared/src/config/schema.ts, packages/shared/src/config/defaults.ts, packages/shared/src/domain/enums.ts, apps/web/src/strings/de.ts

## Intake Source

- File: .planning/intake/assigned-task-expiry-penalty-reoffer.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Today, when a `TaskInstance` blows past its hard due-date deadline (`expiryDeadline`, distinct from the offer-window deadline that drives the random draw), `runAssignmentSweep.ts`'s T16–T18 block (`apps/api/src/app/assignment/runAssignmentSweep.ts:366-473`) treats every open status the same way, including `ASSIGNED`:

- the active assignment(s) are closed with `status: 'EXPIRED'` (`runAssignmentSweep.ts:408-428`)
- the instance itself moves to the **terminal** `EXPIRED` status (not re-offered — see `OPEN_STATUSES` gate at line 403, `EXPIRED` isn't in it)
- `currentValue` is unconditionally reset to `baseValue` (`VALUE_RESET`, "PRD §3F" comment at line 431-433)
- no points move on the assignee's ledger — no `PointTransaction` is posted for this path at all
- no `Notification` is created — contrast with the no-candidates case a few hundred lines later, which does notify (`ADMIN_NO_CANDIDATES`, `runAssignmentSweep.ts:729-735`, one row per admin)

This item was sharpened via `/grill` (2026-09-05), then rescoped via `/do` (same day) after the user asked specifically about lapsed voluntary assignments and confirmed they should get the identical treatment. The design below is resolved, not a menu of options — the open questions the first draft of this item raised have been decided, each with the reasoning that made it load-bearing. Anyone implementing this should follow it as-is; if evidence turns up during the build that overturns a decision here, re-run the reasoning below rather than silently doing something else (CLAUDE.md §31 — no hidden rules).

### Resolved design

1. **Scope: both `RANDOM` and `VOLUNTARY` assignments.** *(Revised — the original `/grill` pass scoped this to `RANDOM` only, reasoning that buyout, the closest analog, is exclusively a random-assignment concept. The user explicitly overrode that: a volunteer who chose the task and then let it lapse anyway is, if anything, more clearly at fault than someone who never wanted it. Confirmed in code that nothing in `runAssignmentSweep.ts`'s T16-T18 block (lines 366-473) discriminates by `assignment.kind` today — it operates purely on `TaskInstance.status === 'ASSIGNED'` and closes every active assignment via `lockActiveAssignmentsOfInstance` regardless of kind, so both kinds currently vanish identically.)* Apply the same penalize/re-offer/notify mechanic uniformly to any `ASSIGNED` instance that expires, whichever kind of assignment is on it.

   One interaction worth being deliberate about: under `voluntary.rewardTiming = ON_ACCEPT`, a volunteer is paid roughly `currentValue` (via `voluntaryReward`, `volunteerForTask.ts:321-337`) the moment they take the task — before this feature, letting it then lapse cost them nothing further and they kept the reward. Rather than adding a separate clawback call (there's a `clawback()` helper at `apps/api/src/app/points/clawback.js` used by `reopen.ts` for the release/revoke paths, but it's solving a different problem there), the flat `PENALTY = currentValue + penaltyIncrement` debit below reconciles this on its own: an `ON_ACCEPT` volunteer nets to roughly `-penaltyIncrement` overall (their earlier `+currentValue` reward minus this `-(currentValue + penaltyIncrement)` charge), while an `ON_COMPLETE` volunteer — who was never paid — nets to the full `-(currentValue + penaltyIncrement)`, identical to the `RANDOM` case. That asymmetry is intentional and needs no special-casing: it falls directly out of one flat debit applied uniformly regardless of `kind` or `rewardTiming`, not a policy decision made separately for each case.

2. **Penalty, not escalation.** When an `ASSIGNED` `TaskInstance` with an active assignment (either kind) crosses its due-date deadline:
   - Charge the assignee a `PENALTY` transaction of `currentValue + penaltyIncrement` (see config, below). `PointTransactionType.PENALTY` already exists in the enum (`packages/shared/src/domain/enums.ts:91`) and is otherwise unused — this is presumably exactly the case it was added for.
   - `currentValue` is **left unchanged** — no buyout-style escalation. The task goes back on the market at the value it already had. (A buyout's escalation makes sense because the *task* just got proven more expensive to avoid; an expiry is passive neglect, and the punishment belongs entirely on the assignee, not on the next person to see the card.)
   - The instance transitions back to `AVAILABLE` with a fresh `offerExpiresAt`, replacing today's `EXPIRED` + `VALUE_RESET` pair with something closer to `executeBuyout.ts`'s `PENALTY` (new type, mirroring `BOUGHT_OUT`) + `RE_OFFERED` history events (`executeBuyout.ts:283-319` is the structural reference — debit → reopen → history/audit → notify — minus its value-raise step).

3. **Penalty amount is configurable, minimally.** Add a new `expiry` config block (`packages/shared/src/config/types.ts`, alongside `BuyoutConfig`/`ValueIncreaseConfig`):
   ```ts
   export interface ExpiryConfig {
     enabled: boolean; // default true
     penaltyIncrement: number; // default 1 — penalty = currentValue + penaltyIncrement
   }
   ```
   Deliberately **not** a multi-strategy enum like `ValueIncreaseConfig`'s `FIXED_INCREMENT | PERCENTAGE | MULTIPLIER | CUSTOM_FORMULA` — there is exactly one formula here (`currentValue + N`), and inventing alternate pricing strategies nobody asked for would be the overengineering CLAUDE.md §43 warns against. Wire it into `HouseholdConfig`, `schema.ts` (Zod), and `defaults.ts` the same way every other config block is wired.

4. **"Preferably someone else" needs no new reassignment logic — for the `RANDOM` re-draw.** `candidates.ts:141-154`'s `randomOfThisTask` query (which feeds `cyclesSinceLastRandomAssignmentOfTask`) has **no `status` filter** — an `EXPIRED` assignment already counts toward the `preventImmediateReassignment` cooldown exactly like a `COMPLETED` one. Once the instance goes back to `AVAILABLE`, the existing cooldown (`eligibility.ts:144-164`) already de-prioritizes whoever just let it lapse if a subsequent random draw happens, with the existing relaxation ladder handling the "they're the only candidate" fallback. **Do not add a forced/bypass exclusion that ignores the household's own `preventImmediateReassignment`/`reassignmentCooldownCycles` toggle** — if a household has that cooldown off, this feature rides that choice rather than silently overriding it.

   This cooldown is scoped to `kind: 'RANDOM'` rows only (`candidates.ts:141-144`'s filter), so it says nothing about a re-offered instance sitting `AVAILABLE` waiting for a *voluntary* pickup — there is no existing mechanism, and this item does not add one, to stop the same volunteer who just let it lapse from immediately re-volunteering for it themselves. Nothing in the request asked for that, and nothing elsewhere in the app prevents re-volunteering after a release either, so this is consistent with existing behavior rather than a gap this item should close. Add test coverage confirming the `RANDOM` cooldown interaction specifically for the expiry path (it's presumably only tested today via the general random-draw path).

5. **Balance guard applies, same as buyout.** The `PENALTY` charge must respect the household's configured `allowNegativeBalance`/`minimumBalance`/`maximumDebt` — capping the debit at the floor rather than applying it in full unconditionally. Note this is **not free**: `postTransaction`/`computePosting` (`ledger-math.ts`) enforce no balance floor themselves for any transaction type — enforcement is 100% caller-side today (`assertBuyoutAllowed` gates `executeBuyout` *before* it calls `postTransaction`). The sweep's new code path needs its own equivalent guard/cap logic; it cannot assume the ledger protects it. The reasoning for capping rather than applying the full penalty unconditionally: the configured debt ceiling should be an absolute invariant across the whole app, not something that holds for member-initiated charges but not system-initiated ones.

6. **Notify the whole household, including the penalized member.** Unlike `executeBuyout.ts`'s broadcast (`executeBuyout.ts:340-353`), which deliberately excludes the acting member (`id: { not: input.memberId }`) because a buyout is self-initiated and the actor already knows, an expiry penalty happens *to* someone passively via the sweep — there's no "they were just looking at the confirmation screen" justification for leaving them out. Broadcast to every active household member, no exclusion. Needs a new `NotificationType` member (e.g. `TASK_EXPIRED_PENALTY`) — confirmed this requires **no bespoke frontend component**: `NotificationBell.tsx:29` does generic keyed-template interpolation against `de.notifications.types`, so this is one enum member + one `de.ts` string + whatever payload fields the template names (see `TASK_VALUE_INCREASED`'s entry as the template shape to copy).

## Acceptance Criteria

- An `ASSIGNED` `TaskInstance` with an active assignment of **either** `kind` (`RANDOM` or `VOLUNTARY`) that crosses its due-date deadline in `runAssignmentSweep.ts` no longer moves to terminal `EXPIRED`: it charges the assignee a `PENALTY` transaction of `currentValue + penaltyIncrement` (capped per the household's balance-guard config), leaves `currentValue` unchanged, and transitions the instance back to `AVAILABLE` with a fresh `offerExpiresAt`.
- New `expiry` config block (`enabled`, `penaltyIncrement`) added to `HouseholdConfig`/`schema.ts`/`defaults.ts`, `enabled: true` and `penaltyIncrement: 1` by default. When `expiry.enabled` is `false`, fall back to today's behavior (terminal `EXPIRED` + reset) for both kinds.
- A `Notification` (new `TASK_EXPIRED_PENALTY` type or similar) is broadcast to **every** active household member, including the penalized one, with a `de.ts` template string following the existing `types.*` interpolation pattern.
- History (`writeHistory`) and audit (`writeAudit`) entries are written for the penalty + re-offer — a new history event type for the penalty debit (mirroring `BOUGHT_OUT`'s shape) plus `RE_OFFERED`, reusing existing event types rather than inventing redundant ones.
- Test coverage:
  - Penalty amount is exactly `currentValue + penaltyIncrement`, `currentValue` itself is unchanged — for both a `RANDOM` and a `VOLUNTARY` assignment on the expiring instance.
  - Instance returns to `AVAILABLE` with a fresh offer window, not to `EXPIRED`, for both kinds.
  - `VOLUNTARY` + `rewardTiming: ON_ACCEPT`: the member received the accept-time reward earlier, then the expiry penalty fires — assert the net balance change across both transactions is `-penaltyIncrement`, not a full second `-currentValue` on top of an unclawed reward.
  - `VOLUNTARY` + `rewardTiming: ON_COMPLETE` (default): no reward was ever paid, so the penalty alone nets to `-(currentValue + penaltyIncrement)`, matching the `RANDOM` case.
  - The subsequent random draw respects `preventImmediateReassignment`/`reassignmentCooldownCycles` for the just-penalized member when the lapsed assignment was `RANDOM` (confirm the existing cooldown machinery actually engages for this path, since it's a new way of reaching `AVAILABLE` from a closed assignment). No equivalent claim for a lapsed `VOLUNTARY` assignment — there is no cooldown mechanism for re-volunteering, by design (see point 4 above).
  - Balance-guard case: a member already at/near `minimumBalance`/`maximumDebt` has the penalty capped, not applied in full.
  - `expiry.enabled: false` reproduces today's exact terminal-`EXPIRED` behavior, for both kinds.
  - Notification is created for every active member including the penalized one, for both kinds.

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
| phase:2 | implementation-diff | file_diff | yes | `git diff --stat` — expiry sweep, config, enum/migration, ledger, history/notification rendering, and focused tests changed | passed | 2 | none |
| phase:3 | verification-command | test_result | yes | Direct workspace verification: shared 149/149, API 420/420, web 177/177; `npm run typecheck`; `npm run lint`; `npx prisma validate` with repo DATABASE_URL; elevated `npx vite build` (dist/sw.js generated). Root npm wrappers hit sandbox parent-directory traversal before test/build collection. | passed | 2 | package delivery |
| phase:4 | review-package | review_package | yes | .planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-06T01:06:19.690Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-06: Phase 2 implemented and phase 3 independently verified. Expiry penalties apply once per TaskInstance hard deadline, using an append-only history marker to preserve the original dueAt while preventing repeated stale-deadline charges. Scope expanded minimally to Prisma migration, ledger sign enforcement, history typing, and rendering tests because the acceptance criteria required persisted enum/runtime safety.

## Active Context

All four phases complete. Delivery package is ready for local review.

## Continuation State

Phase: 4
Sub-step: complete
Files modified: apps/api/src/app/assignment/runAssignmentSweep.ts; packages/shared/src/config/{types,schema,defaults}.ts; packages/shared/src/domain/enums.ts; packages/shared/src/api/history.ts; apps/api/prisma/schema.prisma + migration; apps/api/src/domain/points/ledger-math.ts; apps/api/test/integration/assignment-expiry-penalty.test.ts; rendering/config/ledger tests; German strings.
Blocking: none

Delivery package: `.planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md`

<!-- session-end: 2026-09-06T01:39:56.470Z -->

<!-- session-end: 2026-09-06T02:55:02.483Z -->
