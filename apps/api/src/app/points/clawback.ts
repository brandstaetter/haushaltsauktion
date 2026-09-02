/**
 * Reverse whatever was paid for an assignment, if anything (PRD §3C,
 * CLAUDE.md §14).
 *
 * Shared by two callers that both undo an assignment's payout after the
 * fact: `releaseOrRevokeAssignment` (an `ON_ACCEPT` reward, given back when
 * the takeover is returned) and `rejectCompletion` (any reward, given back
 * when an admin judges the completion unsatisfactory). Both look up the same
 * `reward:<assignmentId>` / `streak:<assignmentId>` rows — the partial unique
 * indexes guarantee at most one of each exists per assignment — so one
 * idempotent implementation covers both.
 *
 * Idempotent by key: a retried caller cannot claw back twice, and each half
 * is a no-op when there is nothing to reverse (a RANDOM assignment never
 * earned either; a day-1 streak paid nothing and posted no `STREAK_BONUS`
 * row to begin with, §4.5).
 *
 * This only reverses the *transaction*. What a rejection does to the
 * member's streak *state* (length, last-active day) depends on the
 * rejection's outcome (`REOFFER_MARKET` vs `REASSIGN_TO_MEMBER`) — a decision
 * `releaseOrRevokeAssignment` has no equivalent of, so it stays in
 * `rejectCompletion.ts`, not here.
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

export interface ClawbackOutcome {
  /** The reversed `VOLUNTARY_TASK_REWARD`, or `null` if none was ever paid. */
  reward: ClawbackResult | null;
  /** The reversed `STREAK_BONUS` tied to the same assignment, or `null`. */
  streak: ClawbackResult | null;
}

async function reverseIfPresent(
  tx: PrismaTx,
  args: ClawbackArgs,
  originalKey: string,
  reversalKey: string,
): Promise<ClawbackResult | null> {
  const original = await tx.pointTransaction.findUnique({
    where: { idempotencyKey: originalKey },
    select: { amount: true },
  });
  if (original === null || original.amount <= 0) return null;

  const posted = await postTransaction(tx, {
    householdId: args.householdId,
    memberId: args.memberId,
    amount: -original.amount,
    type: 'CORRECTION',
    taskInstanceId: args.instanceId,
    taskAssignmentId: args.assignmentId,
    assignmentKind: args.kind,
    initiatorMemberId: args.actorMemberId,
    initiatorType: args.actorIsAdmin ? 'ADMIN' : 'MEMBER',
    idempotencyKey: reversalKey,
    description: args.description,
  });
  return { amount: original.amount, transactionId: posted.id };
}

export async function clawback(tx: PrismaTx, args: ClawbackArgs): Promise<ClawbackOutcome> {
  const reward = await reverseIfPresent(
    tx,
    args,
    `reward:${args.assignmentId}`,
    `clawback:${args.assignmentId}`,
  );
  const streak = await reverseIfPresent(
    tx,
    args,
    `streak:${args.assignmentId}`,
    `streak-clawback:${args.assignmentId}`,
  );
  return { reward, streak };
}
