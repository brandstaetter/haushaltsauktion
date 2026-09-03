/**
 * Reward-multiplier arithmetic (§6.12, intake
 * "points-shop-virtual-gamification-items").
 *
 * Mirrors `task/value.ts` and `streak/streak.ts`'s shape: pure, no Prisma, no
 * `Date`, no `Math.random` (§7.2). The caller (`completeTask.ts`) resolves
 * which effect (if any) applies and whether it is still within its charge
 * count and time window; this module only does the one multiplication.
 *
 * `effect === null` is the common case — most completions have no active
 * multiplier — and returns `baseAward` unchanged, so a caller can apply this
 * unconditionally without an `if` of its own.
 */

export interface MultiplierEffectState {
  multiplierValue: number;
  chargesRemaining: number;
}

/** `round(baseAward * multiplierValue)`. `effect === null` passes `baseAward` through. */
export function applyRewardMultiplier(
  baseAward: number,
  effect: MultiplierEffectState | null,
): number {
  if (effect === null) return baseAward;
  return Math.round(baseAward * effect.multiplierValue);
}
