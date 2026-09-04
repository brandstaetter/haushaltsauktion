/**
 * Fairness weights (Architektur §6.8, PRD §3E).
 *
 * PRD §3E's formula is used **verbatim**:
 *
 *   weight(person) = max(weightFloor,
 *       1.0
 *     + fairness.randomAssignmentWeight  * (avgRandomAssignments - personRandomAssignments)
 *     + fairness.voluntaryWorkWeight     * (personVoluntaryCompletions - avgVoluntaryCompletions)
 *     - fairness.recentAssignmentPenalty * recencyFactor(person))
 *
 *   recencyFactor(person) = 1 / (1 + daysSinceLastRandomAssignment)
 *
 * Someone who has absorbed fewer random assignments than average becomes
 * likelier to be picked; recent victims are protected; the floor keeps every
 * eligible person reachable, so the distribution stays ergodic and §34's
 * simulation cannot show permanent exclusion.
 *
 * Every term is returned separately so §32 can explain the number rather than
 * merely assert it.
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import type { FairnessMetrics, HouseholdConfig } from '@haushaltsauktion/shared';

export interface WeightTerms extends Record<string, number> {
  base: number;
  randomAssignmentTerm: number;
  voluntaryWorkTerm: number;
  recencyPenaltyTerm: number;
  /**
   * Intake "task-role-based-eligibility-and-preferred-assignee":
   * `fairness.preferredAssigneeWeight` when the candidate is a preferred
   * assignee of the task definition, `0` otherwise. `WEIGHTED_FAIRNESS` only
   * — `weightedRandomWeight` below always reports `0` here.
   */
  preferredTerm: number;
  /** The sum before the floor is applied. */
  raw: number;
  /** The value actually used in the draw. */
  weight: number;
}

export interface FairnessAverages {
  avgRandomAssignments: number;
  avgVoluntaryCompletions: number;
}

/**
 * A member with no random assignment inside the window arrives with
 * `daysSinceLastRandomAssignment = windowDays` (§6.8), so the factor tends
 * towards 0 and they are not penalized for having no history.
 */
export function recencyFactor(daysSinceLastRandomAssignment: number): number {
  return 1 / (1 + Math.max(0, daysSinceLastRandomAssignment));
}

/** Averages over the **eligible** candidate set, within `fairness.windowDays`. */
export function fairnessAverages(metrics: readonly FairnessMetrics[]): FairnessAverages {
  if (metrics.length === 0) return { avgRandomAssignments: 0, avgVoluntaryCompletions: 0 };
  let random = 0;
  let voluntary = 0;
  for (const m of metrics) {
    random += m.randomAssignments;
    voluntary += m.voluntaryCompletions;
  }
  return {
    avgRandomAssignments: random / metrics.length,
    avgVoluntaryCompletions: voluntary / metrics.length,
  };
}

export function weightedFairnessWeight(
  cfg: HouseholdConfig,
  metrics: FairnessMetrics,
  averages: FairnessAverages,
  isPreferredAssignee: boolean,
): WeightTerms {
  const f = cfg.fairness;

  const base = 1.0;
  const randomAssignmentTerm =
    f.randomAssignmentWeight * (averages.avgRandomAssignments - metrics.randomAssignments);
  const voluntaryWorkTerm =
    f.voluntaryWorkWeight * (metrics.voluntaryCompletions - averages.avgVoluntaryCompletions);
  const recencyPenaltyTerm =
    -f.recentAssignmentPenalty * recencyFactor(metrics.daysSinceLastRandomAssignment);
  const preferredTerm = isPreferredAssignee ? f.preferredAssigneeWeight : 0;

  const raw = base + randomAssignmentTerm + voluntaryWorkTerm + recencyPenaltyTerm + preferredTerm;
  const weight = Math.max(f.weightFloor, raw);

  return { base, randomAssignmentTerm, voluntaryWorkTerm, recencyPenaltyTerm, preferredTerm, raw, weight };
}

/**
 * `WEIGHTED_RANDOM` (§12) — the generic form. Each §12 criterion is normalized
 * to [0, 1] across the candidate set and combined with the same `fairness.*`
 * coefficients, oriented so that *less* absorbed random work raises the weight.
 *
 * Where `WEIGHTED_FAIRNESS` works on absolute deviations from the mean, this
 * variant works on the relative position within the set, which makes it stable
 * when the absolute counts are large.
 */
export function weightedRandomWeight(
  cfg: HouseholdConfig,
  metrics: FairnessMetrics,
  maxima: { randomAssignments: number; voluntaryCompletions: number },
): WeightTerms {
  const f = cfg.fairness;
  const normalize = (value: number, max: number): number => (max <= 0 ? 0 : value / max);

  const base = 1.0;
  const randomAssignmentTerm =
    f.randomAssignmentWeight * (1 - normalize(metrics.randomAssignments, maxima.randomAssignments));
  const voluntaryWorkTerm =
    f.voluntaryWorkWeight * normalize(metrics.voluntaryCompletions, maxima.voluntaryCompletions);
  const recencyPenaltyTerm =
    -f.recentAssignmentPenalty * recencyFactor(metrics.daysSinceLastRandomAssignment);

  const raw = base + randomAssignmentTerm + voluntaryWorkTerm + recencyPenaltyTerm;
  const weight = Math.max(f.weightFloor, raw);

  return {
    base,
    randomAssignmentTerm,
    voluntaryWorkTerm,
    recencyPenaltyTerm,
    preferredTerm: 0,
    raw,
    weight,
  };
}

export function metricMaxima(metrics: readonly FairnessMetrics[]): {
  randomAssignments: number;
  voluntaryCompletions: number;
} {
  let randomAssignments = 0;
  let voluntaryCompletions = 0;
  for (const m of metrics) {
    if (m.randomAssignments > randomAssignments) randomAssignments = m.randomAssignments;
    if (m.voluntaryCompletions > voluntaryCompletions) voluntaryCompletions = m.voluntaryCompletions;
  }
  return { randomAssignments, voluntaryCompletions };
}
