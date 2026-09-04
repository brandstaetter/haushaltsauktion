/**
 * Admin-initiated cancellation of an open instance (intake
 * "admin-cancel-or-sync-open-instances-on-definition-change").
 *
 * Extends the plain `DRAFT`/`AVAILABLE`/`PAUSED` cancel `instanceAction`
 * already had in `admin.ts` to also cover `ASSIGNED` (and, for multi-worker
 * tasks, any instance with active slots regardless of status) — the gap the
 * intake item named: an admin who changes a `TaskDefinition` mid-cycle
 * (§1.4) had no way to end an instance someone already holds, because
 * `instanceAction`'s `allowed.cancel` list only admitted statuses that could
 * never have an active `TaskAssignment`.
 *
 * Every currently `ACTIVE` assignment on the instance is closed as `REVOKED`
 * — same status and same clawback rule `releaseOrRevokeAssignment` (§3B/§14)
 * uses for a single admin-initiated revoke: an `ON_ACCEPT`-timed reward
 * already paid is reversed via a `CORRECTION` ledger row, never deleted.
 * Unlike a revoke, the instance itself always ends `CANCELLED` (terminal) —
 * it is never reopened for a fresh offer cycle, which is the whole point of
 * "cancel" as distinct from "unassign this one person and re-offer it".
 *
 * Deliberately only Option 1 of the intake's two proposed directions (manual
 * cancel). Option 2 (auto-syncing open instances when the definition
 * changes) was flagged in the intake as a materially larger, riskier change
 * — it can conflict with the very §1.4 invariant this file's own docstring
 * quotes — and was left for a separate future item rather than folded in
 * here.
 */

import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { ConfigDecision, configFor } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit, writeHistory, type HistoryDraft } from '../events.js';
import { clawback } from '../points/clawback.js';
import { lockActiveAssignmentsOfInstance, lockInstance, withTransaction } from '../tx.js';

const OPEN_STATUSES = new Set(['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED']);

export interface CancelInstanceInput {
  householdId: string;
  actorMemberId: string;
  instanceId: string;
  reason: string | null;
}

export interface CancelInstanceResult {
  id: string;
  status: 'CANCELLED';
  revokedAssignments: number;
  clawedBack: number;
}

export async function cancelInstance(
  deps: Deps,
  input: CancelInstanceInput,
): Promise<CancelInstanceResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── level 1 ─────────────────────────────────────────────────────────
    const instance = await lockInstance(tx, input.householdId, input.instanceId);
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    if (!OPEN_STATUSES.has(instance.status)) {
      throw new ConflictError('ILLEGAL_TRANSITION', `Aktion im Status ${instance.status} unzulässig.`, {
        from: instance.status,
        event: 'CANCEL',
      });
    }

    // ── level 2 — every slot this instance currently holds ────────────────
    const activeAssignments = await lockActiveAssignmentsOfInstance(
      tx,
      input.householdId,
      instance.id,
    );

    let clawedBackTotal = 0;
    if (activeAssignments.length > 0) {
      // Pinned to whichever assignment's own config decided its reward
      // timing at pickup — same reasoning as `reopen.ts`: an admin raising
      // `rewardTiming` later must not retroactively decide whether *this*
      // payout needs reversing.
      const historyDrafts: HistoryDraft[] = [];

      for (const assignment of activeAssignments) {
        const pinned = await configFor(tx, input.householdId, ConfigDecision.CLAWBACK, {
          assignmentConfigVersion: assignment.configVersion,
          instanceConfigVersion: instance.configVersion,
        });

        const reversed =
          pinned.config.voluntary.rewardTiming === 'ON_ACCEPT'
            ? await clawback(tx, {
                householdId: input.householdId,
                assignmentId: assignment.id,
                memberId: assignment.memberId,
                instanceId: instance.id,
                kind: assignment.kind,
                actorMemberId: input.actorMemberId,
                actorIsAdmin: true,
                description: 'Rücknahme der Belohnung bei Abbruch der Aufgabe durch Admin',
              })
            : null;
        if (reversed?.reward) clawedBackTotal += reversed.reward.amount;

        await tx.taskAssignment.updateMany({
          where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            closedAt: now,
            activeForInstanceId: null,
            activeSlotKey: null,
          },
        });

        const member = await tx.householdMember.findFirst({
          where: { id: assignment.memberId, householdId: input.householdId },
          select: { displayName: true },
        });

        historyDrafts.push({
          householdId: input.householdId,
          taskInstanceId: instance.id,
          assignmentId: assignment.id,
          memberId: assignment.memberId,
          type: 'REVOKED',
          payload: {
            memberId: assignment.memberId,
            memberName: member?.displayName ?? '',
            reason: input.reason,
          },
        });
        if (reversed?.reward) {
          historyDrafts.push({
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
          });
        }
      }

      await writeHistory(tx, historyDrafts);
    }

    // ── the instance itself, terminal ──────────────────────────────────
    const valueChanged = instance.currentValue !== instance.baseValue;
    const { count } = await tx.taskInstance.updateMany({
      where: { id: instance.id, householdId: input.householdId, version: instance.version },
      data: {
        status: 'CANCELLED',
        // PRD §3F precedent (the same reset the sweep's own expiry does,
        // `runAssignmentSweep.ts` T16-T18): an ended-uncompleted chore's
        // escalated value is discarded, not carried into whatever comes next.
        currentValue: instance.baseValue,
        activeSlotCount: 0,
        closedAt: now,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError('ILLEGAL_TRANSITION', 'Die Aufgabe hat sich zwischenzeitlich geändert.', {
        from: instance.status,
        event: 'CANCEL',
      });
    }
    await tx.taskDefinition.updateMany({
      where: { id: instance.taskDefinitionId, householdId: input.householdId },
      data: { carriedValue: null },
    });

    await writeHistory(tx, [
      {
        householdId: input.householdId,
        taskInstanceId: instance.id,
        type: 'CANCELLED',
        payload: { reason: input.reason },
      },
      ...(valueChanged
        ? [
            {
              householdId: input.householdId,
              taskInstanceId: instance.id,
              type: 'VALUE_RESET',
              payload: { from: instance.currentValue, to: instance.baseValue, strategy: 'BASE_VALUE' },
            },
          ]
        : []),
    ]);

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'INSTANCE_CANCELLED',
      entityType: 'TaskInstance',
      entityId: instance.id,
      payload: {
        reason: input.reason,
        revokedAssignments: activeAssignments.length,
        clawedBack: clawedBackTotal,
      },
    });

    return {
      id: instance.id,
      status: 'CANCELLED' as const,
      revokedAssignments: activeAssignments.length,
      clawedBack: clawedBackTotal,
    };
  });
}

/**
 * Bulk convenience for the intake's actual trigger case: an admin changed a
 * `TaskDefinition` and wants every currently open instance of it gone in one
 * action, not clicked one at a time. Each instance is its own transaction
 * (same reasoning as the sweep's one-instance-per-transaction discipline in
 * `runAssignmentSweep.ts`) — one instance's optimistic-lock conflict must
 * never abort the others.
 */
export async function cancelOpenInstancesOfDefinition(
  deps: Deps,
  input: { householdId: string; actorMemberId: string; taskDefinitionId: string; reason: string | null },
): Promise<{ cancelled: number; skipped: number }> {
  const open = await deps.db.taskInstance.findMany({
    where: {
      householdId: input.householdId,
      taskDefinitionId: input.taskDefinitionId,
      status: { in: [...OPEN_STATUSES] as never[] },
    },
    select: { id: true },
  });

  let cancelled = 0;
  let skipped = 0;
  for (const instance of open) {
    try {
      await cancelInstance(deps, {
        householdId: input.householdId,
        actorMemberId: input.actorMemberId,
        instanceId: instance.id,
        reason: input.reason,
      });
      cancelled += 1;
    } catch {
      // A concurrent change (e.g. someone volunteered/completed it between
      // the list read above and this instance's own transaction) — skip
      // rather than abort the rest of the batch.
      skipped += 1;
    }
  }
  return { cancelled, skipped };
}
