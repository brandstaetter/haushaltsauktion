/**
 * `POST /api/admin/rewards/redemptions/:id/fulfill` (intake
 * "points-shop-real-life-rewards").
 *
 * No ledger write — fulfillment is a status flip, not a points movement (the
 * debit already happened at purchase time). Race-safety comes from the
 * `updateMany` guarded by `status: 'PENDING'`, the same compare-and-set shape
 * `admin.ts`'s `instanceAction` uses: two concurrent fulfillments race the
 * same WHERE clause, and only one `count` comes back `1`.
 */

import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { Deps } from '../deps.js';

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

  const existing = await deps.db.rewardRedemption.findFirst({
    where: { id: input.redemptionId, householdId: input.householdId },
    select: { id: true, status: true, memberId: true, costAtPurchase: true },
  });
  if (existing === null) throw new NotFoundError('Einlösung nicht gefunden.');

  const { count } = await deps.db.rewardRedemption.updateMany({
    where: { id: input.redemptionId, householdId: input.householdId, status: 'PENDING' },
    data: { status: 'FULFILLED', fulfilledAt: now, fulfilledByMemberId: input.actorMemberId },
  });
  if (count === 0) {
    throw new ConflictError('REDEMPTION_CLOSED', 'Diese Einlösung wurde bereits bearbeitet.', {
      currentStatus: existing.status,
    });
  }

  await deps.db.auditEvent.create({
    data: {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'REWARD_FULFILLED',
      entityType: 'RewardRedemption',
      entityId: input.redemptionId,
      payload: { memberId: existing.memberId, cost: existing.costAtPurchase },
    },
  });

  return { id: input.redemptionId, status: 'FULFILLED' };
}
