/**
 * Punkte-Shop DTOs (intake "points-shop-real-life-rewards").
 *
 * `cost` on `RewardShopItemDto` is the server's current price for the item —
 * the client displays it and echoes nothing back; `PurchaseRewardResultDto`
 * carries the price actually charged (§36 — the server is the sole authority).
 */

export interface RewardShopItemDto {
  id: string;
  title: string;
  description: string | null;
  cost: number;
}

export interface PurchaseRewardResultDto {
  redemptionId: string;
  cost: number;
  balanceAfter: number;
}
