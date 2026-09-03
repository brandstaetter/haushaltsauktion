/**
 * Punkte-Shop: Kauf einer Belohnung (intake "points-shop-real-life-rewards").
 *
 * Ledger-only, wie `adjustPoints` — nimmt nur das Level-3-Lock auf dem
 * Mitglied und kann daher nie die wartende Hälfte eines Deadlocks sein
 * (§4.2). Der Preis wird bei jedem Kauf frisch aus `RewardDefinition.cost`
 * gelesen und auf der Einlösung eingefroren (`costAtPurchase`) — Vorbild
 * `TaskAssignment.valueAtAssignment` — damit eine spätere Preisänderung nie
 * rückwirkend für einen schon gebuchten Kauf gilt.
 */

import { NotFoundError } from '../../domain/errors.js';
import { assertRewardPurchaseAllowed } from '../../domain/rewards/rules.js';
import { loadCurrentConfig } from '../config/load.js';
import type { Deps } from '../deps.js';
import { writeAudit } from '../events.js';
import { postTransaction } from '../points/postTransaction.js';
import { lockMember, withTransaction } from '../tx.js';

export interface PurchaseRewardInput {
  householdId: string;
  memberId: string;
  rewardDefinitionId: string;
}

export interface PurchaseRewardResult {
  redemptionId: string;
  cost: number;
  balanceAfter: number;
}

export async function purchaseReward(
  deps: Deps,
  input: PurchaseRewardInput,
): Promise<PurchaseRewardResult> {
  const now = deps.clock.now();

  return withTransaction(deps, async (tx) => {
    // ── level 3 ──────────────────────────────────────────────────────────
    const member = await lockMember(tx, input.householdId, input.memberId);
    if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');

    // Read unlocked, same discipline as `executeBuyout`'s `definition.buyoutEnabled`
    // read: a concurrent admin price edit racing this purchase is an accepted,
    // pre-existing risk profile, not a new one.
    const reward = await tx.rewardDefinition.findFirst({
      where: { id: input.rewardDefinitionId, householdId: input.householdId, isActive: true },
      select: { id: true, title: true, cost: true },
    });
    if (reward === null) throw new NotFoundError('Belohnung nicht gefunden.');

    const { config } = await loadCurrentConfig(tx, input.householdId);
    assertRewardPurchaseAllowed(config, { balance: member.pointsCache, cost: reward.cost });

    const redemption = await tx.rewardRedemption.create({
      data: {
        householdId: input.householdId,
        rewardDefinitionId: reward.id,
        memberId: input.memberId,
        costAtPurchase: reward.cost,
        status: 'PENDING',
        purchasedAt: now,
      },
      select: { id: true },
    });

    const debit = await postTransaction(tx, {
      householdId: input.householdId,
      memberId: input.memberId,
      amount: -reward.cost,
      type: 'REWARD_REDEMPTION',
      rewardRedemptionId: redemption.id,
      initiatorMemberId: input.memberId,
      initiatorType: 'MEMBER',
      idempotencyKey: `reward-redemption:${redemption.id}`,
      description: `Punkte-Shop: ${reward.title}`,
    });

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'MEMBER',
      actorMemberId: input.memberId,
      action: 'REWARD_PURCHASED',
      entityType: 'RewardRedemption',
      entityId: redemption.id,
      payload: {
        rewardDefinitionId: reward.id,
        title: reward.title,
        cost: reward.cost,
        transactionId: debit.id,
      },
    });

    return { redemptionId: redemption.id, cost: reward.cost, balanceAfter: debit.balanceAfter };
  });
}
