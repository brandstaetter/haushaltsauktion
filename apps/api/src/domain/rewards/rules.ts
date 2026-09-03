/**
 * Punkte-Shop purchase permission rules (intake "points-shop-real-life-rewards").
 *
 * Deliberately simpler than `domain/buyout/rules.ts`: a reward's price is a
 * plain admin-set field, not a config-driven formula, so there is no quote
 * step and no denial-reason enum to thread through a confirm screen — only
 * "is the shop on" and "can this balance afford it".
 */

import type { HouseholdConfig } from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError } from '../errors.js';

/**
 * The lowest balance a member may be left with after a redemption debit.
 *
 * Mirrors `buyout/rules.ts`'s `minimumAllowedBalance`, but reads `cfg.rewards`
 * — its own balance guard, not the buyout one (see `RewardsConfig`'s doc).
 */
export function minimumAllowedRewardsBalance(cfg: HouseholdConfig): number {
  if (!cfg.rewards.allowNegativeBalance) return cfg.rewards.minimumBalance;
  return -(cfg.rewards.maximumDebt ?? 0);
}

export function canAffordReward(cfg: HouseholdConfig, balance: number, cost: number): boolean {
  return balance - cost >= minimumAllowedRewardsBalance(cfg);
}

export interface RewardPurchaseRuleInput {
  balance: number;
  cost: number;
}

/** The throwing form `purchaseReward` calls. */
export function assertRewardPurchaseAllowed(
  cfg: HouseholdConfig,
  input: RewardPurchaseRuleInput,
): void {
  if (!cfg.rewards.enabled) {
    throw new ForbiddenError('REWARDS_DISABLED', 'Der Punkte-Shop ist im Haushalt deaktiviert.');
  }
  if (!canAffordReward(cfg, input.balance, input.cost)) {
    throw new ConflictError('INSUFFICIENT_POINTS', 'Nicht genügend Punkte für diese Belohnung.', {
      balance: input.balance,
      cost: input.cost,
      minimumBalance: minimumAllowedRewardsBalance(cfg),
    });
  }
}
