/**
 * Buyout permission rules (Architektur §6.6, §4.4; CLAUDE.md §8).
 *
 * Pure predicates over already-loaded numbers. The use-case reads the balance
 * and the counters under a row lock and then asks these functions; nothing here
 * touches the database, which is what makes every branch unit-testable.
 */

import {
  AssignmentKind,
  BuyoutDenialReason,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { ConflictError, ForbiddenError } from '../errors.js';

export interface BuyoutRuleInput {
  kind: AssignmentKind;
  /** §8 "Freikauf bei bestimmten Aufgaben deaktiviert" — `TaskDefinition.buyoutEnabled`. */
  buyoutEnabledForDefinition: boolean;
  /** From the ledger cache, read under the level-3 lock (§4.2). */
  balance: number;
  cost: number;
  currentValue: number;
  /** ISO week in the household timezone (§5.6, OQ-6). */
  buyoutsThisWeek: number;
  /** Consecutive buyouts by this member, most recent first. */
  consecutiveBuyouts: number;
}

export interface BuyoutDecision {
  allowed: boolean;
  reason: BuyoutDenialReason | null;
}

/**
 * The lowest balance a member may be left with after a debit.
 *
 * With `allowNegativeBalance = false` this is `minimumBalance` (validated
 * `>= 0`); with it enabled, the floor is `-maximumDebt`, which validation
 * requires to be set.
 */
export function minimumAllowedBalance(cfg: HouseholdConfig): number {
  if (!cfg.buyout.allowNegativeBalance) return cfg.buyout.minimumBalance;
  return -(cfg.buyout.maximumDebt ?? 0);
}

export function canAfford(cfg: HouseholdConfig, balance: number, cost: number): boolean {
  return balance - cost >= minimumAllowedBalance(cfg);
}

/**
 * Evaluate every rule and report the **first** one that blocks, in the order
 * the UI wants to explain them (§3.5 `BuyoutQuoteDto.disallowedReason`).
 */
export function evaluateBuyoutRules(cfg: HouseholdConfig, input: BuyoutRuleInput): BuyoutDecision {
  // PRD §3B — a voluntary takeover is released, never bought out. Charging for
  // release would punish volunteering, which is the opposite of the point.
  if (input.kind !== AssignmentKind.RANDOM) {
    return { allowed: false, reason: BuyoutDenialReason.NOT_RANDOM_ASSIGNMENT };
  }
  if (!cfg.buyout.enabled) {
    return { allowed: false, reason: BuyoutDenialReason.BUYOUT_DISABLED_GLOBALLY };
  }
  if (!input.buyoutEnabledForDefinition) {
    return { allowed: false, reason: BuyoutDenialReason.BUYOUT_DISABLED_FOR_TASK };
  }
  // OQ-8: at the cap the value cannot rise, and a buyout that charges without
  // raising would break §44 silently.
  if (cfg.valueIncrease.maximumValue !== null && input.currentValue >= cfg.valueIncrease.maximumValue) {
    return { allowed: false, reason: BuyoutDenialReason.VALUE_CAP_REACHED };
  }
  if (
    cfg.buyout.maximumBuyoutsPerWeek !== null &&
    input.buyoutsThisWeek >= cfg.buyout.maximumBuyoutsPerWeek
  ) {
    return { allowed: false, reason: BuyoutDenialReason.WEEKLY_LIMIT_REACHED };
  }
  if (
    cfg.buyout.maximumConsecutiveBuyouts !== null &&
    input.consecutiveBuyouts >= cfg.buyout.maximumConsecutiveBuyouts
  ) {
    return { allowed: false, reason: BuyoutDenialReason.CONSECUTIVE_LIMIT_REACHED };
  }
  if (!canAfford(cfg, input.balance, input.cost)) {
    return { allowed: false, reason: BuyoutDenialReason.INSUFFICIENT_POINTS };
  }
  return { allowed: true, reason: null };
}

/** The throwing form used by `executeBuyout` (§4.4). Maps each reason to §3.13. */
export function assertBuyoutAllowed(cfg: HouseholdConfig, input: BuyoutRuleInput): void {
  const decision = evaluateBuyoutRules(cfg, input);
  if (decision.allowed) return;

  switch (decision.reason) {
    case BuyoutDenialReason.NOT_RANDOM_ASSIGNMENT:
      throw new ConflictError(
        'NOT_RANDOM_ASSIGNMENT',
        'Nur zufällig zugewiesene Aufgaben können freigekauft werden.',
        { kind: input.kind },
      );
    case BuyoutDenialReason.BUYOUT_DISABLED_GLOBALLY:
      throw new ForbiddenError('BUYOUT_DISABLED', 'Freikaufen ist im Haushalt deaktiviert.', {
        scope: 'GLOBAL',
      });
    case BuyoutDenialReason.BUYOUT_DISABLED_FOR_TASK:
      throw new ForbiddenError('BUYOUT_DISABLED', 'Diese Aufgabe kann nicht freigekauft werden.', {
        scope: 'TASK',
      });
    case BuyoutDenialReason.VALUE_CAP_REACHED:
      throw new ConflictError(
        'BUYOUT_AT_VALUE_CAP',
        'Der Aufgabenwert hat die Obergrenze erreicht und kann nicht weiter steigen.',
        { currentValue: input.currentValue, maximumValue: cfg.valueIncrease.maximumValue },
      );
    case BuyoutDenialReason.WEEKLY_LIMIT_REACHED:
      throw new ConflictError('BUYOUT_LIMIT_REACHED', 'Wöchentliches Freikauflimit erreicht.', {
        used: input.buyoutsThisWeek,
        limit: cfg.buyout.maximumBuyoutsPerWeek,
        kind: 'WEEKLY',
      });
    case BuyoutDenialReason.CONSECUTIVE_LIMIT_REACHED:
      throw new ConflictError('BUYOUT_LIMIT_REACHED', 'Zu viele Freikäufe in Folge.', {
        used: input.consecutiveBuyouts,
        limit: cfg.buyout.maximumConsecutiveBuyouts,
        kind: 'CONSECUTIVE',
      });
    case BuyoutDenialReason.INSUFFICIENT_POINTS:
      throw new ConflictError('INSUFFICIENT_POINTS', 'Nicht genügend Punkte für den Freikauf.', {
        balance: input.balance,
        cost: input.cost,
        minimumBalance: minimumAllowedBalance(cfg),
      });
    case BuyoutDenialReason.ASSIGNMENT_CLOSED:
    case null:
      throw new ConflictError('ASSIGNMENT_CLOSED', 'Die Zuweisung ist nicht mehr offen.');
  }
}
