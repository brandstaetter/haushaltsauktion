/**
 * `POST /api/admin/rewards/redemptions/:id/fulfill` (intake
 * "points-shop-real-life-rewards").
 *
 * No ledger write — fulfillment is a status flip, not a points movement (the
 * debit already happened at purchase time). Race-safety comes from the
 * `updateMany` guarded by `status: 'PENDING'`, the same compare-and-set shape
 * `admin.ts`'s `instanceAction` uses: two concurrent fulfillments race the
 * same WHERE clause, and only one `count` comes back `1`.
 *
 * The status flip and its audit entry commit together in one transaction —
 * a redemption must never end up FULFILLED with no matching audit row (§23),
 * which a bare `deps.db` write pair could leave behind if the audit insert
 * failed after the update had already committed.
 */

import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { Deps } from '../deps.js';
import { writeAudit } from '../events.js';
import { withTransaction } from '../tx.js';

export interface FulfillRedemptionInput {
  householdId: string;
  actorMemberId: string;
  redemptionId: string;
}

export interface FulfillRedemptionResult {
  id: string;
  status: 'FULFILLED';
}

export async function fulfillRedemption(
  deps: Deps,
  input: FulfillRedemptionInput,
): Promise<FulfillRedemptionResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    const existing = await tx.rewardRedemption.findFirst({
      where: { id: input.redemptionId, householdId: input.householdId },
      select: { id: true, status: true, memberId: true, costAtPurchase: true },
    });
    if (existing === null) throw new NotFoundError('Einlösung nicht gefunden.');

    const { count } = await tx.rewardRedemption.updateMany({
      where: { id: input.redemptionId, householdId: input.householdId, status: 'PENDING' },
      data: { status: 'FULFILLED', fulfilledAt: now, fulfilledByMemberId: input.actorMemberId },
    });
    if (count === 0) {
      // `existing.status` was read before the race, so a loser here — the
      // status flipped between that read and this updateMany — would report
      // the stale PENDING it started from. Re-read so the detail reflects what
      // actually closed the redemption (mirrors executeBuyout's ASSIGNMENT_CLOSED,
      // which reads its status under a row lock rather than from an earlier read).
      const current = await tx.rewardRedemption.findFirst({
        where: { id: input.redemptionId, householdId: input.householdId },
        select: { status: true },
      });
      throw new ConflictError('REDEMPTION_CLOSED', 'Diese Einlösung wurde bereits bearbeitet.', {
        currentStatus: current?.status ?? existing.status,
      });
    }

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'REWARD_FULFILLED',
      entityType: 'RewardRedemption',
      entityId: input.redemptionId,
      payload: { memberId: existing.memberId, cost: existing.costAtPurchase },
    });

    return { id: input.redemptionId, status: 'FULFILLED' };
  });
}
