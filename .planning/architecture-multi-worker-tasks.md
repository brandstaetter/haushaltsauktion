# Architecture: Multi-Worker Tasks
> PRD: .planning/prd-multi-worker-tasks.md  |  Date: 2026-09-03

## Grounding

The current model hard-codes "exactly one worker" at three layers simultaneously:
`TaskAssignment.activeForInstanceId` is a nullable self-referential sentinel
(`= taskInstanceId` while `ACTIVE`, else `NULL`) with a global `@unique`, so a second
concurrent `ACTIVE` assignment on the same instance is a `23505` constraint violation
by construction. `volunteerForTask`/`executeBuyout`/`completeTask`/the sweep's random
draw all perform a `taskInstance.status` compare-and-set between exactly `AVAILABLE`
and `ASSIGNED` — the transition IS the "slot filled" / "slot vacated" signal, because
there has only ever been one slot. All four use-cases share one lock order
(`lockInstance` → `lockAssignment` → `lockMember`, level 1→2→3, statically enforced by
`eslint-rules/lock-order.js`), which is the entire deadlock argument.

Everything below **generalizes** these three mechanisms from "1 slot" to "N slots" —
it does not introduce a parallel code path. `EXACTLY(1)`, the default for every
existing `TaskDefinition`, degenerates back to today's exact behavior, verified by
full regression.

## File Tree

```
apps/api/prisma/
  schema.prisma                              ~ new columns + constraint (see Data Model)
  migrations/{ts}_multi_worker_tasks/         + additive migration

packages/shared/src/domain/
  enums.ts                                    ~ + WorkerCountMode
packages/shared/src/api/
  tasks.ts                                    ~ DTOs/request schemas carry worker-count + slot list
packages/shared/src/config/
  schema.ts, defaults.ts                      ~ (only if Open Question on fairness weighting is resolved into config — see Risk Register)

apps/api/src/domain/task/
  worker-slots.ts                             + pure: minRequired/maxAllowed/slot-threshold logic
apps/api/src/domain/task/
  state-machine.ts                            unchanged — no new states, no TRANSITIONS edits

apps/api/src/app/
  tx.ts                                       ~ + lockActiveAssignmentsOfInstance (plural), slot-count helpers
  assignment/candidates.ts                    ~ excludes members already holding a slot on this instance
  assignment/runAssignmentSweep.ts             ~ fills up to minRequired slots per ripe instance, one transaction
  tasks/volunteerForTask.ts                    ~ per-slot claim instead of per-instance claim
  tasks/completeTask.ts                        ~ per-slot completion; instance-level effects gated on last slot
  buyout/executeBuyout.ts                      ~ per-slot buyout; instance stays ASSIGNED if still adequately staffed
  buyout/quote.ts                              unchanged (quote math is per-assignment already)
  queries/taskDto.ts, queries/reads.ts          ~ expose slot list (all active assignments, not one)
  config/validateConfig.ts                     ~ validate workerCount ranges at TaskDefinition create/update

apps/api/src/infra/http/routes/
  tasks.ts                                     ~ task-definition create/update accepts workerCountMode/workerCount
  admin.ts                                     ~ same, admin-authored path

apps/api/test/domain/
  worker-slots.test.ts                         + pure-function coverage
apps/api/test/integration/
  multi-worker-concurrency.test.ts             + real-lock race test, mirrors concurrency.test.ts
  multi-worker-lifecycle.test.ts               + volunteer/random-fill/buyout/complete across 2-3 slots

apps/web/src/components/TaskMaintenanceCard/
  TaskMaintenanceCard.tsx                       ~ worker-count mode + count fields on create/edit
apps/web/src/components/TaskCard/
  TaskCard.tsx                                  ~ shows "N/M besetzt" when workerCount > 1
apps/web/src/pages/TaskDetailPage/
  TaskDetailPage.tsx                            ~ lists every active slot's assignee; per-slot buyout button
```

## Component Breakdown

### Feature: Worker-count configuration
- Files: `schema.prisma`, `enums.ts`, `config/validateConfig.ts`, `routes/tasks.ts`/`admin.ts`, `TaskMaintenanceCard.tsx`
- Dependencies: none (leaf feature)
- Complexity: low

### Feature: Slot-aware state transitions
- Files: `domain/task/worker-slots.ts`, `app/tx.ts` (slot-count helpers)
- Dependencies: Worker-count configuration (needs the mode/count fields to exist)
- Complexity: medium — the core conceptual piece, but small in code (one new pure file)

### Feature: Slot-aware use cases (volunteer, buyout, complete, sweep)
- Files: `volunteerForTask.ts`, `executeBuyout.ts`, `completeTask.ts`, `runAssignmentSweep.ts`, `candidates.ts`
- Dependencies: Slot-aware state transitions
- Complexity: high — four use-cases each get a precise, individually-reasoned change; this is where correctness risk concentrates

### Feature: API surface + DTOs
- Files: `taskDto.ts`, `reads.ts`, `api/tasks.ts`, `routes/tasks.ts`
- Dependencies: Slot-aware use cases
- Complexity: low — plumbing, shape already exists for a single assignment; becomes a list

### Feature: Frontend
- Files: `TaskCard.tsx`, `TaskDetailPage.tsx`, `TaskMaintenanceCard.tsx`
- Dependencies: API surface
- Complexity: medium — mostly rendering a list instead of one row, plus the admin form fields

## Data Model

### TaskDefinition (extended)
- New fields: `workerCountMode: WorkerCountMode` (`AT_LEAST | AT_MOST | EXACTLY`, default `EXACTLY`), `workerCount: Int` (default `1`)
- Existing `EXACTLY(1)` default reproduces today's schema exactly for every pre-existing row (migration backfill).

### TaskInstance (extended)
- New fields, **copied from the definition at materialization** — same rationale as the existing `baseValue` copy ("an admin edit to the definition doesn't move the target of an already-running instance", also closes PRD's "resizing mid-flight" as explicitly out of scope):
  - `workerCountMode: WorkerCountMode`
  - `workerCount: Int`
  - `activeSlotCount: Int` (default `0`) — denormalized count of currently-`ACTIVE` `TaskAssignment` rows for this instance, mutated only inside the same level-1-locked transaction that creates/closes an assignment row (mirrors the existing `pointsCache` mirrors-the-ledger pattern, `household_members.points_cache`). Because every write to this column happens under the lock that also writes the assignment row it counts, drift is structurally prevented rather than needing a separate reconciliation job (unlike the ledger cache, which is deliberately allowed to be read outside a lock and therefore needs `verifyLedgerIntegrity`).

### TaskAssignment (extended)
- New field: `slotIndex: Int` (backfill `0` for all existing rows — they were always single-slot).
- **Replaces** `activeForInstanceId: String? @unique` with `activeSlotKey: String? @unique`, computed as `` `${taskInstanceId}:${slotIndex}` `` while `status = ACTIVE`, else `NULL`. Direct generalization of the existing sentinel pattern: for `EXACTLY(1)` tasks `slotIndex` is always `0`, so `activeSlotKey` degenerates to exactly today's `activeForInstanceId` value, and the same 23505-as-concurrency-guard mechanism applies unchanged.
- Everything else on `TaskAssignment` (kind, status, response, `valueAtAssignment`, buyout fields) is unchanged and continues to apply per-slot — each slot is still fully its own row, so `PointTransaction`'s composite-FK-to-`assignment.kind` guarantee (§44: no reward on a `RANDOM` completion) needs zero changes.

## Key Decisions

### Worker-count semantics: unify `AT_LEAST`/`AT_MOST`/`EXACTLY` into a (min, max) pair internally
- **Chosen**: `minRequired(mode, n)` / `maxAllowed(mode, n)`:
  - `EXACTLY(n)` → min = n, max = n
  - `AT_LEAST(n)` → min = n, max = ∞ (recruiting never closes on its own — this is what makes it meaningfully different from `EXACTLY`)
  - `AT_MOST(n)` → min = 1, max = n (mirrors today's single-worker guarantee that a task always eventually gets *someone*; the sweep never lets an `AT_MOST` task go permanently unstaffed)
  - `TaskInstance.status` flips `AVAILABLE → ASSIGNED` the moment `activeSlotCount` reaches `min` (not `max`) — additional volunteers/random fills below `min` are ordinary writes that leave `status` at `AVAILABLE`; additional volunteers above `min` (only possible under `AT_LEAST`, or under `AT_MOST` while `activeSlotCount < max`) are ordinary writes that leave `status` at `ASSIGNED`. `AVAILABLE` means "still recruiting toward the floor"; it is *not* the same concept as "can accept more volunteers", which is `activeSlotCount < max` and is checked independently of `status`.
- **Rejected**: a literal three-mode branch with distinct logic per mode throughout the use-cases — every one of the four call sites would need a three-way switch instead of two number comparisons (`< min`, `< max`), tripling the surface area for the same behavior and making the exhaustive backward-compatibility argument (EXACTLY(1) ≡ today) harder to see by inspection.
- **Resolves PRD Open Questions** "does AT_MOST guarantee staffing" (yes, floor of 1, via the same sweep guarantee) and "does AT_LEAST keep recruiting" (yes, unbounded) — these were left open in the PRD; this doc makes the concrete call so a build can proceed. Flag to the user before Archon executes this phase.

### New pure module `domain/task/worker-slots.ts`, not an extension of `state-machine.ts`
- **Chosen**: a new, small, single-purpose pure file (matching the existing house style of `value.ts`, `eligibility.ts`, `weights.ts`, `streak.ts`, `multiplier.ts`, `cost.ts` — each one concern, each pure) that exports `minRequired`, `maxAllowed`, and a `slotOutcome({ event, activeSlotCount, min, max })` helper deciding whether an event actually crosses the `min`/`max` threshold. The app-layer use-cases call this *and then, only when it says the threshold is crossed*, call the existing, completely unmodified `resolve()`/`TaskEvent` from `state-machine.ts`.
- **Rejected**: encoding count-thresholds into `state-machine.ts`'s `TRANSITIONS` table directly. That table is deliberately a pure `(from, event) → to` lookup with an exhaustively tested 91-pair matrix (`illegalPairs()`); the file's own docstring states "nothing else in the codebase is allowed to decide whether a transition is legal." Threading a numeric threshold through that lookup would break its purity claim and put the 91-pair exhaustiveness test at risk of drifting from the matrix in CLAUDE.md §4. Keeping `state-machine.ts` at zero diff is the single biggest regression-risk reducer available in this feature.

### Slot uniqueness: generalize the existing sentinel, don't add a parallel locking primitive
- **Chosen**: `activeSlotKey = "${instanceId}:${slotIndex}" | NULL`, `@unique`. `slotIndex` for a new assignment is chosen as the lowest index in `[0, workerCount)` not already held by an `ACTIVE` assignment, computed *after* the level-1 `lockInstance` row lock is held (so the read is race-free without needing a second query later) — guard 1 (row lock) still does the real work; the unique constraint is defense-in-depth exactly as it is today ("even if guards 1 and 2 were both gone").
- **Rejected**: a Postgres partial unique index (`UNIQUE(taskInstanceId, slotIndex) WHERE status = 'ACTIVE'`), the technique already used elsewhere in this schema for `IntegrationOutbox.enqueueKey`. Rejected specifically *for this table* — not because the technique is bad, but because `TaskAssignment` already has a proven, audited nullable-sentinel pattern, and reusing it here keeps every lock/constraint on the hottest, most safety-critical table in the schema in one style. Mixing both styles on `TaskAssignment` would cost more in reviewability than the (nonexistent, in the 1–20-member target size) performance difference is worth.

### Per-slot completion vs. instance-level completion: no new `HistoryEventType`
- **Chosen**: the existing `COMPLETED` history event (already carries `assignmentId` + `memberId`, i.e. already a per-slot signal in shape) fires once per slot exactly as today. Its payload gains one field, `slotsRemainingAfter: number`. The instance-level effects that today happen unconditionally in `completeTask` — `TaskInstance.status → COMPLETED`, `VALUE_RESET`, recurrence's `nextDueAt` advance, the household-wide `TASK_COMPLETED` notification — are now gated on `slotsRemainingAfter === 0`. A slot completing with `slotsRemainingAfter > 0` still pays that member's reward (full value, per the PRD decision) and closes their `TaskAssignment`, but leaves the instance `ASSIGNED` and every other active slot untouched.
- **Rejected**: a new `HistoryEventType` (e.g. `ALL_SLOTS_COMPLETED`) for the instance-level moment. Rejected because it would require a member-facing history renderer to understand two related-but-different event types for what is, from the household's perspective, one fact ("task done") with one extra number attached; a payload field is strictly less surface area for the same information.

### Fairness cap counts a slot the same as a whole task (deferred, not solved)
- **Chosen for v1**: `maxRandomAssignmentsPerWeek` and the weighted-fairness metrics (`randomAssignments`, `voluntaryCompletions`, etc. in `candidates.ts`) count one random-assigned **slot** exactly like one random-assigned single-worker task — no new weighting. This is the PRD's third Open Question, resolved here as "ship the simple interpretation, revisit only if a household actually reports it feeling unfair in practice" — CLAUDE.md §43 explicitly prioritizes correctness and simplicity over premature configurability at 1–20-member scale.
- **Rejected**: a `fairness.multiWorkerSlotWeight` config knob from day one. Rejected as speculative configurability for a distinction (5-person shared task vs. 1-person task) that doesn't yet have a household reporting it matters; CLAUDE.md explicitly warns against overengineering ahead of a real need.

## Build Phases

### Phase 0: Baseline
- **Goal**: Record the current verification state so every later phase's "no regression" end condition has a concrete baseline to diff against.
- **Files**: none (read-only)
- **Dependencies**: none
- **End Conditions**:
  - [ ] `npm run typecheck` passes on `main` (0 errors) — recorded
  - [ ] `npm run test` passes on `main` (431/431 per the last full run) — recorded
  - [ ] `npm run lint` passes on `main` (0 errors) — recorded

### Phase 1: Schema + domain core
- **Goal**: Land the additive migration and the pure `worker-slots.ts` module, fully unit-tested, with zero behavior change yet wired into any use-case.
- **Files**: `schema.prisma`, new migration, `packages/shared/src/domain/enums.ts` (+`WorkerCountMode`), `domain/task/worker-slots.ts`, `test/domain/worker-slots.test.ts`
- **Dependencies**: Phase 0
- **End Conditions**:
  - [ ] Migration applies cleanly to a copy of the current schema; existing rows backfill to `EXACTLY(1)` / `slotIndex=0` / `activeSlotKey` mirroring today's `activeForInstanceId` values
  - [ ] `worker-slots.ts` has 100% branch coverage on `minRequired`/`maxAllowed`/`slotOutcome` for all three modes, including the `AT_LEAST` unbounded-max case and the `AT_MOST` floor-of-1 case
  - [ ] No existing file outside this phase's list is modified
  - [ ] Existing tests pass with 0 new failures; typecheck passes with 0 new errors

### Phase 2: Slot-aware use cases
- **Goal**: `volunteerForTask`, `executeBuyout`, `completeTask`, `runAssignmentSweep`, `candidates.ts` operate per-slot; `EXACTLY(1)` tasks behave identically to today.
- **Files**: `app/tasks/volunteerForTask.ts`, `app/buyout/executeBuyout.ts`, `app/tasks/completeTask.ts`, `app/assignment/runAssignmentSweep.ts`, `app/assignment/candidates.ts`, `app/tx.ts` (plural lock helper), `test/integration/multi-worker-concurrency.test.ts`, `test/integration/multi-worker-lifecycle.test.ts`
- **Dependencies**: Phase 1
- **End Conditions**:
  - [ ] Two members can volunteer for distinct slots on the same instance without racing each other out
  - [ ] Concurrent volunteer attempts for what would become the *same* slot are proven safe by a real-lock test (`pg_blocking_pids`, mirroring `concurrency.test.ts`)
  - [ ] The sweep fills every open slot up to `minRequired` for an under-staffed ripe instance in one pass, excluding members who already hold a slot on that instance
  - [ ] A per-slot buyout releases only that slot, bumps `currentValue`, reopens exactly that slot, and leaves co-assignees' active assignments and the instance's `ASSIGNED` status untouched when `activeSlotCount - 1 >= minRequired`
  - [ ] A per-slot completion pays full value to a `VOLUNTARY` slot-holder and 0 to a `RANDOM` one, and the instance only reaches `COMPLETED` (with value reset + recurrence advance) when the last active slot completes
  - [ ] `EXACTLY(1)` tasks: full existing test suite (`domain/economy.test.ts`, `integration/concurrency.test.ts`, `integration/happy-path.test.ts`, etc.) passes unmodified
  - [ ] Existing tests pass with 0 new failures; typecheck passes with 0 new errors

### Phase 3: API surface
- **Goal**: Task-definition create/update accepts worker-count fields; task DTOs expose the full slot list instead of a single assignment.
- **Files**: `app/queries/taskDto.ts`, `app/queries/reads.ts`, `app/config/validateConfig.ts`, `infra/http/routes/tasks.ts`, `infra/http/routes/admin.ts`, `packages/shared/src/api/tasks.ts`
- **Dependencies**: Phase 2
- **End Conditions**:
  - [ ] `POST/PUT /api/admin/tasks` accepts and validates `workerCountMode`/`workerCount` (rejects `workerCount < 1`, rejects `AT_MOST`/`AT_LEAST` with `n < 1`)
  - [ ] `GET /api/tasks/*` DTOs list every currently-active slot (memberId, kind, response, valueAtAssignment) instead of assuming exactly one
  - [ ] Existing tests pass with 0 new failures; typecheck passes with 0 new errors

### Phase 4: Frontend
- **Goal**: Admin can set worker-count mode/count when creating or editing a task; members see and act on multi-slot tasks correctly.
- **Files**: `TaskMaintenanceCard.tsx`, `TaskCard.tsx`, `TaskDetailPage.tsx`
- **Dependencies**: Phase 3
- **End Conditions**:
  - [ ] Admin task form has mode (`AT_LEAST`/`AT_MOST`/`EXACTLY`) + count inputs, defaulting to `EXACTLY(1)` for parity with today's single-field form
  - [ ] `TaskCard` shows "N/M besetzt" only when `workerCount > 1`; unchanged rendering for `EXACTLY(1)`
  - [ ] `TaskDetailPage` lists every active assignee and offers an individual buyout action per slot the viewer holds
  - [ ] Existing web tests pass with 0 new failures; `npm run typecheck -w apps/web` passes with 0 new errors

### Phase 5: Regression + hardening
- **Goal**: Full-suite confidence before calling this done.
- **Files**: none (verification only)
- **Dependencies**: Phase 4
- **End Conditions**:
  - [ ] `npm run test` (all workspaces) passes, 0 failures, including every new multi-worker test from Phases 1-3
  - [ ] `npm run typecheck` and `npm run lint` both pass, 0 errors
  - [ ] Manual smoke test: create an `AT_LEAST(2)` task, two members volunteer, one buys back out, sweep fills the gap, both complete — full ledger + history trace matches expectations end to end

## Phase Dependency Graph

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Strictly sequential — each phase's use-cases are read by the next phase's callers, and the
migration in Phase 1 is a hard prerequisite for every later phase touching the DB. Not
Fleet-parallelizable: this is one coherent slice through domain → app → API → UI, and
splitting it would mean two agents editing the same lock-order-sensitive files.

## Risk Register

1. **Regression in `EXACTLY(1)` behavior** (the default, i.e. every existing task): mitigated by treating full backward-compatible degeneration as the primary correctness target in every phase's end conditions, not an afterthought — Phase 2 explicitly re-runs the full pre-existing integration suite unmodified.
2. **Race conditions on concurrent slot-fill**: mitigated by keeping the level-1 instance row lock as the sole true serialization point (unchanged from today) and the generalized `activeSlotKey` unique constraint as defense-in-depth, proven by a real-lock (`pg_blocking_pids`) test in Phase 2, mirroring the existing `concurrency.test.ts` methodology the security/test-quality review just praised.
3. **Migration risk on production data**: mitigated by an additive-only migration (new nullable/defaulted columns; the `activeForInstanceId → activeSlotKey` rename is the only destructive-looking change, and it backfills 1:1 from existing data) — dry-run the migration against a copy of the production database before deploying.
4. **Static lock-order/household-scope ESLint rules may not recognize new raw-SQL helpers**: `eslint-rules/lock-order.js` and the household-scope rule are pattern-matched against the existing `lockInstance`/`lockAssignment`/`lockMember` shapes; the new plural slot-lock helper in `tx.ts` must be added in the same shape (or the rules extended) in Phase 2, verified by running `npm run lint` as an explicit Phase 2 gate, not assumed.
5. **Fairness/weighting Open Question resurfacing as a real complaint**: this doc ships the simple interpretation (Key Decisions, fairness section) deliberately undecided-configurable; if a household reports it feels unfair post-launch, that becomes a follow-up intake item rather than blocking this feature — do not let scope creep into a new config knob during this campaign.
