/**
 * Freikauf — T8 (Architektur §4.4, CLAUDE.md §8, §9, §10, §28, §44).
 *
 * Locks 1 → 2 → 3, never downwards, which together with the identical order in
 * `completeTask` is the *whole* deadlock argument (§4.2): the loser simply
 * blocks on the level-1 instance row until the winner commits.
 *
 * **Order is load-bearing.** The member is charged the *pre-increase* value and
 * the value is raised afterwards — §21's worked example is cost 6, resulting
 * value 9, not cost 9. Getting this backwards would silently overcharge every
 * buyout in the system.
 *
 * **The confirmation protocol** (§3.5, Reconciliation §1.1): the client submits
 * the two numbers it displayed. The server recomputes both from the pinned
 * config and rejects with `409 QUOTE_STALE` carrying the fresh quote if either
 * differs. The submitted numbers are only ever *compared* — never used in the
 * computation — so echoing them does not trust the client (§36).
 */

import type { BuyoutResultDto } from '@haushaltsauktion/shared';

import { assertBuyoutAllowed } from '../../domain/buyout/rules.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { buildInstanceDetail, findInstance } from '../queries/taskDto.js';
import {
  lockAssignment,
  lockInstance,
  lockMember,
  withTransaction,
} from '../tx.js';
import { buildQuote, loadQuoteCounters } from './quote.js';

export interface BuyoutInput {
  householdId: string;
  timezone: string;
  memberId: string;
  assignmentId: string;
  /** The exact numbers the client rendered. Compared, never used (§3.5). */
  acceptedCost: number;
  acceptedNewValue: number;
  ipAddress?: string | null;
}

export async function executeBuyout(deps: Deps, input: BuyoutInput): Promise<BuyoutResultDto> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // The assignment id is what the client holds, but the instance is level 1 —
    // so its id is read *without* a lock first, and the locks are then taken in
    // ascending order. Reading unlocked is safe: an assignment never moves to a
    // different instance.
    const preview = await tx.taskAssignment.findFirst({
      where: { id: input.assignmentId, householdId: input.householdId },
      select: { taskInstanceId: true },
    });
    if (preview === null) throw new NotFoundError('Zuweisung nicht gefunden.');

    // ── level 1 ─────────────────────────────────────────────────────────
    const instance = await lockInstance(tx, input.householdId, preview.taskInstanceId);
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    await deps.hooks?.afterLock?.();

    // ── level 2 ─────────────────────────────────────────────────────────
    const assignment = await lockAssignment(tx, input.householdId, input.assignmentId);
    if (assignment === null) throw new NotFoundError('Zuweisung nicht gefunden.');

    if (assignment.status !== 'ACTIVE') {
      // The double-tap case: two devices, one assignment. The second sees this.
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist nicht mehr offen.', {
        currentStatus: assignment.status,
      });
    }
    if (assignment.memberId !== input.memberId) {
      throw new ForbiddenError('NOT_ASSIGNEE', 'Diese Zuweisung gehört dir nicht.');
    }
    if (instance.status !== 'ASSIGNED') {
      throw new ConflictError('ILLEGAL_TRANSITION', 'Die Aufgabe ist nicht zugewiesen.', {
        from: instance.status,
        event: TaskEvent.BUYOUT,
      });
    }
    resolve(instance.status as never, TaskEvent.BUYOUT);

    // ── level 3 ─────────────────────────────────────────────────────────
    const member = await lockMember(tx, input.householdId, input.memberId);
    if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');

    const definition = await tx.taskDefinition.findFirst({
      where: { id: instance.taskDefinitionId, householdId: input.householdId },
      select: { title: true, buyoutEnabled: true },
    });
    if (definition === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    // §5.5 — PINNED to the assignment. An admin who changed the multiplier
    // while this member was looking at the sheet cannot change what they pay.
    const pinned = await configFor(tx, input.householdId, ConfigDecision.BUYOUT_COST, {
      assignmentConfigVersion: assignment.configVersion,
      instanceConfigVersion: instance.configVersion,
    });

    const counters = await loadQuoteCounters(tx, {
      householdId: input.householdId,
      memberId: input.memberId,
      timezone: input.timezone,
      now,
    });

    const quote = buildQuote(
      {
        assignmentId: assignment.id,
        kind: assignment.kind,
        assignmentStatus: assignment.status,
        memberId: assignment.memberId,
        householdId: input.householdId,
        currentValue: instance.currentValue,
        baseValue: instance.baseValue,
        buyoutCount: instance.buyoutCount,
        buyoutEnabledForDefinition: definition.buyoutEnabled,
        balance: member.pointsCache,
        configVersion: pinned.version,
        cfg: pinned.config,
        timezone: input.timezone,
        now,
      },
      counters,
    );

    // Every business rule, in the order §3.5's UI wants to explain them. This
    // throws the specific 4xx of §3.13 rather than a generic refusal.
    assertBuyoutAllowed(pinned.config, {
      kind: assignment.kind as never,
      buyoutEnabledForDefinition: definition.buyoutEnabled,
      balance: member.pointsCache,
      cost: quote.cost,
      currentValue: instance.currentValue,
      buyoutsThisWeek: counters.buyoutsThisWeek,
      consecutiveBuyouts: counters.consecutiveBuyouts,
    });

    // The confirmation check. Nothing has been written at this point, so a
    // mismatch leaves the world exactly as it was.
    if (
      input.acceptedCost !== quote.cost ||
      input.acceptedNewValue !== quote.newValue
    ) {
      throw new ConflictError(
        'QUOTE_STALE',
        'Die angezeigten Zahlen sind nicht mehr aktuell. Bitte bestätige erneut.',
        { quote: quote.dto },
      );
    }

    // ── writes, in lock order ───────────────────────────────────────────
    // Level 3 first: the debit. `idempotencyKey` makes a retried buyout a no-op
    // that reports the same result rather than a second charge (§8.2 step 7).
    const debit = await postTransaction(tx, {
      householdId: input.householdId,
      memberId: input.memberId,
      amount: -quote.cost,
      type: 'BUYOUT',
      taskInstanceId: instance.id,
      taskAssignmentId: assignment.id,
      assignmentKind: assignment.kind,
      initiatorMemberId: input.memberId,
      initiatorType: 'MEMBER',
      idempotencyKey: `buyout:${assignment.id}`,
      description: `Freikauf: ${definition.title}`,
    });

    const closedAssignments = await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
      data: {
        status: 'BOUGHT_OUT',
        closedAt: now,
        activeForInstanceId: null,
        buyoutCost: quote.cost,
        valueBeforeBuyout: instance.currentValue,
        valueAfterBuyout: quote.newValue,
      },
    });
    if (closedAssignments.count === 0) {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist nicht mehr offen.', {
        currentStatus: assignment.status,
      });
    }

    // §10 — the new offer cycle. The instance goes back to AVAILABLE at the
    // raised value, and the raised value is simultaneously the reward a later
    // volunteer earns (§44).
    const offerExpires = new Date(
      now.getTime() + pinned.config.assignment.offerDurationMinutes * 60_000,
    );
    const reopened = await tx.taskInstance.updateMany({
      where: {
        id: instance.id,
        householdId: input.householdId,
        status: 'ASSIGNED',
        version: instance.version,
      },
      data: {
        status: 'AVAILABLE',
        currentValue: quote.newValue,
        buyoutCount: { increment: 1 },
        offerExpiresAt: offerExpires,
        version: { increment: 1 },
      },
    });
    if (reopened.count === 0) {
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
        currentStatus: instance.status,
        heldBy: null,
      });
    }

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: assignment.id,
        memberId: input.memberId,
        type: 'BOUGHT_OUT',
        payload: {
          memberId: input.memberId,
          memberName: member.displayName,
          cost: quote.cost,
          transactionId: debit.id,
        },
      },
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: assignment.id,
        type: 'VALUE_INCREASED',
        payload: {
          from: instance.currentValue,
          to: quote.newValue,
          strategy: pinned.config.valueIncrease.strategy,
          multiplier: pinned.config.valueIncrease.multiplier,
        },
      },
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        type: 'RE_OFFERED',
        payload: { value: quote.newValue, offerExpiresAt: offerExpires.toISOString() },
      },
    ]);

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'MEMBER',
      actorMemberId: input.memberId,
      action: 'BUYOUT_EXECUTED',
      entityType: 'TaskAssignment',
      entityId: assignment.id,
      payload: {
        cost: quote.cost,
        valueBefore: instance.currentValue,
        valueAfter: quote.newValue,
        configVersion: pinned.version,
        transactionId: debit.id,
      },
      ipAddress: input.ipAddress ?? null,
    });

    // §24 — the household learns the chore just got more valuable, which is
    // what turns a buyout into an offer somebody else may want to take.
    const others = await tx.householdMember.findMany({
      where: { householdId: input.householdId, isActive: true, id: { not: input.memberId } },
      select: { id: true },
    });
    await deps.notifier.emit(
      tx,
      others.map((m) => ({
        householdId: input.householdId,
        memberId: m.id,
        type: 'TASK_VALUE_INCREASED',
        payload: { taskInstanceId: instance.id, from: instance.currentValue, to: quote.newValue },
        taskInstanceId: instance.id,
      })),
    );

    const reloaded = await findInstance(tx, input.householdId, instance.id);
    if (reloaded === null) throw new NotFoundError('Aufgabe nicht gefunden.');
    const detail = await buildInstanceDetail(
      tx,
      { householdId: input.householdId, memberId: input.memberId, timezone: input.timezone, now },
      reloaded,
      pinned.config,
      debit.balanceAfter,
    );

    return {
      instance: detail,
      transaction: {
        id: debit.id,
        amount: debit.amount,
        balanceBefore: debit.balanceBefore,
        balanceAfter: debit.balanceAfter,
        type: debit.type,
        createdAt: debit.createdAt.toISOString(),
      },
      balanceAfter: debit.balanceAfter,
      taskValueBefore: instance.currentValue,
      taskValueAfter: quote.newValue,
    };
  });
}
