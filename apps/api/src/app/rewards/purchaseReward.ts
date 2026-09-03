/**
 * Punkte-Shop: Kauf einer Belohnung (intake "points-shop-real-life-rewards",
 * erweitert um virtuelle Effekte durch "points-shop-virtual-gamification-items").
 *
 * Ledger-only, wie `adjustPoints` — nimmt nur das Level-3-Lock auf dem
 * Mitglied und kann daher nie die wartende Hälfte eines Deadlocks sein
 * (§4.2). Der Preis wird bei jedem Kauf frisch aus `RewardDefinition.cost`
 * gelesen und auf der Einlösung eingefroren (`costAtPurchase`) — Vorbild
 * `TaskAssignment.valueAtAssignment` — damit eine spätere Preisänderung nie
 * rückwirkend für einen schon gebuchten Kauf gilt.
 *
 * Debit und Audit sind für beide `RewardKind`-Varianten identisch (§6.12) —
 * nur was NACH dem Debit passiert, unterscheidet sich: `MANUAL_FULFILLMENT`
 * bleibt PENDING für den Admin-Erfüllungsschritt (`fulfillRedemption.ts`),
 * `VIRTUAL_EFFECT` schließt sich selbst sofort ab (FULFILLED, kein
 * `fulfilledByMemberId` — System-, nicht Admin-erfüllt) und legt in derselben
 * Transaktion die `MemberEffect`-Zeile an. Die `MemberEffect`-Schreibung
 * reitet auf dem Level-3-Lock, das oben bereits genommen wurde — kein neues
 * Lock-Level (§4.2).
 */

import type { MemberEffectDto } from '@haushaltsauktion/shared';

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
  /** `null` for a `MANUAL_FULFILLMENT` purchase — nothing became active. */
  activatedEffect: MemberEffectDto | null;
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
      select: {
        id: true,
        title: true,
        cost: true,
        kind: true,
        effectType: true,
        effectDurationMinutes: true,
        effectCharges: true,
        effectMultiplier: true,
      },
    });
    if (reward === null) throw new NotFoundError('Belohnung nicht gefunden.');

    const { config } = await loadCurrentConfig(tx, input.householdId);
    assertRewardPurchaseAllowed(config, { balance: member.pointsCache, cost: reward.cost });

    const isVirtualEffect = reward.kind === 'VIRTUAL_EFFECT';

    const redemption = await tx.rewardRedemption.create({
      data: {
        householdId: input.householdId,
        rewardDefinitionId: reward.id,
        memberId: input.memberId,
        costAtPurchase: reward.cost,
        // A virtual effect has no admin fulfillment step at all — it becomes
        // active in this same transaction, so its redemption is FULFILLED
        // from the moment it exists. `fulfilledByMemberId` stays null: this
        // is system-fulfilled, not admin-fulfilled (fulfillRedemption.ts).
        status: isVirtualEffect ? 'FULFILLED' : 'PENDING',
        purchasedAt: now,
        fulfilledAt: isVirtualEffect ? now : null,
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
        kind: reward.kind,
        transactionId: debit.id,
      },
    });

    let activatedEffect: MemberEffectDto | null = null;
    if (isVirtualEffect && reward.effectType !== null && reward.effectDurationMinutes !== null) {
      const expiresAt = new Date(now.getTime() + reward.effectDurationMinutes * 60_000);
      const isMultiplier = reward.effectType === 'MULTIPLIER';

      const effect = await tx.memberEffect.create({
        data: {
          householdId: input.householdId,
          memberId: input.memberId,
          type: reward.effectType,
          rewardRedemptionId: redemption.id,
          // MULTIPLIER only — both null for IMMUNITY (§6.12: expiresAt alone
          // carries the full meaning of an immunity effect).
          multiplierValue: isMultiplier ? reward.effectMultiplier : null,
          chargesRemaining: isMultiplier ? reward.effectCharges : null,
          expiresAt,
        },
        select: { id: true, type: true, multiplierValue: true, chargesRemaining: true, expiresAt: true },
      });

      await writeAudit(tx, {
        householdId: input.householdId,
        actorType: 'MEMBER',
        actorMemberId: input.memberId,
        action: 'MEMBER_EFFECT_ACTIVATED',
        entityType: 'MemberEffect',
        entityId: effect.id,
        payload: {
          rewardRedemptionId: redemption.id,
          rewardDefinitionId: reward.id,
          effectType: effect.type,
          expiresAt: effect.expiresAt.toISOString(),
          multiplierValue: effect.multiplierValue,
          charges: effect.chargesRemaining,
        },
      });

      activatedEffect = {
        id: effect.id,
        type: effect.type as 'IMMUNITY' | 'MULTIPLIER',
        multiplierValue: effect.multiplierValue,
        chargesRemaining: effect.chargesRemaining,
        // The full amount granted equals the item's own `effectCharges` at
        // the moment of this purchase — no separate read needed.
        totalCharges: isMultiplier ? reward.effectCharges : null,
        expiresAt: effect.expiresAt.toISOString(),
      };
    }

    return {
      redemptionId: redemption.id,
      cost: reward.cost,
      balanceAfter: debit.balanceAfter,
      activatedEffect,
    };
  });
}
