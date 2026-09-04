/**
 * Assignment selection strategies (Architektur §6.8, §6.11; CLAUDE.md §12).
 *
 * Each family is a `Record<StrategyName, StrategyFn>` looked up by the config
 * string, and `satisfies Record<AssignmentStrategy, StrategyFn>` makes the
 * record's keys and the config enum check each other at compile time — so a
 * strategy can never be configurable but unimplemented.
 *
 * Randomness is injected (`Rng`), never taken from `Math.random`, which is what
 * makes the distribution tests and §34's simulation reproducible.
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import {
  AssignmentStrategy,
  type FairnessMetrics,
  type HouseholdConfig,
  type SelectionCandidateTrace,
  type SelectionTrace,
} from '@haushaltsauktion/shared';

import type { EligibilityCandidate, EligibilityOptions } from './eligibility.js';
import { resolveEligibility } from './eligibility.js';
import {
  fairnessAverages,
  metricMaxima,
  weightedFairnessWeight,
  weightedRandomWeight,
  type WeightTerms,
} from './weights.js';

/** Uniform in [0, 1). Production uses a CSPRNG; tests use a seeded generator. */
export interface Rng {
  next(): number;
}

export interface WeightedCandidate {
  memberId: string;
  weight: number;
  weightTerms: WeightTerms | null;
}

export type StrategyFn = (
  candidates: readonly EligibilityCandidate[],
  cfg: HouseholdConfig,
) => WeightedCandidate[];

/** §12 — every eligible person has exactly the same probability. */
const pureRandom: StrategyFn = (candidates) =>
  candidates.map((c) => ({ memberId: c.memberId, weight: 1, weightTerms: null }));

const weightedRandom: StrategyFn = (candidates, cfg) => {
  const maxima = metricMaxima(candidates.map((c) => c.metrics));
  return candidates.map((c) => {
    const terms = weightedRandomWeight(cfg, c.metrics, maxima);
    return { memberId: c.memberId, weight: terms.weight, weightTerms: terms };
  });
};

/**
 * §12 — weight 1 for every candidate tied at the fewest random assignments,
 * 0 for the rest; ties are broken uniformly at random by the draw below.
 */
const leastAssignedFirst: StrategyFn = (candidates) => {
  let minimum = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.metrics.randomAssignments < minimum) minimum = c.metrics.randomAssignments;
  }
  return candidates.map((c) => ({
    memberId: c.memberId,
    weight: c.metrics.randomAssignments === minimum ? 1 : 0,
    weightTerms: null,
  }));
};

const weightedFairness: StrategyFn = (candidates, cfg) => {
  const averages = fairnessAverages(candidates.map((c) => c.metrics));
  return candidates.map((c) => {
    const terms = weightedFairnessWeight(cfg, c.metrics, averages, c.isPreferredAssignee);
    return { memberId: c.memberId, weight: terms.weight, weightTerms: terms };
  });
};

export const ASSIGNMENT_STRATEGIES = {
  PURE_RANDOM: pureRandom,
  WEIGHTED_RANDOM: weightedRandom,
  LEAST_ASSIGNED_FIRST: leastAssignedFirst,
  WEIGHTED_FAIRNESS: weightedFairness,
} satisfies Record<AssignmentStrategy, StrategyFn>;

export interface DrawResult {
  index: number;
  /** The raw uniform draw. Recorded in the audit event only (§6.10). */
  draw: number;
  probabilities: number[];
}

/**
 * Cumulative-sum draw over the weights (§6.8). O(n) for n ≤ 20; an alias table
 * would be pure ceremony at this size (§43).
 */
export function drawWeighted(weights: readonly number[], rng: Rng): DrawResult {
  const draw = rng.next();
  const total = weights.reduce((a, b) => a + b, 0);

  // Defensive: with a validated `weightFloor > 0` this cannot happen for the
  // weighted strategies, and LEAST_ASSIGNED_FIRST always has at least one
  // candidate at weight 1. Falling back to uniform beats dividing by zero.
  if (!(total > 0)) {
    const index = Math.min(weights.length - 1, Math.floor(draw * weights.length));
    return {
      index: Math.max(0, index),
      draw,
      probabilities: weights.map(() => (weights.length === 0 ? 0 : 1 / weights.length)),
    };
  }

  let remaining = draw * total;
  let index = 0;
  while (index < weights.length - 1 && remaining >= (weights[index] ?? 0)) {
    remaining -= weights[index] ?? 0;
    index += 1;
  }

  return { index, draw, probabilities: weights.map((w) => w / total) };
}

export interface SelectionInput {
  cfg: HouseholdConfig;
  candidates: readonly EligibilityCandidate[];
  options: EligibilityOptions;
  configVersion: number;
  /** Injected — the domain never reads the clock itself (§7.2). */
  decidedAt: string;
  rng: Rng;
}

export interface SelectionOutcome {
  /** `null` means T5: no eligible candidate even after the relaxation ladder. */
  selectedMemberId: string | null;
  trace: SelectionTrace;
  /** For the `RANDOM_SELECTION` audit event only — never in `/explain` (§32). */
  draw: number | null;
}

/**
 * The whole of §6: filter, relax if starving, weight, draw, and record why.
 *
 * This is the single function the assignment sweep calls, which is what keeps
 * §6's audit requirement ("mögliche Kandidaten, ausgeschlossene Kandidaten,
 * Ausschlussgrund, ausgewählte Person, verwendete Auswahlstrategie") satisfied
 * by construction rather than by remembering to log.
 */
export function selectAssignee(input: SelectionInput): SelectionOutcome {
  const { cfg, candidates, options, configVersion, decidedAt, rng } = input;

  const { eligible, evaluations, constraintsRelaxed } = resolveEligibility(
    cfg,
    candidates,
    options,
  );

  const metricsById = new Map<string, FairnessMetrics>(
    candidates.map((c) => [c.memberId, c.metrics]),
  );

  if (eligible.length === 0) {
    return {
      selectedMemberId: null,
      draw: null,
      trace: {
        strategy: cfg.assignment.strategy,
        configVersion,
        decidedAt,
        windowDays: cfg.fairness.windowDays,
        constraintsRelaxed,
        candidates: evaluations.map((e) => ({
          memberId: e.memberId,
          included: false,
          exclusionReason: e.reason,
          metrics: metricsById.get(e.memberId) ?? null,
          weightTerms: null,
          weight: null,
          probability: null,
          selected: false,
        })),
      },
    };
  }

  const strategy = ASSIGNMENT_STRATEGIES[cfg.assignment.strategy];
  const weighted = strategy(eligible, cfg);
  const { index, draw, probabilities } = drawWeighted(
    weighted.map((w) => w.weight),
    rng,
  );

  const selectedMemberId = weighted[index]?.memberId ?? eligible[0]?.memberId ?? null;
  const weightedById = new Map(weighted.map((w, i) => [w.memberId, { ...w, probability: probabilities[i] ?? null }]));

  const traceCandidates: SelectionCandidateTrace[] = evaluations.map((e) => {
    const w = weightedById.get(e.memberId);
    return {
      memberId: e.memberId,
      included: e.included,
      exclusionReason: e.reason,
      metrics: metricsById.get(e.memberId) ?? null,
      weightTerms: w?.weightTerms ?? null,
      weight: w?.weight ?? null,
      probability: w?.probability ?? null,
      selected: e.memberId === selectedMemberId,
    };
  });

  return {
    selectedMemberId,
    draw,
    trace: {
      strategy: cfg.assignment.strategy,
      configVersion,
      decidedAt,
      windowDays: cfg.fairness.windowDays,
      constraintsRelaxed,
      candidates: traceCandidates,
    },
  };
}

/**
 * A seeded, deterministic `Rng` for tests and for §34's simulation (mulberry32).
 * Production injects a `crypto.randomInt`-backed implementation from `infra/`;
 * the domain must never construct one, because that would mean reading entropy
 * from inside a pure layer.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
