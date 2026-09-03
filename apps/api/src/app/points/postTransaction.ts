/**
 * The single writer (Architektur §8.2, CLAUDE.md §14).
 *
 * **Nothing anywhere else touches `pointsCache`.** That is not a convention —
 * `verifyLedgerIntegrity` (§8.5) runs as a global `afterEach` over the whole
 * integration suite, and the runtime database role has no `UPDATE`/`DELETE`
 * grant on `point_transactions` (§8.6). This function is the only door.
 *
 * The caller list is closed and greppable: `volunteerForTask` (ON_ACCEPT only),
 * `completeTask` (voluntary only), `executeBuyout`, the clawback in
 * `releaseTask` / `revokeAssignment`, and `adjustPoints`.
 */

import type { PointTransaction } from '@prisma/client';

import { NotFoundError } from '../../domain/errors.js';
import { computePosting, previousTransactionIdFor } from '../../domain/points/ledger-math.js';
import type { PrismaTx } from '../deps.js';
import { lockMember } from '../tx.js';

export interface PostTransactionInput {
  householdId: string;
  memberId: string;
  /** Signed. Zero is rejected — see below. */
  amount: number;
  type: string;
  taskInstanceId?: string | null;
  taskAssignmentId?: string | null;
  /** Required iff `taskAssignmentId` is set; bound to it by a composite FK (§1.5). */
  assignmentKind?: string | null;
  /** Punkte-Shop (intake "points-shop-real-life-rewards"); required for REWARD_REDEMPTION. */
  rewardRedemptionId?: string | null;
  description?: string | null;
  initiatorMemberId?: string | null;
  initiatorType?: 'MEMBER' | 'ADMIN' | 'SYSTEM';
  /** `'buyout:<id>'`, `'reward:<id>'`, `'clawback:<id>'`, `'decay:<member>:<period>'`. */
  idempotencyKey?: string | null;
}

/**
 * Post one ledger entry and refresh the cache it justifies, inside the caller's
 * transaction.
 *
 * `amount === 0` is rejected (§8.2 step 1): §7's "keine Punkte" is the
 * *absence* of a row, and a zero-amount entry would blur that absence with a
 * real event — which is exactly the confusion §44's headline invariant exists
 * to prevent.
 */
export async function postTransaction(
  tx: PrismaTx,
  input: PostTransactionInput,
): Promise<PointTransaction> {
  // Step 2 (level 3, §4.2). The lock comes before the idempotency read so that
  // the check-then-insert below is atomic against another writer for the same
  // member. A missing row is a NotFoundError, which is also what enforces
  // household scope on every ledger write.
  const member = await lockMember(tx, input.householdId, input.memberId);
  if (member === null) {
    throw new NotFoundError('Mitglied nicht gefunden.', { memberId: input.memberId });
  }

  // Step 7, moved ahead of the insert. A unique violation inside Postgres
  // aborts the whole transaction, so it cannot be caught and recovered from
  // in-place; under the member lock a SELECT-then-INSERT is equivalent and
  // recoverable. The unique index remains the backstop that aborts a write
  // which somehow bypassed this path.
  if (input.idempotencyKey) {
    const existing = await tx.pointTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  // Steps 1 and 3. `computePosting` restates in code the CHECK constraints the
  // database enforces in SQL, so a violation surfaces as a readable domain
  // error at the call site instead of a raw SQLSTATE.
  const posting = computePosting({
    balanceBefore: member.pointsCache,
    amount: input.amount,
    type: input.type as never,
    taskAssignmentId: input.taskAssignmentId ?? null,
    assignmentKind: (input.assignmentKind ?? null) as never,
    rewardRedemptionId: input.rewardRedemptionId ?? null,
  });

  // Step 4 — the chain tail, or the literal 'GENESIS' (§8.3). NULL would let two
  // competing first entries coexist, since Postgres does not treat NULLs as equal.
  const tail = await tx.pointTransaction.findFirst({
    where: { householdId: input.householdId, memberId: input.memberId },
    orderBy: { seq: 'desc' },
    select: { id: true },
  });

  // Step 5.
  const created = await tx.pointTransaction.create({
    data: {
      householdId: input.householdId,
      memberId: input.memberId,
      amount: posting.amount,
      balanceBefore: posting.balanceBefore,
      balanceAfter: posting.balanceAfter,
      type: input.type as never,
      previousTransactionId: previousTransactionIdFor(tail),
      idempotencyKey: input.idempotencyKey ?? null,
      taskInstanceId: input.taskInstanceId ?? null,
      taskAssignmentId: input.taskAssignmentId ?? null,
      assignmentKind: (input.assignmentKind ?? null) as never,
      rewardRedemptionId: input.rewardRedemptionId ?? null,
      description: input.description ?? null,
      initiatorMemberId: input.initiatorMemberId ?? null,
      initiatorType: (input.initiatorType ?? 'MEMBER') as never,
    },
  });

  // Step 6 — an absolute write of the value just recorded, never `{ decrement }`,
  // so the cache cannot drift from the row that justifies it.
  await tx.householdMember.updateMany({
    where: { id: input.memberId, householdId: input.householdId },
    data: { pointsCache: posting.balanceAfter },
  });

  return created;
}
