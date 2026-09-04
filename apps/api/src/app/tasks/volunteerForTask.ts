/**
 * Voluntary takeover — T3 (Architektur §4.3, CLAUDE.md §5, §28, §35).
 *
 * **Three independent guards** (§4.7), each of which alone would give the right
 * answer, so that a future refactor has to remove all three before it can
 * double-book a chore:
 *
 *   1. `SELECT … FOR UPDATE` on the instance + a status check — the second
 *      volunteer *blocks* here rather than racing, then sees `ASSIGNED`.
 *   2. a conditional `updateMany` on `(status, version)` — rowcount 0 aborts,
 *      even if the lock were gone.
 *   3. the `active_slot_key` unique index — a second ACTIVE assignment on the
 *      SAME slot is a 23505, even if guards 1 and 2 were both gone.
 *
 * The loser writes nothing and receives `409 TASK_NOT_AVAILABLE` naming who
 * holds it, so the UI can say "Anna hat die Aufgabe übernommen" rather than
 * showing a bare error. Exactly one winner per slot — end-condition 17.
 *
 * Multi-worker-tasks Phase 2 (.planning/architecture-multi-worker-tasks.md,
 * "Slot-aware state transitions"): whether a new volunteer may join is
 * `activeSlotCount < maxAllowed(...)`, checked independently of
 * `TaskInstance.status` — an `AT_LEAST`/`AT_MOST` instance keeps recruiting
 * while `ASSIGNED` (min already met, room for more). `resolve()` — the single
 * place `state-machine.ts` is consulted — is therefore only called on the one
 * join that actually crosses the `minRequired` threshold and flips
 * `AVAILABLE → ASSIGNED`; an instance that is already `ASSIGNED` and merely
 * gaining another slot never asks the state machine about a transition that
 * does not exist (`(ASSIGNED, VOLUNTEER)` is not in `TRANSITIONS`, and
 * `state-machine.ts` itself is a hard no-touch file for this campaign). For
 * `EXACTLY(1)` — every pre-existing task — `min === max === 1`, so this
 * degenerates to exactly today's single call.
 *
 * `activeSlotCount` on `TaskInstance` is written here as a best-effort
 * denormalized cache, but never *read* for a gating decision: the count and
 * the set of occupied slots are derived fresh, every call, from the `ACTIVE`
 * `TaskAssignment` rows themselves (`lockActiveAssignmentsOfInstance`, locked
 * immediately after the level-1 instance lock). That is what keeps this
 * use-case correct even though two other flows (`reopen.ts`,
 * `rejectCompletion.ts`) do not yet maintain that cache on every close — see
 * the HANDOFF for why fixing those two was judged unnecessary this phase.
 */

import { AssignmentKind, RewardTiming, type TaskInstanceDetailDto } from '@haushaltsauktion/shared';

import { assertCanVolunteer } from '../../domain/assignment/eligibility.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { maxAllowed, minRequired, slotOutcome } from '../../domain/task/worker-slots.js';
import { voluntaryReward } from '../../domain/task/value.js';
import { loadCandidates } from '../assignment/candidates.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeHistory } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { buildInstanceDetail, findInstance } from '../queries/taskDto.js';
import { lockActiveAssignmentsOfInstance, lockInstance, withTransaction } from '../tx.js';

export interface VolunteerInput {
  householdId: string;
  timezone: string;
  memberId: string;
  instanceId: string;
  /** Optional (§4.6). Omitting it means "I accept whatever the current state is". */
  expectedVersion?: number | undefined;
}

export interface VolunteerResult {
  instance: TaskInstanceDetailDto;
  assignmentId: string;
  /** Non-zero only under `rewardTiming = ON_ACCEPT`. */
  pointsAwarded: number;
  balanceAfter: number;
}

/** Lowest index in `[0, max)` not already held by an `ACTIVE` assignment. */
function nextFreeSlotIndex(occupied: ReadonlySet<number>, max: number): number {
  for (let i = 0; i < max; i += 1) {
    if (!occupied.has(i)) return i;
  }
  // Unreachable when the caller has already checked `activeSlotCount < max`.
  throw new Error('Kein freier Slot verfügbar, obwohl activeSlotCount < max geprüft wurde.');
}

export async function volunteerForTask(
  deps: Deps,
  input: VolunteerInput,
): Promise<VolunteerResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── guard 1, level 1 ────────────────────────────────────────────────
    const locked = await lockInstance(tx, input.householdId, input.instanceId);
    if (locked === null) {
      // Absent and foreign are the same answer, so the API cannot be used to
      // probe another household's contents (§3.13, §36).
      throw new NotFoundError('Aufgabe nicht gefunden.');
    }

    // §4.8's test seam. In production this is undefined and the call vanishes.
    await deps.hooks?.afterLock?.();

    // Recruiting states only. Multi-worker: `ASSIGNED` still recruits while
    // `activeSlotCount < max` (checked below) — `AVAILABLE` is the only other
    // state a new volunteer can ever join from.
    if (locked.status !== 'AVAILABLE' && locked.status !== 'ASSIGNED') {
      const holder = await tx.taskAssignment.findFirst({
        where: {
          householdId: input.householdId,
          taskInstanceId: input.instanceId,
          status: 'ACTIVE',
        },
        select: { member: { select: { displayName: true } } },
      });
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Diese Aufgabe ist nicht mehr verfügbar.', {
        currentStatus: locked.status,
        heldBy: holder?.member.displayName ?? null,
      });
    }

    // ── guard 1 continued: the slots themselves, level 2 ─────────────────
    const activeAssignments = await lockActiveAssignmentsOfInstance(
      tx,
      input.householdId,
      input.instanceId,
    );
    const mode = locked.workerCountMode as never;
    const min = minRequired(mode, locked.workerCount);
    const max = maxAllowed(mode, locked.workerCount);
    const currentCount = activeAssignments.length;

    const already = activeAssignments.find((a) => a.memberId === input.memberId);
    if (already !== undefined) {
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Du hast diese Aufgabe bereits übernommen.', {
        currentStatus: locked.status,
        heldBy: null,
      });
    }
    if (currentCount >= max) {
      const holder = await tx.taskAssignment.findFirst({
        where: {
          householdId: input.householdId,
          taskInstanceId: input.instanceId,
          status: 'ACTIVE',
        },
        select: { member: { select: { displayName: true } } },
      });
      // Checked before the version guard below on purpose (CI fix,
      // multi-worker-tasks): a task that is actually full must always report
      // TASK_NOT_AVAILABLE, even when the caller's `expectedVersion` is also
      // stale — the winner's commit bumps `version` on every join, so for an
      // EXACTLY(1) race the loser's version is *always* stale too, and
      // showing "someone beat you" is strictly more informative than "your
      // screen is stale" when the reason it's stale is exactly that someone
      // beat you.
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Diese Aufgabe ist nicht mehr verfügbar.', {
        currentStatus: locked.status,
        heldBy: holder?.member.displayName ?? null,
      });
    }

    if (input.expectedVersion !== undefined && input.expectedVersion !== locked.version) {
      // Distinct from TASK_NOT_AVAILABLE on purpose (§4.6): "your screen is
      // stale" gets a silent refetch, "someone beat you" gets a message. Only
      // reached once we know a slot is actually still open — a version bump
      // from an unrelated join (e.g. a co-slot filling on a multi-worker
      // task) is a genuine "just refetch" case, not a lost race.
      throw new ConflictError('STALE_VIEW', 'Die Ansicht ist nicht mehr aktuell.', {
        currentVersion: locked.version,
      });
    }

    const definition = await tx.taskDefinition.findFirst({
      where: { id: locked.taskDefinitionId, householdId: input.householdId },
      select: { categoryId: true, title: true },
    });
    if (definition === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    // Pinned to the instance for the offer, current for eligibility (§5.5).
    const current = await configFor(tx, input.householdId, ConfigDecision.ELIGIBILITY_CAPS);

    const { candidates, definitionHasAllowlist } = await loadCandidates(tx, {
      householdId: input.householdId,
      timezone: input.timezone,
      taskDefinitionId: locked.taskDefinitionId,
      categoryId: definition.categoryId,
      now,
      cfg: current.config,
      instanceId: input.instanceId,
    });
    const mine = candidates.find((c) => c.memberId === input.memberId);
    if (mine === undefined) throw new NotFoundError('Mitglied nicht gefunden.');

    // §6.9: volunteering checks rules 1–5 only. Caps and cooldowns protect
    // people from being *given* work; they must never stop someone offering.
    assertCanVolunteer(mine, { definitionHasAllowlist });

    const member = await tx.householdMember.findFirst({
      where: { id: input.memberId, householdId: input.householdId },
      select: { displayName: true, pointsCache: true },
    });
    if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');

    // ── the slot arithmetic (worker-slots.ts, pure) ───────────────────────
    const outcome = slotOutcome({ event: 'JOIN', activeSlotCount: currentCount, min, max });
    const occupied = new Set(activeAssignments.map((a) => a.slotIndex));
    const slotIndex = nextFreeSlotIndex(occupied, max);

    // Only the join that actually reaches `min` from `AVAILABLE` crosses a
    // real state-machine transition. `EXACTLY(1)`'s first (and only) join
    // always does — degenerating to exactly today's call.
    const nextStatus =
      locked.status === 'AVAILABLE' && !outcome.isBelowMin
        ? resolve(locked.status as never, TaskEvent.VOLUNTEER)
        : locked.status;

    // ── guard 2: compare-and-set ────────────────────────────────────────
    const { count } = await tx.taskInstance.updateMany({
      where: {
        id: input.instanceId,
        householdId: input.householdId,
        status: locked.status,
        version: locked.version,
      },
      data: {
        status: nextStatus as never,
        activeSlotCount: outcome.nextActiveSlotCount,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Diese Aufgabe ist nicht mehr verfügbar.', {
        currentStatus: 'ASSIGNED',
        heldBy: null,
      });
    }

    // ── guard 3: the sentinel unique index ──────────────────────────────
    const assignment = await tx.taskAssignment.create({
      data: {
        householdId: input.householdId,
        taskInstanceId: input.instanceId,
        memberId: input.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        // Multi-worker-tasks Phase 2: the old global-unique sentinel is only
        // ever set by the slot-0 holder now — see tx.ts / the architecture
        // doc's "Slot uniqueness" section. `activeSlotKey` is the real guard
        // for every slot, including slot 0.
        activeForInstanceId: slotIndex === 0 ? input.instanceId : null,
        slotIndex,
        activeSlotKey: `${input.instanceId}:${slotIndex}`,
        valueAtAssignment: locked.currentValue,
        configVersion: current.version,
        assignedAt: now,
        respondedAt: now,
      },
    });

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: input.instanceId,
        assignmentId: assignment.id,
        memberId: input.memberId,
        type: 'VOLUNTEERED',
        payload: {
          memberId: input.memberId,
          memberName: member.displayName,
          value: locked.currentValue,
        },
      },
    ]);

    // D-07: voluntary pickup is one of the two moments a task becomes
    // someone's job (the other is TASK_ASSIGNED, emitted by the random-draw
    // sweep). Deliberately a distinct type, not a reuse of TASK_ASSIGNED,
    // whose "you were selected at random" meaning is relied on elsewhere.
    await deps.notifier.emit(tx, [
      {
        householdId: input.householdId,
        memberId: input.memberId,
        type: 'TASK_TAKEN',
        payload: { taskInstanceId: input.instanceId, value: locked.currentValue },
        taskInstanceId: input.instanceId,
      },
    ]);

    // ── ON_ACCEPT only: level 3 ─────────────────────────────────────────
    // Under the default ON_COMPLETE this is 0 and no ledger row is written at
    // all — the zero is an absence, not a zero-amount entry (§8.2 step 1).
    const award = voluntaryReward(current.config, {
      kind: AssignmentKind.VOLUNTARY,
      currentValue: locked.currentValue,
      timing: RewardTiming.ON_ACCEPT,
    });

    let balanceAfter: number;
    if (award > 0) {
      const posted = await postTransaction(tx, {
        householdId: input.householdId,
        memberId: input.memberId,
        amount: award,
        type: 'VOLUNTARY_TASK_REWARD',
        taskInstanceId: input.instanceId,
        taskAssignmentId: assignment.id,
        assignmentKind: 'VOLUNTARY',
        initiatorMemberId: input.memberId,
        initiatorType: 'MEMBER',
        idempotencyKey: `reward:${assignment.id}`,
        description: `Freiwillige Übernahme: ${definition.title}`,
      });
      balanceAfter = posted.balanceAfter;
      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: input.instanceId,
          assignmentId: assignment.id,
          memberId: input.memberId,
          type: 'POINTS_AWARDED',
          payload: { memberId: input.memberId, amount: award, transactionId: posted.id },
        },
      ]);
    } else {
      balanceAfter = member.pointsCache;
    }

    const reloaded = await findInstance(tx, input.householdId, input.instanceId);
    if (reloaded === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    const instance = await buildInstanceDetail(
      tx,
      { householdId: input.householdId, memberId: input.memberId, timezone: input.timezone, now },
      reloaded,
      current.config,
      balanceAfter,
    );

    return { instance, assignmentId: assignment.id, pointsAwarded: award, balanceAfter };
  });
}
