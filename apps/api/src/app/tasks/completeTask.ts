/**
 * Erledigung — T7 (Architektur §4.5, §6.12, CLAUDE.md §7, §11, §28, §44).
 *
 * **The headline invariant lives in one expression.** `voluntaryReward` tests
 * `kind === 'VOLUNTARY'` *before* consulting any configuration value, so no
 * admin setting can make a randomly assigned completion pay — and there is no
 * setting that would (§5.4). When the award is 0, **no ledger row is written at
 * all**: the zero is an absence, not a zero-amount entry that could later be
 * mistaken for a payout (§8.2 step 1).
 *
 * `finalAward` (§6.12, intake "points-shop-virtual-gamification-items")
 * layers a per-member, per-charge multiplier effect on top of `award` — the
 * same `kind === 'VOLUNTARY' && award > 0` test guards it, so a `RANDOM`
 * completion can never be scaled into a payout either. One ledger row still
 * posts, not two: the multiplier changes the *amount* of the existing
 * `VOLUNTARY_TASK_REWARD` transaction, unlike the unrelated `STREAK_BONUS`
 * below, which is a second, independent transaction.
 *
 * Locks 1 → 2 → 3, the same order as the buyout, so the two cannot deadlock.
 * Level 3 is only entered when there is actually something to credit.
 *
 * Multi-worker-tasks Phase 2 (.planning/architecture-multi-worker-tasks.md,
 * "Per-slot completion vs. instance-level completion"): every slot that
 * completes pays its own assignee (full value for `VOLUNTARY`, 0 for
 * `RANDOM` — unchanged, already per-assignment) and closes its own
 * `TaskAssignment` row unconditionally. The **instance-level** effects —
 * `TaskInstance.status → COMPLETED`, the value reset, the recurrence's
 * `nextDueAt` advance, and the household-wide `TASK_COMPLETED` notification —
 * only fire when this is the *last* active slot (`slotsRemainingAfter === 0`),
 * computed from a live lock of every currently-ACTIVE assignment on the
 * instance (`lockActiveAssignmentsOfInstance`), not from the
 * `TaskInstance.activeSlotCount` cache — see `volunteerForTask.ts`'s
 * docstring for why that cache is not trusted for gating decisions this
 * phase. For `EXACTLY(1)` there is always exactly one slot, so
 * `slotsRemainingAfter` is always `0` and every branch below degenerates to
 * exactly today's unconditional behavior.
 */

import type { CompletionResultDto } from '@haushaltsauktion/shared';
import { dayKey, RewardTiming } from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import { applyRewardMultiplier } from '../../domain/effects/multiplier.js';
import { nextOccurrence } from '../../domain/recurrence/next-occurrence.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { applyCompletionToStreak } from '../../domain/streak/streak.js';
import { carriedValueAfterCompletion, resetValue, voluntaryReward } from '../../domain/task/value.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { buildInstanceDetail, findInstance } from '../queries/taskDto.js';
import {
  lockActiveAssignmentsOfInstance,
  lockAssignment,
  lockInstance,
  lockMember,
  withTransaction,
} from '../tx.js';

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

    // Every currently active slot on this instance, `assignment` included —
    // it is still ACTIVE at this point. Same level as `lockAssignment` above.
    const allActive = await lockActiveAssignmentsOfInstance(tx, input.householdId, instance.id);
    const slotsRemainingAfter = allActive.length - 1;
    const isLastSlot = slotsRemainingAfter <= 0;

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

    // Locked (level 3, §4.2): the streak fields below are read-then-written in
    // this same transaction, so a second concurrent completion by this member
    // (a different assignment) must not race past this read.
    const assignee = await lockMember(tx, input.householdId, assignment.memberId);
    if (assignee === null) throw new NotFoundError('Mitglied nicht gefunden.');

    // §5.5 — pinned to the assignment: the reward multiplier, the timing and
    // the reset strategy this assignment was created under.
    const pinned = await configFor(tx, input.householdId, ConfigDecision.VOLUNTARY_REWARD, {
      assignmentConfigVersion: assignment.configVersion,
      instanceConfigVersion: instance.configVersion,
    });

    // §7 / §44 — exactly 0 for RANDOM, whatever the configuration says. Per
    // slot, unconditionally — a slot completing with others still open still
    // pays its own assignee in full (multi-worker-tasks architecture,
    // "Per-slot completion").
    const award = voluntaryReward(pinned.config, {
      kind: assignment.kind as never,
      currentValue: instance.currentValue,
      timing: RewardTiming.ON_COMPLETE,
    });

    // §6.12 (intake "points-shop-virtual-gamification-items"): a member's
    // oldest active reward-multiplier effect, applied on top of the pinned
    // household config. `kind === 'VOLUNTARY' && award > 0` is tested first,
    // the same discipline `voluntaryReward` itself uses for §7/§44 — a
    // multiplier can only ever scale a payment that would happen anyway, it
    // can never conjure one for a RANDOM completion.
    let finalAward = award;
    if (assignment.kind === 'VOLUNTARY' && award > 0) {
      const effect = await tx.memberEffect.findFirst({
        where: {
          householdId: input.householdId,
          memberId: assignment.memberId,
          type: 'MULTIPLIER',
          expiresAt: { gt: now },
          chargesRemaining: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, multiplierValue: true, chargesRemaining: true },
      });
      if (effect !== null && effect.multiplierValue !== null && effect.chargesRemaining !== null) {
        const multiplied = applyRewardMultiplier(award, {
          multiplierValue: effect.multiplierValue,
          chargesRemaining: effect.chargesRemaining,
        });
        // Compare-and-set, the same shape as the assignment-close guard below:
        // a lost race here (already serialized by the level-3 member lock
        // taken above, so this is defence in depth, §4.7) degrades silently
        // to the un-multiplied award rather than failing the completion.
        const consumed = await tx.memberEffect.updateMany({
          where: { id: effect.id, householdId: input.householdId, chargesRemaining: { gt: 0 } },
          data: {
            chargesRemaining: { decrement: 1 },
            ...(effect.chargesRemaining - 1 <= 0 ? { consumedAt: now } : {}),
          },
        });
        if (consumed.count > 0) finalAward = multiplied;
      }
    }

    // Daily completion streak (intake "daily-completion-streak-bonus"). ANY
    // kind extends/keeps the streak alive for today; only a VOLUNTARY
    // completion can trigger a payment, computed from the length AFTER this
    // extension (§7/§44: `applyCompletionToStreak` tests the kind itself).
    const today = dayKey(now, input.timezone);
    const streakOutcome = applyCompletionToStreak(
      pinned.config,
      {
        length: assignee.streakLength,
        lastActiveDate: assignee.streakLastActiveDate,
        bonusPaidDate: assignee.streakBonusPaidDate,
      },
      { kind: assignment.kind as never, today },
    );

    const closed = await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        closedAt: now,
        activeForInstanceId: null,
        activeSlotKey: null,
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
    if (finalAward > 0) {
      const credit = await postTransaction(tx, {
        householdId: input.householdId,
        memberId: assignment.memberId,
        amount: finalAward,
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

    let streakTransaction: CompletionResultDto['transaction'] = null;
    if (streakOutcome.bonusAmount > 0) {
      const streakCredit = await postTransaction(tx, {
        householdId: input.householdId,
        memberId: assignment.memberId,
        amount: streakOutcome.bonusAmount,
        type: 'STREAK_BONUS',
        taskInstanceId: instance.id,
        taskAssignmentId: assignment.id,
        assignmentKind: assignment.kind,
        initiatorMemberId: input.actorMemberId,
        initiatorType: input.actorIsAdmin ? 'ADMIN' : 'MEMBER',
        // Same pattern as `reward:<assignmentId>` — a retried request cannot
        // double-pay this day's streak bonus.
        idempotencyKey: `streak:${assignment.id}`,
        description: `Serie: ${streakOutcome.nextState.length} Tage in Folge`,
      });
      balanceAfter = streakCredit.balanceAfter;
      streakTransaction = {
        id: streakCredit.id,
        amount: streakCredit.amount,
        balanceBefore: streakCredit.balanceBefore,
        balanceAfter: streakCredit.balanceAfter,
        type: streakCredit.type,
        createdAt: streakCredit.createdAt.toISOString(),
      };
    }

    // The streak's state columns are ordinary member fields, not ledger rows
    // (§14 governs the *points*, not the day-count) — but they still only ever
    // move here, under the level-3 lock taken above. Skipped while the
    // mechanism is off so a disabled household's `updatedAt` does not churn.
    if (pinned.config.streak.enabled) {
      await tx.householdMember.updateMany({
        where: { id: assignment.memberId, householdId: input.householdId },
        data: {
          streakLength: streakOutcome.nextState.length,
          streakLastActiveDate: streakOutcome.nextState.lastActiveDate,
          streakBonusPaidDate: streakOutcome.nextState.bonusPaidDate,
        },
      });
    }

    // §11 — the reset, and every other instance-level effect, gated on this
    // being the LAST active slot (multi-worker-tasks architecture, "Per-slot
    // completion vs. instance-level completion"). For EXACTLY(1),
    // `isLastSlot` is always true, so this always runs — exactly today.
    let resetTo = instance.currentValue;
    if (isLastSlot) {
      resetTo = resetValue(pinned.config, {
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
          status: resolve(instance.status as never, TaskEvent.COMPLETE) as never,
          completedAt: now,
          closedAt: now,
          completedByMemberId: assignment.memberId,
          currentValue: resetTo,
          activeSlotCount: 0,
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
    } else {
      // More slots remain open. The instance stays ASSIGNED — only the
      // denormalized slot-count cache moves.
      const updated = await tx.taskInstance.updateMany({
        where: {
          id: instance.id,
          householdId: input.householdId,
          status: 'ASSIGNED',
          version: instance.version,
        },
        data: {
          activeSlotCount: slotsRemainingAfter,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('TASK_NOT_AVAILABLE', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
          currentStatus: instance.status,
          heldBy: null,
        });
      }
    }

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
          slotsRemainingAfter,
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
                amount: finalAward,
                transactionId: transaction.id,
              },
            },
          ]
        : []),
      ...(streakTransaction
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
              type: 'STREAK_BONUS_AWARDED',
              payload: {
                memberId: assignment.memberId,
                amount: streakOutcome.bonusAmount,
                transactionId: streakTransaction.id,
                streakLength: streakOutcome.nextState.length,
              },
            },
          ]
        : []),
      ...(isLastSlot
        ? [
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
          ]
        : []),
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
        pointsAwarded: finalAward,
        streakBonusAwarded: streakOutcome.bonusAmount,
        streakLength: streakOutcome.nextState.length,
        valueResetFrom: instance.currentValue,
        valueResetTo: resetTo,
        configVersion: pinned.version,
        slotsRemainingAfter,
      },
    });

    if (isLastSlot) {
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
    }

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
      pointsAwarded: finalAward,
      transaction,
      balanceAfter,
      valueResetFrom: instance.currentValue,
      valueResetTo: resetTo,
    };
  });
}
