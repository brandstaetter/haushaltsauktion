/**
 * The resolved household configuration (Architektur §5.3, CLAUDE.md §16/§17/§39).
 *
 * Nothing in the business rules is hard-coded: the domain reads this object and
 * only this object. Written here by hand rather than inferred from Zod so the
 * shape is readable at a glance and so `schema.ts` can be checked against it in
 * both directions at compile time.
 *
 * Invariant safety by omission (§5.4): there is deliberately **no** key that
 * grants points for a random completion, no key that makes a buyout free, and
 * no key that lets a buyout leave the value unchanged.
 */

import type {
  AssignmentStrategy,
  BuyoutCostStrategy,
  DecayType,
  ResetStrategy,
  RewardTiming,
  Rounding,
  ValueIncreaseStrategy,
} from '../domain/enums.js';

export interface TasksConfig {
  /** OQ-5 / Reconciliation §2. Two open cards for one chore make its value ambiguous. */
  maxOpenInstancesPerDefinition: number;
}

export interface VoluntaryConfig {
  rewardEnabled: boolean;
  /** 0 .. 10 */
  rewardMultiplier: number;
  rewardTiming: RewardTiming;
  rewardRounding: Rounding;
  /** PRD §3B — a volunteer may hand the task back without charge. */
  allowRelease: boolean;
}

export interface AssignmentConfig {
  strategy: AssignmentStrategy;
  preventImmediateReassignment: boolean;
  reassignmentCooldownCycles: number;
  /** 1 .. 20160 (14 days) */
  offerDurationMinutes: number;
  /**
   * OQ-4 / Reconciliation §2 — an `AVAILABLE` instance with a due date is
   * never randomly assigned while more than this many minutes remain before
   * it; once fewer remain, the normal sweep applies. A `null` `dueAt` means
   * no auto-assignment at all, regardless of this value.
   */
  leadMinutesBeforeDue: number;
  /** PRD §3D — the starvation fallback. */
  relaxConstraintsWhenNoCandidates: boolean;
}

export interface BuyoutConfig {
  enabled: boolean;
  costStrategy: BuyoutCostStrategy;
  /** used iff `costStrategy = FIXED` */
  fixedCost: number;
  /** used iff `costStrategy = MULTIPLIER` */
  multiplier: number;
  /** used iff `costStrategy = FORMULA` */
  costFormula: string | null;
  costRounding: Rounding;
  allowNegativeBalance: boolean;
  minimumBalance: number;
  /** used iff `allowNegativeBalance`; the furthest a balance may go below zero */
  maximumDebt: number | null;
  maximumBuyoutsPerWeek: number | null;
  maximumConsecutiveBuyouts: number | null;
}

export interface ValueIncreaseConfig {
  strategy: ValueIncreaseStrategy;
  /** used iff `FIXED_INCREMENT` */
  increment: number;
  /** used iff `PERCENTAGE` */
  percentage: number;
  /** used iff `MULTIPLIER` — validated `> 1`, since `<= 1` cannot raise a value */
  multiplier: number;
  /** used iff `CUSTOM_FORMULA` */
  formula: string | null;
  rounding: Rounding;
  /** `>= 1`. Zero would break §44. */
  minimumIncrease: number;
  maximumValue: number | null;
}

export interface CompletionConfig {
  resetStrategy: ResetStrategy;
  /** used iff `DECREASE_PERCENTAGE`; 1 .. 99 */
  decreasePercentage: number;
}

export interface PointDecayConfig {
  enabled: boolean;
  type: DecayType;
  value: number;
  intervalDays: number;
  minimumBalance: number;
}

export interface PointsConfig {
  decay: PointDecayConfig;
}

/**
 * Daily completion streak (intake "daily-completion-streak-bonus").
 *
 * `dailyBonus = floor(baseRate * currentStreakLength)`, paid once per
 * household-local calendar day that has at least one `VOLUNTARY` completion —
 * never for a day covered only by `RANDOM` completions (§7/§44). Floored by
 * construction, so it always posts as a whole-number ledger entry.
 */
export interface StreakConfig {
  enabled: boolean;
  /** >= 0. Day 1 of any streak pays `floor(baseRate * 1)`, which is 0 at the default. */
  baseRate: number;
}

export interface FairnessConfig {
  randomAssignmentWeight: number;
  voluntaryWorkWeight: number;
  recentAssignmentPenalty: number;
  /** OQ-7 / Reconciliation §2 — lookback for the averages. 7 .. 365. */
  windowDays: number;
  /** PRD §3E. `> 0`, so every eligible member stays reachable (ergodicity). */
  weightFloor: number;
}

export interface NotificationsConfig {
  inAppEnabled: boolean;
  dueSoonLeadMinutes: number;
}

/**
 * Third-party integrations, household level (§16/§17).
 *
 * Only the on/off switch lives here. A member's own token, project and trigger
 * choices are personal and belong on `MemberIntegration` — household config is
 * admin-editable, and an admin must never be able to read or change another
 * adult's credential (§36).
 */
export interface TodoistIntegrationConfig {
  enabled: boolean;
}

export interface IntegrationsConfig {
  todoist: TodoistIntegrationConfig;
}

export interface HouseholdConfig {
  tasks: TasksConfig;
  voluntary: VoluntaryConfig;
  assignment: AssignmentConfig;
  buyout: BuyoutConfig;
  valueIncrease: ValueIncreaseConfig;
  completion: CompletionConfig;
  points: PointsConfig;
  streak: StreakConfig;
  fairness: FairnessConfig;
  notifications: NotificationsConfig;
  integrations: IntegrationsConfig;
}

/**
 * The member-readable subset (Reconciliation §1.3, `GET /api/config/public`).
 * Derived from the same object the server computes with — never a
 * hand-maintained parallel list — because §31 forbids hidden rules.
 */
export interface PublicHouseholdConfig {
  voluntary: Pick<VoluntaryConfig, 'rewardEnabled' | 'rewardTiming' | 'allowRelease'>;
  buyout: Pick<BuyoutConfig, 'enabled' | 'allowNegativeBalance' | 'minimumBalance'> & {
    costStrategy: BuyoutCostStrategy;
    maximumBuyoutsPerWeek: number | null;
  };
  assignment: Pick<AssignmentConfig, 'strategy' | 'offerDurationMinutes' | 'leadMinutesBeforeDue'>;
  valueIncrease: Pick<ValueIncreaseConfig, 'strategy' | 'minimumIncrease' | 'maximumValue'>;
  completion: Pick<CompletionConfig, 'resetStrategy'>;
  pointDecayEnabled: boolean;
  streak: Pick<StreakConfig, 'enabled' | 'baseRate'>;
  /**
   * Just the switch. The web app needs it to decide whether to render the
   * Todoist section on a member's account page at all — and nothing else from
   * the section is any of the client's business.
   */
  integrations: { todoist: Pick<TodoistIntegrationConfig, 'enabled'> };
}
