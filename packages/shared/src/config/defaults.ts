/**
 * `DEFAULT_CONFIG` — CLAUDE.md §39 verbatim, plus the keys §16/§17 imply and
 * the ones the implementation needs (Architektur §5.3, Reconciliation §4).
 *
 * Version 1 of every household's configuration is written from this object by
 * the seed/bootstrap (§5.2).
 */

import {
  AssignmentStrategy,
  BuyoutCostStrategy,
  DecayType,
  ResetStrategy,
  RewardTiming,
  Rounding,
  ValueIncreaseStrategy,
} from '../domain/enums.js';
import { deepCloneJson } from '../internal/clone.js';
import type { HouseholdConfig, PublicHouseholdConfig } from './types.js';

export const DEFAULT_CONFIG: HouseholdConfig = Object.freeze({
  tasks: Object.freeze({
    maxOpenInstancesPerDefinition: 1, // OQ-5
  }),

  voluntary: Object.freeze({
    rewardEnabled: true,
    rewardMultiplier: 1.0, // §39
    rewardTiming: RewardTiming.ON_COMPLETE, // §39
    rewardRounding: Rounding.ROUND,
    allowRelease: true, // PRD §3B
  }),

  assignment: Object.freeze({
    strategy: AssignmentStrategy.WEIGHTED_FAIRNESS, // §39
    preventImmediateReassignment: true, // §39
    reassignmentCooldownCycles: 1, // §13
    offerDurationMinutes: 60, // §16
    leadMinutesBeforeDue: 1440, // OQ-4, reworked: auto-assign within 24h of dueAt
    relaxConstraintsWhenNoCandidates: true, // PRD §3D
  }),

  buyout: Object.freeze({
    enabled: true, // §39
    costStrategy: BuyoutCostStrategy.CURRENT_TASK_VALUE, // §39
    fixedCost: 5,
    multiplier: 1.0,
    costFormula: null,
    costRounding: Rounding.CEIL,
    allowNegativeBalance: false, // §39
    minimumBalance: 0, // §16
    maximumDebt: null,
    maximumBuyoutsPerWeek: null, // §16
    maximumConsecutiveBuyouts: null,
  }),

  valueIncrease: Object.freeze({
    strategy: ValueIncreaseStrategy.MULTIPLIER, // §39
    increment: 2,
    percentage: 50,
    multiplier: 1.5, // §39
    formula: null,
    rounding: Rounding.CEIL, // §39
    minimumIncrease: 1, // §39
    maximumValue: null,
  }),

  completion: Object.freeze({
    resetStrategy: ResetStrategy.BASE_VALUE, // §39 resetValueToBase: true
    decreasePercentage: 25,
  }),

  points: Object.freeze({
    decay: Object.freeze({
      enabled: false, // §39
      type: DecayType.NONE,
      value: 0,
      intervalDays: 7,
      minimumBalance: 0,
    }),
  }),

  streak: Object.freeze({
    enabled: true,
    baseRate: 0.5, // intake "daily-completion-streak-bonus": floor(0.5 * length)
  }),

  fairness: Object.freeze({
    randomAssignmentWeight: 1, // §16
    voluntaryWorkWeight: 0, // §16
    recentAssignmentPenalty: 1, // §16
    windowDays: 28, // OQ-7
    weightFloor: 0.1, // PRD §3E
  }),

  notifications: Object.freeze({
    inAppEnabled: true, // §24
    dueSoonLeadMinutes: 120,
  }),

  integrations: Object.freeze({
    todoist: Object.freeze({
      /**
       * Off by default, deliberately.
       *
       * An integration that reaches a third party must not switch itself on for
       * existing households at upgrade time; a household opts in knowingly.
       * Note the consequence of level-triggered reconciliation: turning this
       * off later *closes* every open Todoist task in the household on the next
       * pass rather than freezing them, because "off" has to mean "not
       * operating", not "operating invisibly".
       */
      enabled: false,
    }),
  }),
}) satisfies HouseholdConfig;

/** A mutable deep copy, for callers that want to patch the defaults. */
export function cloneDefaultConfig(): HouseholdConfig {
  return deepCloneJson(DEFAULT_CONFIG) as HouseholdConfig;
}

/**
 * Reconciliation §1.3 — the member-readable projection, derived from the same
 * object the server computes with so the two can never drift.
 */
export function toPublicConfig(cfg: HouseholdConfig): PublicHouseholdConfig {
  return {
    voluntary: {
      rewardEnabled: cfg.voluntary.rewardEnabled,
      rewardTiming: cfg.voluntary.rewardTiming,
      allowRelease: cfg.voluntary.allowRelease,
    },
    buyout: {
      enabled: cfg.buyout.enabled,
      allowNegativeBalance: cfg.buyout.allowNegativeBalance,
      minimumBalance: cfg.buyout.minimumBalance,
      costStrategy: cfg.buyout.costStrategy,
      maximumBuyoutsPerWeek: cfg.buyout.maximumBuyoutsPerWeek,
    },
    assignment: {
      strategy: cfg.assignment.strategy,
      offerDurationMinutes: cfg.assignment.offerDurationMinutes,
      leadMinutesBeforeDue: cfg.assignment.leadMinutesBeforeDue,
    },
    valueIncrease: {
      strategy: cfg.valueIncrease.strategy,
      minimumIncrease: cfg.valueIncrease.minimumIncrease,
      maximumValue: cfg.valueIncrease.maximumValue,
    },
    completion: {
      resetStrategy: cfg.completion.resetStrategy,
    },
    pointDecayEnabled: cfg.points.decay.enabled,
    streak: { enabled: cfg.streak.enabled, baseRate: cfg.streak.baseRate },
    // The switch only. A member's token, project and triggers are personal and
    // never travel through the household projection.
    integrations: { todoist: { enabled: cfg.integrations.todoist.enabled } },
  };
}
