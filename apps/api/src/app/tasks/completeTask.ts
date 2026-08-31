/**
 * Erledigung — T7 (Architektur §4.5, CLAUDE.md §7, §11, §28, §44).
 *
 * **The headline invariant lives in one expression.** `voluntaryReward` tests
 * `kind === 'VOLUNTARY'` *before* consulting any configuration value, so no
 * admin setting can make a randomly assigned completion pay — and there is no
 * setting that would (§5.4). When the award is 0, **no ledger row is written at
 * all**: the zero is an absence, not a zero-amount entry that could later be
 * mistaken for a payout (§8.2 step 1).
 *
 * Locks 1 → 2 → 3, the same order as the buyout, so the two cannot deadlock.
 * Level 3 is only entered when there is actually something to credit.
 */

import type { CompletionResultDto } from '@haushaltsauktion/shared';
import { RewardTiming } from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import { nextOccurrence } from '../../domain/recurrence/next-occurrence.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { carriedValueAfterCompletion, resetValue, voluntaryReward } from '../../domain/task/value.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { buildInstanceDetail, findInstance } from '../queries/taskDto.js';
import { lockAssignment, lockInstance, withTransaction } from '../tx.js';

export interface CompleteInput {
  householdId: string;
  timezone: string;
  /** Who is calling. May be an admin acting on behalf of the assignee. */
  actorMemberId: string;
  actorIsAdmin: boolean;
  instanceId: string;
  assignmentId: string;
  expectedVersion?: number | undefined;
}

export async function completeTask(
  deps: Deps,
  input: CompleteInput,
): Promise<CompletionResultDto> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── level 1 ─────────────────────────────────────────────────────────
    const instance = await lockInstance(tx, input.householdId, input.instanceId);
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    await deps.hooks?.afterLock?.();

    if (input.expectedVersion !== undefined && input.expectedVersion !== instance.version) {
      throw new ConflictError('STALE_VIEW', 'Die Ansicht ist nicht mehr aktuell.', {
        currentVersion: instance.version,
      });
    }
    if (instance.status !== 'ASSIGNED') {
      throw new ConflictError('ILLEGAL_TRANSITION', 'Die Aufgabe ist nicht zugewiesen.', {
        from: instance.status,
        event: TaskEvent.COMPLETE,
      });
    }
    resolve(instance.status as never, TaskEvent.COMPLETE);

    // ── level 2 ─────────────────────────────────────────────────────────
    const assignment = await lockAssignment(tx, input.householdId, input.assignmentId);
    if (assignment === null || assignment.taskInstanceId !== instance.id) {
      throw new NotFoundError('Zuweisung nicht gefunden.');
    }
    if (assignment.status !== 'ACTIVE') {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist bereits geschlossen.', {
        currentStatus: assignment.status,
      });
    }
    if (assignment.memberId !== input.actorMemberId && !input.actorIsAdmin) {
      throw new ForbiddenError('NOT_ASSIGNEE', 'Diese Zuweisung gehört dir nicht.');
    }

    const definition = await tx.taskDefinition.findFirst({
      where: { id: instance.taskDefinitionId, householdId: input.householdId },
      select: {
        id: true,
        title: true,
        recurrenceType: true,
        recurrenceInterval: true,
        recurrenceWeekdays: true,
        recurrenceDayOfMonth: true,
        recurrenceTimeOfDay: true,
        dueOffsetMinutes: true,
      },
    });
    if (definition === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    const assignee = await tx.householdMember.findFirst({
      where: { id: assignment.memberId, householdId: input.householdId },
      select: { displayName: true, pointsCache: true },
    });
    if (assignee === null) throw new NotFoundError('Mitglied nicht gefunden.');

    // §5.5 — pinned to the assignment: the reward multiplier, the timing and
    // the reset strategy this assignment was created under.
    const pinned = await configFor(tx, input.householdId, ConfigDecision.VOLUNTARY_REWARD, {
      assignmentConfigVersion: assignment.configVersion,
      instanceConfigVersion: instance.configVersion,
    });

    // §7 / §44 — exactly 0 for RANDOM, whatever the configuration says.
    const award = voluntaryReward(pinned.config, {
      kind: assignment.kind as never,
      currentValue: instance.currentValue,
      timing: RewardTiming.ON_COMPLETE,
    });

    const closed = await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        closedAt: now,
        activeForInstanceId: null,
      },
    });
    if (closed.count === 0) {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist bereits geschlossen.', {
        currentStatus: assignment.status,
      });
    }

    // ── level 3, only when there is something to credit ─────────────────
    let balanceAfter = assignee.pointsCache;
    let transaction: CompletionResultDto['transaction'] = null;
    if (award > 0) {
      const credit = await postTransaction(tx, {
        householdId: input.householdId,
        memberId: assignment.memberId,
        amount: award,
        type: 'VOLUNTARY_TASK_REWARD',
        taskInstanceId: instance.id,
        taskAssignmentId: assignment.id,
        assignmentKind: assignment.kind,
        initiatorMemberId: input.actorMemberId,
        initiatorType: input.actorIsAdmin ? 'ADMIN' : 'MEMBER',
        idempotencyKey: `reward:${assignment.id}`,
        description: `Erledigt: ${definition.title}`,
      });
      balanceAfter = credit.balanceAfter;
      transaction = {
        id: credit.id,
        amount: credit.amount,
        balanceBefore: credit.balanceBefore,
        balanceAfter: credit.balanceAfter,
        type: credit.type,
        createdAt: credit.createdAt.toISOString(),
      };
    }

    // §11 — the reset. Default `BASE_VALUE`, which is what makes the escalation
    // a property of one occurrence rather than a ratchet on the chore itself.
    const resetTo = resetValue(pinned.config, {
      currentValue: instance.currentValue,
      baseValue: instance.baseValue,
    });
    const carried = carriedValueAfterCompletion(pinned.config, {
      currentValue: instance.currentValue,
      baseValue: instance.baseValue,
    });

    const updated = await tx.taskInstance.updateMany({
      where: {
        id: instance.id,
        householdId: input.householdId,
        status: 'ASSIGNED',
        version: instance.version,
      },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        closedAt: now,
        completedByMemberId: assignment.memberId,
        currentValue: resetTo,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
        currentStatus: instance.status,
        heldBy: null,
      });
    }

    const nextDue = nextOccurrence(
      {
        type: definition.recurrenceType,
        interval: definition.recurrenceInterval,
        weekdays: definition.recurrenceWeekdays,
        dayOfMonth: definition.recurrenceDayOfMonth,
        timeOfDay: definition.recurrenceTimeOfDay,
        dueOffsetMinutes: definition.dueOffsetMinutes,
      },
      now,
      input.timezone,
    );

    await tx.taskDefinition.updateMany({
      where: { id: definition.id, householdId: input.householdId },
      data: { lastCompletedAt: now, nextDueAt: nextDue, carriedValue: carried },
    });

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        type: 'COMPLETED',
        payload: {
          memberId: assignment.memberId,
          memberName: assignee.displayName,
          kind: assignment.kind,
        },
      },
      ...(transaction
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
              type: 'POINTS_AWARDED',
              payload: {
                memberId: assignment.memberId,
                amount: award,
                transactionId: transaction.id,
              },
            },
          ]
        : []),
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        type: 'VALUE_RESET',
        payload: {
          from: instance.currentValue,
          to: resetTo,
          strategy: pinned.config.completion.resetStrategy,
        },
      },
    ]);

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: input.actorIsAdmin ? 'ADMIN' : 'MEMBER',
      actorMemberId: input.actorMemberId,
      action: 'TASK_COMPLETED',
      entityType: 'TaskInstance',
      entityId: instance.id,
      payload: {
        assignmentId: assignment.id,
        kind: assignment.kind,
        pointsAwarded: award,
        valueResetFrom: instance.currentValue,
        valueResetTo: resetTo,
        configVersion: pinned.version,
      },
    });

    const household = await tx.householdMember.findMany({
      where: { householdId: input.householdId, isActive: true },
      select: { id: true },
    });
    await deps.notifier.emit(
      tx,
      household.map((m) => ({
        householdId: input.householdId,
        memberId: m.id,
        type: 'TASK_COMPLETED',
        payload: { taskInstanceId: instance.id, by: assignee.displayName },
        taskInstanceId: instance.id,
      })),
    );

    const reloaded = await findInstance(tx, input.householdId, instance.id);
    if (reloaded === null) throw new NotFoundError('Aufgabe nicht gefunden.');
    const detail = await buildInstanceDetail(
      tx,
      {
        householdId: input.householdId,
        memberId: input.actorMemberId,
        timezone: input.timezone,
        now,
      },
      reloaded,
      pinned.config,
      balanceAfter,
    );

    return {
      instance: detail,
      pointsAwarded: award,
      transaction,
      balanceAfter,
      valueResetFrom: instance.currentValue,
      valueResetTo: resetTo,
    };
  });
}
