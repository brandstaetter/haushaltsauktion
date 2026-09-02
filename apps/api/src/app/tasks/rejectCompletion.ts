/**
 * Ablehnung einer Erledigung durch einen Admin — a moderation power in the
 * spirit of §32's fairness transparency, for a completion that was not done
 * satisfactorily.
 *
 * `TaskInstance.status` never rewinds through an *ordinary* event —
 * `state-machine.test.ts` still enforces that VOLUNTEER, ASSIGN_RANDOM, and
 * the rest stay illegal from `COMPLETED`. But the admin's own rejection is
 * deliberately the one place a completion *can* be handed back for a genuine
 * redo, through exactly two narrow, audited events:
 *
 *   - `REOPEN_TO_ASSIGNEE` → `ASSIGNED`, straight back to the member who did
 *     the unsatisfactory work. A fresh `TaskAssignment` is created for them —
 *     never the rejected one, which the ledger's own
 *     `pt_one_reward_per_assignment` index has already retired — with
 *     `kind: 'VOLUNTARY'`, so a genuine redo earns the normal reward exactly
 *     like any other voluntary completion. It is *not* a special assignment
 *     kind: it can be released or bought out under the household's ordinary
 *     rules, the same as any other voluntary takeover.
 *   - `REOPEN_TO_MARKET` → `AVAILABLE`, open to anyone (§10's "erneut
 *     angeboten"), through the same re-offer shape `reopen.ts` uses after a
 *     release or revoke.
 *
 * Either way, any reward the rejected completion earned is clawed back
 * through the same `CORRECTION` mechanism `reopen.ts` uses for an
 * `ON_ACCEPT` release — a no-op for a `RANDOM` assignment, which never
 * earned one (§7, §44).
 *
 * The chore's recurrence bookkeeping (`TaskDefinition.nextDueAt` etc.) is
 * left untouched: `runAssignmentSweep`'s own open-instance cap
 * (`maxOpenInstancesPerDefinition`, default 1) already refuses to
 * materialize a second occurrence while this one is still open, so nothing
 * needs to be reverted there to avoid a double-booking.
 *
 * **The streak (intake "daily-completion-streak-bonus") is clawed back the
 * same way, but its *state* rolls back asymmetrically per outcome:**
 *
 *   - `REOFFER_MARKET` breaks the streak immediately and unconditionally —
 *     the chore goes back to the open market, someone else entirely might do
 *     it, so this member's claim on the day is void regardless of what else
 *     they did that day.
 *   - `REASSIGN_TO_MEMBER` never touches the streak's length or last-active
 *     day here at all. Either the redo lands later (same day or a following
 *     one) and the streak simply continues through the normal `completeTask`
 *     path, or it never does — in which case `runStreakSweep.ts`'s idle-day
 *     check eventually notices the day went stale and breaks it then. This
 *     is what makes "reject, then successfully redo the same day" a no-op
 *     for the streak: there is nothing to undo because nothing was undone.
 *
 * Either way, a reversed `STREAK_BONUS` clears `bonusPaidDate` for exactly
 * the day it was posted for — never for a different, more recent day a later
 * completion may have already paid — so a same-day redo can pay again.
 */

import { AssignmentKind, dayKey } from '@haushaltsauktion/shared';

import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { clearBonusForDay, ZERO_STREAK, type StreakState } from '../../domain/streak/streak.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory, type HistoryDraft } from '../events.js';
import { clawback } from '../points/clawback.js';
import { lockAssignment, lockInstance, lockMember, withTransaction } from '../tx.js';

export type RejectCompletionOutcome = 'REASSIGN_TO_MEMBER' | 'REOFFER_MARKET';

export interface RejectCompletionInput {
  householdId: string;
  timezone: string;
  actorMemberId: string;
  instanceId: string;
  assignmentId: string;
  reason: string | null;
  outcome: RejectCompletionOutcome;
}

export interface RejectCompletionResult {
  instanceId: string;
  assignmentId: string;
  memberId: string;
  clawedBack: number;
  outcome: RejectCompletionOutcome;
  status: string;
  newAssignmentId: string | null;
}

export async function rejectCompletion(
  deps: Deps,
  input: RejectCompletionInput,
): Promise<RejectCompletionResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── level 1 ─────────────────────────────────────────────────────────
    const instance = await lockInstance(tx, input.householdId, input.instanceId);
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    await deps.hooks?.afterLock?.();

    if (instance.status !== 'COMPLETED') {
      throw new ConflictError('ILLEGAL_TRANSITION', 'Die Aufgabe ist nicht abgeschlossen.', {
        from: instance.status,
        event:
          input.outcome === 'REASSIGN_TO_MEMBER'
            ? TaskEvent.REOPEN_TO_ASSIGNEE
            : TaskEvent.REOPEN_TO_MARKET,
      });
    }
    const nextStatus = resolve(
      instance.status as never,
      input.outcome === 'REASSIGN_TO_MEMBER'
        ? TaskEvent.REOPEN_TO_ASSIGNEE
        : TaskEvent.REOPEN_TO_MARKET,
    );

    // ── level 2 ─────────────────────────────────────────────────────────
    const assignment = await lockAssignment(tx, input.householdId, input.assignmentId);
    if (assignment === null || assignment.taskInstanceId !== instance.id) {
      throw new NotFoundError('Zuweisung nicht gefunden.');
    }
    if (assignment.status !== 'COMPLETED') {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Diese Erledigung wurde bereits bearbeitet.', {
        currentStatus: assignment.status,
      });
    }

    // ── level 3, only when there is something to reverse ────────────────
    // Locked before `clawback()` (which re-locks the same row internally,
    // idempotently) so the streak fields read below are consistent with the
    // reversal that is about to happen in the same transaction.
    const memberLock = await lockMember(tx, input.householdId, assignment.memberId);
    if (memberLock === null) throw new NotFoundError('Mitglied nicht gefunden.');

    const reversed = await clawback(tx, {
      householdId: input.householdId,
      assignmentId: assignment.id,
      memberId: assignment.memberId,
      instanceId: instance.id,
      kind: assignment.kind,
      actorMemberId: input.actorMemberId,
      actorIsAdmin: true,
      description: 'Rücknahme der Belohnung: Erledigung abgelehnt',
    });

    // Streak state rollback — see the module docstring for the REOFFER_MARKET
    // vs REASSIGN_TO_MEMBER asymmetry this implements.
    let nextStreak: StreakState = {
      length: memberLock.streakLength,
      lastActiveDate: memberLock.streakLastActiveDate,
      bonusPaidDate: memberLock.streakBonusPaidDate,
    };
    if (reversed.streak !== null) {
      const completionDay = dayKey(assignment.completedAt ?? now, input.timezone);
      nextStreak = clearBonusForDay(nextStreak, completionDay);
    }
    if (input.outcome === 'REOFFER_MARKET') {
      nextStreak = ZERO_STREAK;
    }
    const streakChanged =
      nextStreak.length !== memberLock.streakLength ||
      nextStreak.lastActiveDate !== memberLock.streakLastActiveDate ||
      nextStreak.bonusPaidDate !== memberLock.streakBonusPaidDate;
    if (streakChanged) {
      await tx.householdMember.updateMany({
        where: { id: assignment.memberId, householdId: input.householdId },
        data: {
          streakLength: nextStreak.length,
          streakLastActiveDate: nextStreak.lastActiveDate,
          streakBonusPaidDate: nextStreak.bonusPaidDate,
        },
      });
    }

    const closedRejected = await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'COMPLETED' },
      data: { status: 'REJECTED' },
    });
    if (closedRejected.count === 0) {
      throw new ConflictError(
        'ASSIGNMENT_CLOSED',
        'Diese Erledigung wurde inzwischen bereits bearbeitet.',
        { currentStatus: 'REJECTED' },
      );
    }

    const member = await tx.householdMember.findFirst({
      where: { id: assignment.memberId, householdId: input.householdId },
      select: { displayName: true },
    });

    const history: HistoryDraft[] = [
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        type: 'COMPLETION_REJECTED',
        payload: {
          memberId: assignment.memberId,
          memberName: member?.displayName ?? '',
          reason: input.reason,
        },
      },
      ...(reversed.reward
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
              type: 'POINTS_CLAWED_BACK',
              payload: {
                memberId: assignment.memberId,
                amount: reversed.reward.amount,
                transactionId: reversed.reward.transactionId,
              },
            },
          ]
        : []),
      ...(reversed.streak
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
              type: 'POINTS_CLAWED_BACK',
              payload: {
                memberId: assignment.memberId,
                amount: reversed.streak.amount,
                transactionId: reversed.streak.transactionId,
              },
            },
          ]
        : []),
    ];

    let newAssignmentId: string | null = null;

    if (input.outcome === 'REASSIGN_TO_MEMBER') {
      // Pinned like any other fresh voluntary takeover (§5.5) — the current
      // config, not the rejected assignment's, which the reward invariant has
      // already retired.
      const current = await configFor(tx, input.householdId, ConfigDecision.VOLUNTARY_REWARD);

      const reopened = await tx.taskInstance.updateMany({
        where: {
          id: instance.id,
          householdId: input.householdId,
          status: 'COMPLETED',
          version: instance.version,
        },
        data: {
          status: 'ASSIGNED',
          completedAt: null,
          completedByMemberId: null,
          closedAt: null,
          version: { increment: 1 },
        },
      });
      if (reopened.count === 0) {
        throw new ConflictError('STALE_VIEW', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
          currentVersion: instance.version,
        });
      }

      const created = await tx.taskAssignment.create({
        data: {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          memberId: assignment.memberId,
          kind: AssignmentKind.VOLUNTARY,
          status: 'ACTIVE',
          response: 'ACCEPTED',
          activeForInstanceId: instance.id,
          valueAtAssignment: instance.currentValue,
          configVersion: current.version,
          assignedAt: now,
          respondedAt: now,
        },
      });
      newAssignmentId = created.id;

      history.push({
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: created.id,
        memberId: assignment.memberId,
        type: 'REOPENED_TO_ASSIGNEE',
        payload: {
          memberId: assignment.memberId,
          memberName: member?.displayName ?? '',
          value: instance.currentValue,
        },
      });
    } else {
      // REOFFER_MARKET — pinned to the instance, like any other re-offer
      // (§5.5, mirrors reopen.ts's release/revoke path).
      const pinned = await configFor(tx, input.householdId, ConfigDecision.OFFER_DURATION, {
        instanceConfigVersion: instance.configVersion,
      });
      const offerExpires = new Date(
        now.getTime() + pinned.config.assignment.offerDurationMinutes * 60_000,
      );

      const reopened = await tx.taskInstance.updateMany({
        where: {
          id: instance.id,
          householdId: input.householdId,
          status: 'COMPLETED',
          version: instance.version,
        },
        data: {
          status: 'AVAILABLE',
          completedAt: null,
          completedByMemberId: null,
          closedAt: null,
          offerExpiresAt: offerExpires,
          version: { increment: 1 },
        },
      });
      if (reopened.count === 0) {
        throw new ConflictError('STALE_VIEW', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
          currentVersion: instance.version,
        });
      }

      history.push({
        householdId: input.householdId,
        taskInstanceId: instance.id,
        type: 'RE_OFFERED',
        payload: { value: instance.currentValue, offerExpiresAt: offerExpires.toISOString() },
      });
    }

    await writeHistory(tx, history);

    const totalClawedBack = (reversed.reward?.amount ?? 0) + (reversed.streak?.amount ?? 0);

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'TASK_COMPLETION_REJECTED',
      entityType: 'TaskInstance',
      entityId: instance.id,
      payload: {
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        reason: input.reason,
        clawedBack: totalClawedBack,
        streakClawedBack: reversed.streak?.amount ?? 0,
        streakBroken: input.outcome === 'REOFFER_MARKET',
        outcome: input.outcome,
        newAssignmentId,
      },
    });

    return {
      instanceId: instance.id,
      assignmentId: assignment.id,
      memberId: assignment.memberId,
      clawedBack: totalClawedBack,
      outcome: input.outcome,
      status: nextStatus,
      newAssignmentId,
    };
  });
}
