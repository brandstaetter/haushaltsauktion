/**
 * Punkte-Shop domain rules (intake "points-shop-real-life-rewards").
 *
 * Pure predicates over already-loaded numbers, mirroring
 * `test/domain/economy.test.ts`'s coverage of `domain/buyout/rules.ts`.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, cloneDefaultConfig, type HouseholdConfig } from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError } from '../../src/domain/errors.js';
import {
  assertRewardPurchaseAllowed,
  canAffordReward,
  minimumAllowedRewardsBalance,
} from '../../src/domain/rewards/rules.js';

const cfg: HouseholdConfig = DEFAULT_CONFIG;

describe('minimumAllowedRewardsBalance', () => {
  it('is minimumBalance when negative balances are disallowed (the default)', () => {
    expect(minimumAllowedRewardsBalance(cfg)).toBe(0);
  });

  it('is -maximumDebt when negative balances are allowed', () => {
    const negative = cloneDefaultConfig();
    negative.rewards.allowNegativeBalance = true;
    negative.rewards.maximumDebt = 10;
    expect(minimumAllowedRewardsBalance(negative)).toBe(-10);
  });
});

describe('canAffordReward', () => {
  it('allows a purchase that leaves the balance exactly at the floor', () => {
    expect(canAffordReward(cfg, 6, 6)).toBe(true);
  });

  it('rejects a purchase that would go below the floor', () => {
    expect(canAffordReward(cfg, 5, 6)).toBe(false);
  });
});

describe('assertRewardPurchaseAllowed', () => {
  it('throws REWARDS_DISABLED when the household switch is off', () => {
    const disabled = cloneDefaultConfig();
    disabled.rewards.enabled = false;
    expect(() => assertRewardPurchaseAllowed(disabled, { balance: 100, cost: 1 })).toThrow(
      ForbiddenError,
    );
  });

  it('throws INSUFFICIENT_POINTS with the balance/cost/minimumBalance detail', () => {
    try {
      assertRewardPurchaseAllowed(cfg, { balance: 4, cost: 6 });
      expect.unreachable('should have thrown INSUFFICIENT_POINTS');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe('INSUFFICIENT_POINTS');
      expect((err as ConflictError).details).toMatchObject({
        balance: 4,
        cost: 6,
        minimumBalance: 0,
      });
    }
  });

  it('allows a purchase that clears both checks', () => {
    expect(() => assertRewardPurchaseAllowed(cfg, { balance: 10, cost: 6 })).not.toThrow();
  });
});
