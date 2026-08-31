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
 *   3. the `active_for_instance_id` unique index — a second ACTIVE assignment
 *      is a 23505, even if guards 1 and 2 were both gone.
 *
 * The loser writes nothing and receives `409 TASK_NOT_AVAILABLE` naming who
 * holds it, so the UI can say "Anna hat die Aufgabe übernommen" rather than
 * showing a bare error. Exactly one winner — end-condition 17.
 */

import { AssignmentKind, RewardTiming, type TaskInstanceDetailDto } from '@haushaltsauktion/shared';

import { assertCanVolunteer } from '../../domain/assignment/eligibility.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { voluntaryReward } from '../../domain/task/value.js';
import { loadCandidates } from '../assignment/candidates.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeHistory } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { buildInstanceDetail, findInstance } from '../queries/taskDto.js';
import { lockInstance, withTransaction } from '../tx.js';

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

    if (locked.status !== 'AVAILABLE') {
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

    if (input.expectedVersion !== undefined && input.expectedVersion !== locked.version) {
      // Distinct from TASK_NOT_AVAILABLE on purpose (§4.6): "your screen is
      // stale" gets a silent refetch, "someone beat you" gets a message.
      throw new ConflictError('STALE_VIEW', 'Die Ansicht ist nicht mehr aktuell.', {
        currentVersion: locked.version,
      });
    }

    // The legality gate. Redundant with the status check above, but it is the
    // single place the state machine is consulted, so the two cannot drift.
    resolve(locked.status as never, TaskEvent.VOLUNTEER);

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

    // ── guard 2: compare-and-set ────────────────────────────────────────
    const { count } = await tx.taskInstance.updateMany({
      where: {
        id: input.instanceId,
        householdId: input.householdId,
        status: 'AVAILABLE',
        version: locked.version,
      },
      data: { status: 'ASSIGNED', version: { increment: 1 } },
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
        activeForInstanceId: input.instanceId,
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
