/**
 * Punkte-Shop DTOs (intake "points-shop-real-life-rewards", extended by
 * "points-shop-virtual-gamification-items").
 *
 * `cost` on `RewardShopItemDto` is the server's current price for the item —
 * the client displays it and echoes nothing back; `PurchaseRewardResultDto`
 * carries the price actually charged (§36 — the server is the sole authority).
 *
 * The `effect*` fields are present (non-null) only when `kind ===
 * 'VIRTUAL_EFFECT'` — the shop lists what a potion *would* do before purchase
 * (§31), the same way a buyout quote states its consequence up front.
 */

export interface RewardShopItemDto {
  id: string;
  title: string;
  description: string | null;
  cost: number;
  kind: 'MANUAL_FULFILLMENT' | 'VIRTUAL_EFFECT';
  effectType: 'IMMUNITY' | 'MULTIPLIER' | null;
  effectDurationMinutes: number | null;
  effectCharges: number | null;
  effectMultiplier: number | null;
}

export interface PurchaseRewardResultDto {
  redemptionId: string;
  cost: number;
  balanceAfter: number;
  /** `null` for a `MANUAL_FULFILLMENT` purchase — nothing became active. */
  activatedEffect: MemberEffectDto | null;
}

/**
 * One active effect on the current member — what `GET /dashboard` shows so a
 * member can see remaining time/charges before acting (§31), and what a
 * `VIRTUAL_EFFECT` purchase's `activatedEffect` echoes back immediately.
 */
export interface MemberEffectDto {
  id: string;
  type: 'IMMUNITY' | 'MULTIPLIER';
  /** MULTIPLIER only. */
  multiplierValue: number | null;
  /** MULTIPLIER only — charges left out of `totalCharges`. */
  chargesRemaining: number | null;
  /** MULTIPLIER only — the item's `effectCharges` at purchase time, for "n von total". */
  totalCharges: number | null;
  expiresAt: string;
}
