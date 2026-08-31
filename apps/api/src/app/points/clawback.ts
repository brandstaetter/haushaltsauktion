/**
 * Reverse a paid reward, if one exists (PRD §3C, CLAUDE.md §14).
 *
 * Shared by two callers that both undo a `VOLUNTARY_TASK_REWARD` after the
 * fact: `releaseOrRevokeAssignment` (an `ON_ACCEPT` reward, given back when
 * the takeover is returned) and `rejectCompletion` (any reward, given back
 * when an admin judges the completion unsatisfactory). Both look up the same
 * `reward:<assignmentId>` row — the partial unique index guarantees at most
 * one exists per assignment regardless of which timing paid it — so one
 * idempotent implementation covers both.
 *
 * Idempotent by key: a retried caller cannot claw back twice, and it is a
 * no-op when no reward row exists to reverse (RANDOM assignments, or
 * `ON_COMPLETE` before completion).
 */

import type { PrismaTx } from '../deps.js';
import { postTransaction } from './postTransaction.js';

export interface ClawbackArgs {
  householdId: string;
  assignmentId: string;
  memberId: string;
  instanceId: string;
  kind: string;
  actorMemberId: string;
  actorIsAdmin: boolean;
  description: string;
}

export interface ClawbackResult {
  amount: number;
  transactionId: string;
}

export async function clawback(
  tx: PrismaTx,
  args: ClawbackArgs,
): Promise<ClawbackResult | null> {
  const reward = await tx.pointTransaction.findUnique({
    where: { idempotencyKey: `reward:${args.assignmentId}` },
    select: { amount: true },
  });
  if (reward === null || reward.amount <= 0) return null;

  const posted = await postTransaction(tx, {
    householdId: args.householdId,
    memberId: args.memberId,
    amount: -reward.amount,
    type: 'CORRECTION',
    taskInstanceId: args.instanceId,
    taskAssignmentId: args.assignmentId,
    assignmentKind: args.kind,
    initiatorMemberId: args.actorMemberId,
    initiatorType: args.actorIsAdmin ? 'ADMIN' : 'MEMBER',
    idempotencyKey: `clawback:${args.assignmentId}`,
    description: args.description,
  });
  return { amount: reward.amount, transactionId: posted.id };
}
