/**
 * Release (T9), revoke (T10) and accept (T6).
 *
 * Release and revoke are the same transaction with a different actor and a
 * different audit trail, so they share one implementation. Both are **free**:
 * PRD §3B is explicit that handing back a task you volunteered for costs
 * nothing and changes no value — charging for it would punish volunteering,
 * which is the opposite of what the whole economy is for.
 *
 * The one subtlety is the clawback. Under `rewardTiming = ON_ACCEPT` the
 * member was already paid at takeover; releasing without reversing that would
 * turn "volunteer, then release" into a way to farm points. The reversal is a
 * `CORRECTION` ledger row (PRD §3C), never a deletion — §14 forbids making
 * points disappear without a trace.
 */

import { RewardTiming } from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../domain/errors.js';
import { resolve, TaskEvent } from '../../domain/task/state-machine.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory } from '../events.js';
import { clawback } from '../points/clawback.js';
import { lockAssignment, lockInstance, withTransaction } from '../tx.js';

export interface ReleaseInput {
  householdId: string;
  timezone: string;
  actorMemberId: string;
  actorIsAdmin: boolean;
  instanceId: string;
  assignmentId: string;
  /** ADMIN revoke only. */
  reason?: string | null;
  mode: 'RELEASE' | 'REVOKE';
}

export interface ReleaseResult {
  instanceId: string;
  status: string;
  currentValue: number;
  clawedBack: number;
}

export async function releaseOrRevokeAssignment(
  deps: Deps,
  input: ReleaseInput,
): Promise<ReleaseResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── level 1 ─────────────────────────────────────────────────────────
    const instance = await lockInstance(tx, input.householdId, input.instanceId);
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    await deps.hooks?.afterLock?.();

    if (instance.status !== 'ASSIGNED') {
      throw new ConflictError('ILLEGAL_TRANSITION', 'Die Aufgabe ist nicht zugewiesen.', {
        from: instance.status,
        event: input.mode === 'RELEASE' ? TaskEvent.RELEASE : TaskEvent.REVOKE,
      });
    }
    resolve(
      instance.status as never,
      input.mode === 'RELEASE' ? TaskEvent.RELEASE : TaskEvent.REVOKE,
    );

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

    const pinned = await configFor(tx, input.householdId, ConfigDecision.CLAWBACK, {
      assignmentConfigVersion: assignment.configVersion,
      instanceConfigVersion: instance.configVersion,
    });

    if (input.mode === 'RELEASE') {
      if (assignment.memberId !== input.actorMemberId) {
        throw new ForbiddenError('NOT_ASSIGNEE', 'Diese Zuweisung gehört dir nicht.');
      }
      // PRD §3B — a random assignment is bought out, not released. Otherwise
      // the buyout price would be optional, and §44's economy would collapse.
      if (assignment.kind !== 'VOLUNTARY') {
        throw new ConflictError(
          'NOT_VOLUNTARY',
          'Zufällig zugewiesene Aufgaben können nur freigekauft werden.',
          { kind: assignment.kind },
        );
      }
      if (!pinned.config.voluntary.allowRelease) {
        throw new ForbiddenError('RELEASE_DISABLED', 'Zurückgeben ist deaktiviert.');
      }
    }

    const closed = await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
      data: {
        status: input.mode === 'RELEASE' ? 'RELEASED' : 'REVOKED',
        closedAt: now,
        activeForInstanceId: null,
      },
    });
    if (closed.count === 0) {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist bereits geschlossen.', {
        currentStatus: assignment.status,
      });
    }

    // ── level 3, only if an ON_ACCEPT reward has to be reversed ─────────
    const reversed =
      pinned.config.voluntary.rewardTiming === RewardTiming.ON_ACCEPT
        ? await clawback(tx, {
            householdId: input.householdId,
            assignmentId: assignment.id,
            memberId: assignment.memberId,
            instanceId: instance.id,
            kind: assignment.kind,
            actorMemberId: input.actorMemberId,
            actorIsAdmin: input.actorIsAdmin,
            description: 'Rücknahme der Belohnung bei Rückgabe der Aufgabe',
          })
        : null;

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
      // No value change on either path (PRD §3B): only a buyout raises a value.
      data: { status: 'AVAILABLE', offerExpiresAt: offerExpires, version: { increment: 1 } },
    });
    if (reopened.count === 0) {
      throw new ConflictError('TASK_NOT_AVAILABLE', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
        currentStatus: instance.status,
        heldBy: null,
      });
    }

    const member = await tx.householdMember.findFirst({
      where: { id: assignment.memberId, householdId: input.householdId },
      select: { displayName: true },
    });

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        type: input.mode === 'RELEASE' ? 'RELEASED' : 'REVOKED',
        payload: {
          memberId: assignment.memberId,
          memberName: member?.displayName ?? '',
          reason: input.reason ?? null,
        },
      },
      ...(reversed
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
              type: 'POINTS_CLAWED_BACK',
              payload: {
                memberId: assignment.memberId,
                amount: reversed.amount,
                transactionId: reversed.transactionId,
              },
            },
          ]
        : []),
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        type: 'RE_OFFERED',
        payload: { value: instance.currentValue, offerExpiresAt: offerExpires.toISOString() },
      },
    ]);

    if (input.mode === 'REVOKE') {
      await writeAudit(tx, {
        householdId: input.householdId,
        actorType: 'ADMIN',
        actorMemberId: input.actorMemberId,
        action: 'ASSIGNMENT_REVOKED',
        entityType: 'TaskAssignment',
        entityId: assignment.id,
        payload: { reason: input.reason ?? null, clawedBack: reversed?.amount ?? 0 },
      });
    }

    return {
      instanceId: instance.id,
      status: 'AVAILABLE',
      currentValue: instance.currentValue,
      clawedBack: reversed?.amount ?? 0,
    };
  });
}

/**
 * T6 — accepting an imposed assignment.
 *
 * Deliberately **not** a state transition (OQ-3): it sets
 * `TaskAssignment.response`, records accountability and drives the UI, but an
 * `ACCEPTED` instance state would add eleven rows to the legality matrix to
 * encode a distinction nothing queries.
 */
export async function acceptAssignment(
  deps: Deps,
  input: { householdId: string; memberId: string; assignmentId: string },
): Promise<{ id: string; response: string }> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    const assignment = await lockAssignment(tx, input.householdId, input.assignmentId);
    if (assignment === null) throw new NotFoundError('Zuweisung nicht gefunden.');
    if (assignment.memberId !== input.memberId) {
      throw new ForbiddenError('NOT_ASSIGNEE', 'Diese Zuweisung gehört dir nicht.');
    }
    if (assignment.status !== 'ACTIVE') {
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist bereits geschlossen.', {
        currentStatus: assignment.status,
      });
    }
    if (assignment.response === 'ACCEPTED') {
      return { id: assignment.id, response: 'ACCEPTED' };
    }

    await tx.taskAssignment.updateMany({
      where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
      data: { response: 'ACCEPTED', respondedAt: now },
    });

    const member = await tx.householdMember.findFirst({
      where: { id: input.memberId, householdId: input.householdId },
      select: { displayName: true },
    });

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: assignment.taskInstanceId,
        assignmentId: assignment.id,
        memberId: input.memberId,
        type: 'ASSIGNMENT_ACCEPTED',
        payload: { memberId: input.memberId, memberName: member?.displayName ?? '' },
      },
    ]);

    return { id: assignment.id, response: 'ACCEPTED' };
  });
}
