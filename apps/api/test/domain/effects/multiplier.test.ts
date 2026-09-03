/**
 * §6.12 — the reward-multiplier arithmetic (intake
 * "points-shop-virtual-gamification-items").
 */

import { describe, expect, it } from 'vitest';

import { applyRewardMultiplier } from '../../../src/domain/effects/multiplier.js';

describe('applyRewardMultiplier', () => {
  it('passes the award through unchanged when there is no active effect', () => {
    expect(applyRewardMultiplier(6, null)).toBe(6);
  });

  it('multiplies by the configured factor', () => {
    expect(applyRewardMultiplier(6, { multiplierValue: 1.5, chargesRemaining: 3 })).toBe(9);
    expect(applyRewardMultiplier(4, { multiplierValue: 2, chargesRemaining: 1 })).toBe(8);
  });

  it('rounds to the nearest integer', () => {
    // 5 * 1.5 = 7.5 -> 8
    expect(applyRewardMultiplier(5, { multiplierValue: 1.5, chargesRemaining: 1 })).toBe(8);
    // 3 * 1.5 = 4.5 -> 5 (JS Math.round rounds .5 up)
    expect(applyRewardMultiplier(3, { multiplierValue: 1.5, chargesRemaining: 1 })).toBe(5);
  });

  it('a multiplier of exactly 1 changes nothing', () => {
    expect(applyRewardMultiplier(7, { multiplierValue: 1, chargesRemaining: 1 })).toBe(7);
  });

  it('an award of 0 stays 0 regardless of the multiplier', () => {
    // Belt-and-braces: completeTask.ts never calls this for award === 0 (a
    // RANDOM completion never reaches it), but the pure function itself must
    // not manufacture points out of nothing.
    expect(applyRewardMultiplier(0, { multiplierValue: 1.5, chargesRemaining: 1 })).toBe(0);
  });
});
