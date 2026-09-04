# PRD: Multi-Worker Tasks

> Description: Let a task require more than one person working on it at the same time, with the required headcount specified as AT_LEAST/AT_MOST/EXACTLY(n) at creation.
> Author: Hannes Brandstätter-Müller
> Date: 2026-09-03
> Status: draft
> Mode: feature

## Problem

Some household chores genuinely need multiple people at once to be practical or safe (e.g. moving furniture, a big seasonal cleanup). Today `TaskDefinition` → `TaskInstance` → `TaskAssignment` structurally enforce **exactly one active worker per task instance** — `TaskAssignment.activeForInstanceId` is a unique sentinel that makes a second concurrent assignment a database-level constraint violation (schema.prisma §"Höchstens EINE darf je Instanz ACTIVE sein"). A household currently has no way to model "this needs 2–3 people" without artificially splitting it into separate single-person tasks, which loses the shared-task framing, the fairness accounting, and the point economy that goes with a single task.

## Users

- **Household admin**: sets the worker-count requirement when creating or editing a task definition.
- **Household member**: volunteers for or is randomly assigned to one of the open slots on a multi-worker task, and can complete or buy out their own slot independently of co-assignees.

## Core Features

1. **Worker-count mode on TaskDefinition**: admin sets `AT_LEAST(n)` / `AT_MOST(n)` / `EXACTLY(n)` at creation or edit time; existing task definitions default to `EXACTLY(1)`, preserving today's behavior unchanged.
2. **Multiple concurrent slots per TaskInstance**: up to `n` `TaskAssignment` rows can be `ACTIVE` on one instance at a time, each independently and atomically claimable — no slot can be double-booked, mirroring the existing single-assignment concurrency guarantee.
3. **Full-value voluntary reward per slot**: each member who voluntarily takes a slot and completes their part earns the task's full current point value — the value is not divided among co-workers.
4. **Unanimous completion gate**: a multi-worker instance reaches `COMPLETED` only once every currently-`ACTIVE` slot assignment has been individually marked complete; the value-reset-to-base happens once, at that point.
5. **Per-slot buyout**: a randomly-assigned member can buy out their own slot independently — only that slot is released, value-bumped, and re-offered/re-swept; co-assignees' active work is untouched.

## Out of Scope (v1)

- Resizing the worker-count requirement on a `TaskInstance` that already has active assignments (mid-flight slot-count changes).
- Split/proportional point rewards — full value per voluntary completer only, per the decision above.
- Cross-task worker pairing or scheduling (requiring specific people to work together) — slots are anonymous and interchangeable.
- A dedicated UI redesign for "who's on this task" beyond extending the existing assignment list to show multiple rows.
- Resolving what happens when an `AT_MOST(n)` task gets zero volunteers (see Open Questions) — v1 ships with an explicit, documented default behavior, not a configurable one.

## Technical Decisions

- **Worker-count representation**: two new typed columns on `TaskDefinition` (`workerCountMode: AT_LEAST | AT_MOST | EXACTLY`, `workerCount: Int`) — because every other admin-configurable numeric rule in this domain is a plain typed/enum column rather than JSON, and this needs to participate in indexed "which definitions still need staffing" queries.
- **Slot uniqueness**: replace `TaskAssignment.activeForInstanceId`'s instance-wide unique sentinel with a per-slot unique key (e.g. a generated `(taskInstanceId, slotIndex)` pair, active only while `status = ACTIVE`) — because the codebase already has a proven, audited technique for turning a race into a `23505`-constraint-violation signal (§1.5/§4.2), and reusing it scoped to a slot is lower-risk than inventing a new locking primitive.
- **Reward/ledger coupling untouched**: no change to `PointTransaction`'s composite-FK-to-`assignment.kind` trick that structurally forbids a `VOLUNTARY_TASK_REWARD` on a `RANDOM` assignment (§1.5/§44) — each slot remains its own `TaskAssignment` row with its own `kind`, so the existing guarantee holds per-slot automatically with no ledger changes.

## Architecture

Multi-worker capability is added at the `TaskDefinition`/`TaskAssignment` layer without touching `PointTransaction`'s core invariants. A `TaskInstance` for a multi-worker definition can carry up to `workerCount` concurrently-`ACTIVE` `TaskAssignment` rows (one per slot) instead of at most one; each slot is independently volunteerable, randomly-assignable, completable, and buyout-able through the existing per-assignment use cases (`volunteerForTask`, `executeBuyout`, `completeTask`), extended to operate on a specific open slot rather than assuming instance-wide exclusivity. `TaskInstance.status` transitions extend so the instance stays recruitable while slots remain open, reaching `ASSIGNED` once the mode's threshold is met and `COMPLETED` only once every active slot independently completes. `runAssignmentSweep` and the eligibility/fairness engine (`candidates.ts`, `eligibility.ts`, `weights.ts`) operate per open slot, filling them one at a time with the existing weighted-fairness selection — no new selection algorithm, only a change in unit of work from "instance" to "slot."

## Integration Points (feature mode)

- **Existing files modified**: `apps/api/prisma/schema.prisma` (worker-count fields on `TaskDefinition`, slot key on `TaskAssignment`), `apps/api/src/domain/task/state-machine.ts`, `apps/api/src/app/tasks/volunteerForTask.ts`, `apps/api/src/app/tasks/completeTask.ts`, `apps/api/src/app/buyout/executeBuyout.ts`, `apps/api/src/app/buyout/quote.ts`, `apps/api/src/app/assignment/candidates.ts`, `apps/api/src/app/assignment/runAssignmentSweep.ts`, `apps/api/src/app/assignment/reopen.ts`, `apps/api/src/domain/assignment/eligibility.ts`, `apps/api/src/app/queries/taskDto.ts`, `apps/api/src/app/queries/reads.ts`, `apps/api/src/infra/http/routes/tasks.ts`, `apps/api/src/infra/http/routes/admin.ts` (task-definition create/update), `packages/shared/src` (new shared types/enums for worker-count mode), `apps/web/src` task-creation admin form and task-detail/assignment display components.
- **New files created**: Prisma migration for the new columns/constraints; new domain tests under `apps/api/test/domain/` and integration tests under `apps/api/test/integration/` for multi-slot races (mirroring the existing `pg_blocking_pids`-based `concurrency.test.ts`).
- **Dependencies added**: none expected — pure domain/schema extension on the existing stack (Fastify + Prisma + PostgreSQL, React frontend).
- **Patterns followed**: append-only ledger with idempotency keys (§14), unique-constraint-as-concurrency-guard (§1.5), ascending lock-order discipline enforced by the custom `lock-order` ESLint rule, household-scoping enforced by the custom `household-scope` ESLint rule, config-driven business rules validated by Zod in `packages/shared` (no hardcoded constants, no `eval` — §17).

## End Conditions (Definition of Done)

- [ ] Admin can set `AT_LEAST(n)` / `AT_MOST(n)` / `EXACTLY(n)` when creating or editing a `TaskDefinition`; existing task definitions default to `EXACTLY(1)` with no behavior change.
- [ ] Two or more members can independently volunteer for distinct slots on the same multi-worker `TaskInstance`; a member cannot claim a slot beyond the mode's limit, enforced server-side.
- [ ] Concurrent volunteer attempts for the same slot race safely — exactly one succeeds — proven by a real-lock integration test analogous to the existing `concurrency.test.ts`.
- [ ] Each voluntary completer of a slot receives the task's full current point value, verified by ledger entries (not just balance).
- [ ] A multi-worker instance reaches `COMPLETED` only once every currently-`ACTIVE` slot assignment is individually completed; partial completion leaves it `ASSIGNED`.
- [ ] The random-assignment sweep fills open slots on an under-staffed multi-worker task, respecting eligibility/fairness rules unchanged from the single-worker path.
- [ ] A randomly-assigned member can buy out their own slot independently; the vacated slot's value increases and is re-offered/re-swept on its own, while co-assignees' active assignments are untouched.
- [ ] No points are awarded for a slot completed via random assignment (existing §44 invariant holds per-slot).
- [ ] Existing single-worker (`EXACTLY(1)`) tasks behave identically to today — full regression suite unaffected.
- [ ] Existing tests pass with 0 new failures.
- [ ] Typecheck passes with 0 new errors.

## Open Questions

- What happens when an `AT_MOST(n)` task has zero volunteers by the offer deadline — does it get randomly assigned to at least 1 person (guaranteeing the task gets done, like today's single-worker model), or can it legitimately go unstaffed and expire?
- For `AT_LEAST(n)`: once the minimum is met by volunteers, does the task keep accepting more volunteers without an upper bound, or does it stop recruiting once `ASSIGNED`?
- Does `maxRandomAssignmentsPerWeek` (existing per-member fairness limit) count one random-assigned slot as one assignment regardless of how many co-assignees share the instance, or does slot-sharing need its own fairness weighting?
- Should the weighted-fairness engine treat "N of M slots already filled by volunteers" as a signal when picking who fills the remaining slots, or is each open slot filled independently with no correlation?
- Do member-facing history entries (§22) need a new "2 of 3 slots filled" event type, or is a per-slot `VOLUNTEERED`/`RANDOMLY_ASSIGNED`/`COMPLETED` stream sufficient?
