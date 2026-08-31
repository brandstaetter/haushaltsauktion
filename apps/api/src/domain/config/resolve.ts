/**
 * Configuration pinning (Architektur §5.5).
 *
 * The rule in one line: **a number that was quoted to a person is honoured; the
 * system's future behaviour follows the admin's latest intent.**
 *
 * An admin who changes `valueIncrease.multiplier` from 1.5 to 3.0 while Anna is
 * looking at "Freikaufen: 6 Punkte, danach steigt der Wert auf 9" cannot make
 * her pay a different price: her assignment pinned version 7 when it was
 * created, and every arm of the buyout transaction reads version 7. The *next*
 * assignment pins version 8 and uses 3.0.
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import { ConflictError } from '../errors.js';

/**
 * Which decision is being made. The grouping — not the call site — determines
 * which configuration version applies, so a new call site cannot accidentally
 * pick the wrong one.
 */
export const ConfigDecision = Object.freeze({
  /** Pinned to the assignment: numbers already quoted to a member. */
  BUYOUT_COST: 'BUYOUT_COST',
  VALUE_INCREASE_ON_BUYOUT: 'VALUE_INCREASE_ON_BUYOUT',
  VOLUNTARY_REWARD: 'VOLUNTARY_REWARD',
  RESET_ON_COMPLETION: 'RESET_ON_COMPLETION',
  CLAWBACK: 'CLAWBACK',

  /** Pinned to the instance: decisions about an offer with no active assignment. */
  OFFER_DURATION: 'OFFER_DURATION',
  EXPIRY_DEADLINE: 'EXPIRY_DEADLINE',
  RESET_ON_EXPIRY: 'RESET_ON_EXPIRY',

  /** Current: how the system should behave from now on. */
  SELECTION_STRATEGY: 'SELECTION_STRATEGY',
  FAIRNESS_WEIGHTS: 'FAIRNESS_WEIGHTS',
  ELIGIBILITY_CAPS: 'ELIGIBILITY_CAPS',
  POINT_DECAY: 'POINT_DECAY',
  NOTIFICATION_TIMING: 'NOTIFICATION_TIMING',
} as const);
export type ConfigDecision = (typeof ConfigDecision)[keyof typeof ConfigDecision];

export type ConfigScope = 'ASSIGNMENT_PINNED' | 'INSTANCE_PINNED' | 'CURRENT';

const SCOPES = {
  BUYOUT_COST: 'ASSIGNMENT_PINNED',
  VALUE_INCREASE_ON_BUYOUT: 'ASSIGNMENT_PINNED',
  VOLUNTARY_REWARD: 'ASSIGNMENT_PINNED',
  RESET_ON_COMPLETION: 'ASSIGNMENT_PINNED',
  CLAWBACK: 'ASSIGNMENT_PINNED',

  OFFER_DURATION: 'INSTANCE_PINNED',
  EXPIRY_DEADLINE: 'INSTANCE_PINNED',
  RESET_ON_EXPIRY: 'INSTANCE_PINNED',

  SELECTION_STRATEGY: 'CURRENT',
  FAIRNESS_WEIGHTS: 'CURRENT',
  ELIGIBILITY_CAPS: 'CURRENT',
  POINT_DECAY: 'CURRENT',
  NOTIFICATION_TIMING: 'CURRENT',
} satisfies Record<ConfigDecision, ConfigScope>;

export function scopeOf(decision: ConfigDecision): ConfigScope {
  return SCOPES[decision];
}

export interface ConfigVersionContext {
  /** `TaskAssignment.configVersion`, when an assignment is in play. */
  assignmentConfigVersion?: number | null;
  /** `TaskInstance.configVersion`. */
  instanceConfigVersion?: number | null;
  /** `MAX(version)` for the household. */
  currentVersion: number;
}

/**
 * The version to read for a given decision.
 *
 * An assignment-pinned decision falls back to the instance version when there
 * is no assignment (a completion driven by an admin on an instance that lost
 * its assignment, for example) and to the current version as a last resort —
 * the fallback never *upgrades* an existing pin, it only fills an absence.
 */
export function configVersionFor(
  decision: ConfigDecision,
  ctx: ConfigVersionContext,
): number {
  switch (scopeOf(decision)) {
    case 'ASSIGNMENT_PINNED':
      return ctx.assignmentConfigVersion ?? ctx.instanceConfigVersion ?? ctx.currentVersion;
    case 'INSTANCE_PINNED':
      return ctx.instanceConfigVersion ?? ctx.currentVersion;
    case 'CURRENT':
      return ctx.currentVersion;
  }
}

/**
 * Look a pinned version up in an already-loaded map.
 *
 * A missing version is a `500`, not a silent fallback to the current one:
 * `TaskInstance.configVersion` and `TaskAssignment.configVersion` are real
 * foreign keys with `onDelete: Restrict` (§5.5), so a pinned version cannot
 * disappear — if one is absent, something is wrong that must not be papered
 * over by quietly charging a different price.
 */
export function resolveConfig<T>(
  decision: ConfigDecision,
  ctx: ConfigVersionContext,
  versions: ReadonlyMap<number, T>,
): { version: number; config: T } {
  const version = configVersionFor(decision, ctx);
  const config = versions.get(version);
  if (config === undefined) {
    throw new ConflictError(
      'INTERNAL_ERROR',
      `Konfigurationsversion ${version} ist nicht verfügbar (Entscheidung: ${decision}).`,
      { decision, version },
    );
  }
  return { version, config };
}
