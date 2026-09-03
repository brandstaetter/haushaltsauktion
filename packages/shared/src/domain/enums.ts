/**
 * Mirror of the Prisma enums (Architektur §1.3) plus the strategy enums that
 * live inside the configuration JSON rather than in a database column.
 *
 * Declared as frozen const objects with a companion literal-union type so that
 * both the API and the web app can import the *values* without pulling in a
 * TypeScript `enum` (which is not erasable under `isolatedModules`).
 */

function asEnum<const T extends Record<string, string>>(members: T): Readonly<T> {
  return Object.freeze(members);
}

// ───────────────────────── persisted enums (Prisma) ─────────────────────────

export const MemberRole = asEnum({ MEMBER: 'MEMBER', ADMIN: 'ADMIN' });
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const TaskStatus = asEnum({
  DRAFT: 'DRAFT',
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED',
  EXPIRED: 'EXPIRED',
});
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/**
 * §2.1 — the states no *ordinary* event ever leaves.
 *
 * `COMPLETED` is deliberately absent: an admin's rejection can reopen it via
 * `REOPEN_TO_ASSIGNEE` / `REOPEN_TO_MARKET` (state-machine.ts) — the only two
 * events raised on it, and only by that one moderation use-case.
 */
export const TERMINAL_TASK_STATUSES = Object.freeze([
  TaskStatus.CANCELLED,
  TaskStatus.EXPIRED,
] as const);

export const AssignmentKind = asEnum({ VOLUNTARY: 'VOLUNTARY', RANDOM: 'RANDOM' });
export type AssignmentKind = (typeof AssignmentKind)[keyof typeof AssignmentKind];

export const AssignmentStatus = asEnum({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  BOUGHT_OUT: 'BOUGHT_OUT',
  RELEASED: 'RELEASED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  /** An admin rejected this completion as unsatisfactory (§32-adjacent moderation). */
  REJECTED: 'REJECTED',
});
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const AssignmentResponse = asEnum({ PENDING: 'PENDING', ACCEPTED: 'ACCEPTED' });
export type AssignmentResponse = (typeof AssignmentResponse)[keyof typeof AssignmentResponse];

export const EligibilityMode = asEnum({ INCLUDED: 'INCLUDED', EXCLUDED: 'EXCLUDED' });
export type EligibilityMode = (typeof EligibilityMode)[keyof typeof EligibilityMode];

export const RecurrenceType = asEnum({
  ONCE: 'ONCE',
  DAILY: 'DAILY',
  WEEKDAYS: 'WEEKDAYS',
  WEEKLY: 'WEEKLY',
  EVERY_N_DAYS: 'EVERY_N_DAYS',
  MONTHLY: 'MONTHLY',
  MANUAL: 'MANUAL',
});
export type RecurrenceType = (typeof RecurrenceType)[keyof typeof RecurrenceType];

export const ActorType = asEnum({ MEMBER: 'MEMBER', ADMIN: 'ADMIN', SYSTEM: 'SYSTEM' });
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const PointTransactionType = asEnum({
  VOLUNTARY_TASK_REWARD: 'VOLUNTARY_TASK_REWARD',
  BUYOUT: 'BUYOUT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  DECAY: 'DECAY',
  BONUS: 'BONUS',
  PENALTY: 'PENALTY',
  CORRECTION: 'CORRECTION',
  /** Daily completion streak (CLAUDE.md §16, intake "daily-completion-streak-bonus"). */
  STREAK_BONUS: 'STREAK_BONUS',
  /** Punkte-Shop purchase (intake "points-shop-real-life-rewards"). */
  REWARD_REDEMPTION: 'REWARD_REDEMPTION',
});
export type PointTransactionType =
  (typeof PointTransactionType)[keyof typeof PointTransactionType];

/** Punkte-Shop (intake "points-shop-real-life-rewards"). */
export const RewardRedemptionStatus = asEnum({ PENDING: 'PENDING', FULFILLED: 'FULFILLED' });
export type RewardRedemptionStatus =
  (typeof RewardRedemptionStatus)[keyof typeof RewardRedemptionStatus];

/**
 * Virtuelle Gamification-Items (intake "points-shop-virtual-gamification-items").
 * `MANUAL_FULFILLMENT` is the parent intake's original, implicit shape; a
 * `VIRTUAL_EFFECT` item skips the admin fulfillment step entirely and becomes
 * active immediately at purchase (`purchaseReward.ts`).
 */
export const RewardKind = asEnum({
  MANUAL_FULFILLMENT: 'MANUAL_FULFILLMENT',
  VIRTUAL_EFFECT: 'VIRTUAL_EFFECT',
});
export type RewardKind = (typeof RewardKind)[keyof typeof RewardKind];

/** The two potion types the intake names — new ones need only a new value here. */
export const EffectType = asEnum({ IMMUNITY: 'IMMUNITY', MULTIPLIER: 'MULTIPLIER' });
export type EffectType = (typeof EffectType)[keyof typeof EffectType];

export const HistoryEventType = asEnum({
  CREATED: 'CREATED',
  OFFERED: 'OFFERED',
  VOLUNTEERED: 'VOLUNTEERED',
  NO_VOLUNTEER: 'NO_VOLUNTEER',
  RANDOMLY_ASSIGNED: 'RANDOMLY_ASSIGNED',
  ASSIGNMENT_ACCEPTED: 'ASSIGNMENT_ACCEPTED',
  CONSTRAINT_RELAXED: 'CONSTRAINT_RELAXED',
  NO_ELIGIBLE_CANDIDATES: 'NO_ELIGIBLE_CANDIDATES',
  BOUGHT_OUT: 'BOUGHT_OUT',
  VALUE_INCREASED: 'VALUE_INCREASED',
  RE_OFFERED: 'RE_OFFERED',
  RELEASED: 'RELEASED',
  REVOKED: 'REVOKED',
  COMPLETED: 'COMPLETED',
  POINTS_AWARDED: 'POINTS_AWARDED',
  POINTS_CLAWED_BACK: 'POINTS_CLAWED_BACK',
  VALUE_RESET: 'VALUE_RESET',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  COMPLETION_REJECTED: 'COMPLETION_REJECTED',
  /** A rejected completion, reopened directly to the member who did it. */
  REOPENED_TO_ASSIGNEE: 'REOPENED_TO_ASSIGNEE',
  /** A day's streak bonus was posted (daily-completion-streak-bonus). */
  STREAK_BONUS_AWARDED: 'STREAK_BONUS_AWARDED',
});
export type HistoryEventType = (typeof HistoryEventType)[keyof typeof HistoryEventType];

export const NotificationType = asEnum({
  TASK_AVAILABLE: 'TASK_AVAILABLE',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  /** Voluntary pickup — distinct from `TASK_ASSIGNED`'s "you were selected at random" meaning. */
  TASK_TAKEN: 'TASK_TAKEN',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
  TASK_VALUE_INCREASED: 'TASK_VALUE_INCREASED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  ADMIN_NO_CANDIDATES: 'ADMIN_NO_CANDIDATES',
});
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const AuditAction = asEnum({
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  MEMBER_CREATED: 'MEMBER_CREATED',
  MEMBER_UPDATED: 'MEMBER_UPDATED',
  MEMBER_DEACTIVATED: 'MEMBER_DEACTIVATED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  RESTRICTIONS_UPDATED: 'RESTRICTIONS_UPDATED',
  POINTS_ADJUSTED: 'POINTS_ADJUSTED',
  LEDGER_CACHE_REPAIRED: 'LEDGER_CACHE_REPAIRED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  TASK_DEFINITION_CREATED: 'TASK_DEFINITION_CREATED',
  TASK_DEFINITION_UPDATED: 'TASK_DEFINITION_UPDATED',
  TASK_DEFINITION_ARCHIVED: 'TASK_DEFINITION_ARCHIVED',
  TASK_DEFINITION_REACTIVATED: 'TASK_DEFINITION_REACTIVATED',
  INSTANCE_MATERIALIZED: 'INSTANCE_MATERIALIZED',
  INSTANCE_PUBLISHED: 'INSTANCE_PUBLISHED',
  INSTANCE_CANCELLED: 'INSTANCE_CANCELLED',
  INSTANCE_PAUSED: 'INSTANCE_PAUSED',
  INSTANCE_RESUMED: 'INSTANCE_RESUMED',
  INSTANCE_EXPIRED: 'INSTANCE_EXPIRED',
  ASSIGNMENT_SWEEP_RUN: 'ASSIGNMENT_SWEEP_RUN',
  RANDOM_SELECTION: 'RANDOM_SELECTION',
  ASSIGNMENT_REVOKED: 'ASSIGNMENT_REVOKED',
  BUYOUT_EXECUTED: 'BUYOUT_EXECUTED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_COMPLETION_REJECTED: 'TASK_COMPLETION_REJECTED',
  /** Punkte-Shop (intake "points-shop-real-life-rewards"). */
  REWARD_DEFINITION_CREATED: 'REWARD_DEFINITION_CREATED',
  REWARD_DEFINITION_UPDATED: 'REWARD_DEFINITION_UPDATED',
  REWARD_PURCHASED: 'REWARD_PURCHASED',
  REWARD_FULFILLED: 'REWARD_FULFILLED',
  /** Virtuelle Gamification-Items (intake "points-shop-virtual-gamification-items"). */
  MEMBER_EFFECT_ACTIVATED: 'MEMBER_EFFECT_ACTIVATED',
});
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

// ───────────────── configuration enums (§5.3 — JSON, not columns) ─────────────────

export const RewardTiming = asEnum({ ON_ACCEPT: 'ON_ACCEPT', ON_COMPLETE: 'ON_COMPLETE' });
export type RewardTiming = (typeof RewardTiming)[keyof typeof RewardTiming];

export const Rounding = asEnum({ CEIL: 'CEIL', FLOOR: 'FLOOR', ROUND: 'ROUND' });
export type Rounding = (typeof Rounding)[keyof typeof Rounding];

export const AssignmentStrategy = asEnum({
  PURE_RANDOM: 'PURE_RANDOM',
  WEIGHTED_RANDOM: 'WEIGHTED_RANDOM',
  LEAST_ASSIGNED_FIRST: 'LEAST_ASSIGNED_FIRST',
  WEIGHTED_FAIRNESS: 'WEIGHTED_FAIRNESS',
});
export type AssignmentStrategy = (typeof AssignmentStrategy)[keyof typeof AssignmentStrategy];

export const BuyoutCostStrategy = asEnum({
  FIXED: 'FIXED',
  CURRENT_TASK_VALUE: 'CURRENT_TASK_VALUE',
  MULTIPLIER: 'MULTIPLIER',
  FORMULA: 'FORMULA',
});
export type BuyoutCostStrategy = (typeof BuyoutCostStrategy)[keyof typeof BuyoutCostStrategy];

export const ValueIncreaseStrategy = asEnum({
  FIXED_INCREMENT: 'FIXED_INCREMENT',
  PERCENTAGE: 'PERCENTAGE',
  MULTIPLIER: 'MULTIPLIER',
  CUSTOM_FORMULA: 'CUSTOM_FORMULA',
});
export type ValueIncreaseStrategy =
  (typeof ValueIncreaseStrategy)[keyof typeof ValueIncreaseStrategy];

export const ResetStrategy = asEnum({
  BASE_VALUE: 'BASE_VALUE',
  DECREASE_PERCENTAGE: 'DECREASE_PERCENTAGE',
  KEEP_CURRENT: 'KEEP_CURRENT',
});
export type ResetStrategy = (typeof ResetStrategy)[keyof typeof ResetStrategy];

export const DecayType = asEnum({
  NONE: 'NONE',
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
  MAX_BALANCE: 'MAX_BALANCE',
});
export type DecayType = (typeof DecayType)[keyof typeof DecayType];
