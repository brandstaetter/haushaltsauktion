/**
 * §12 / §6.8 / PRD §3E — the selection strategies.
 *
 * The statistical test is the important one: PRD §3E's `weightFloor` exists so
 * the distribution stays ergodic, and §34 requires that the simulation cannot
 * show permanent exclusion. Here that is asserted directly over many draws with
 * a seeded RNG, so it is reproducible rather than flaky.
 */

import { describe, expect, it } from 'vitest';

import {
  AssignmentStrategy,
  DEFAULT_CONFIG,
  cloneDefaultConfig,
  type FairnessMetrics,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import type { EligibilityCandidate } from '../../src/domain/assignment/eligibility.js';
import {
  ASSIGNMENT_STRATEGIES,
  drawWeighted,
  mulberry32,
  selectAssignee,
} from '../../src/domain/assignment/strategies.js';
import {
  fairnessAverages,
  recencyFactor,
  weightedFairnessWeight,
} from '../../src/domain/assignment/weights.js';

const cfg = DEFAULT_CONFIG;
const OPTIONS = { definitionHasAllowlist: false };

const metrics = (over: Partial<FairnessMetrics> = {}): FairnessMetrics => ({
  randomAssignments: 0,
  voluntaryCompletions: 0,
  buyouts: 0,
  completedTasks: 0,
  totalEstimatedMinutes: 0,
  daysSinceLastRandomAssignment: cfg.fairness.windowDays,
  ...over,
});

const candidate = (
  memberId: string,
  over: Partial<EligibilityCandidate> = {},
): EligibilityCandidate => ({
  memberId,
  isActive: true,
  isAbsent: false,
  hasActiveImmunity: false,
  excludedFromTask: false,
  inAllowlist: true,
  categoryExcluded: false,
  randomAssignmentsThisWeek: 0,
  maxRandomAssignmentsPerWeek: null,
  cyclesSinceLastRandomAssignmentOfTask: null,
  metrics: metrics(),
  ...over,
});

const patch = (mutate: (c: HouseholdConfig) => void): HouseholdConfig => {
  const next = cloneDefaultConfig();
  mutate(next);
  return next;
};

const FAMILY = ['anna', 'paul', 'maria', 'hannes'];

describe('PRD §3E — the WEIGHTED_FAIRNESS formula, term by term', () => {
  it('computes recencyFactor as 1 / (1 + days)', () => {
    expect(recencyFactor(0)).toBe(1);
    expect(recencyFactor(1)).toBe(0.5);
    expect(recencyFactor(3)).toBe(0.25);
    expect(recencyFactor(27)).toBeCloseTo(1 / 28, 10);
  });

  it('gives a member with no history the full window, so they are not punished', () => {
    const fresh = metrics(); // daysSinceLastRandomAssignment = windowDays = 28
    const terms = weightedFairnessWeight(cfg, fresh, {
      avgRandomAssignments: 0,
      avgVoluntaryCompletions: 0,
    });
    expect(terms.recencyPenaltyTerm).toBeCloseTo(-1 / 29, 10);
    expect(terms.weight).toBeGreaterThan(0.9);
  });

  it('reproduces the formula exactly for a worked example', () => {
    const person = metrics({
      randomAssignments: 1,
      voluntaryCompletions: 3,
      daysSinceLastRandomAssignment: 3,
    });
    const averages = { avgRandomAssignments: 2, avgVoluntaryCompletions: 2 };
    const config = patch((c) => {
      c.fairness.randomAssignmentWeight = 1;
      c.fairness.voluntaryWorkWeight = 0.5;
      c.fairness.recentAssignmentPenalty = 1;
    });

    const terms = weightedFairnessWeight(config, person, averages);
    // 1.0 + 1*(2-1) + 0.5*(3-2) - 1*(1/(1+3)) = 1 + 1 + 0.5 - 0.25 = 2.25
    expect(terms.base).toBe(1);
    expect(terms.randomAssignmentTerm).toBe(1);
    expect(terms.voluntaryWorkTerm).toBe(0.5);
    expect(terms.recencyPenaltyTerm).toBe(-0.25);
    expect(terms.raw).toBeCloseTo(2.25, 10);
    expect(terms.weight).toBeCloseTo(2.25, 10);
  });

  it('favours whoever has absorbed less random work', () => {
    const averages = { avgRandomAssignments: 3, avgVoluntaryCompletions: 0 };
    const light = weightedFairnessWeight(cfg, metrics({ randomAssignments: 0 }), averages);
    const heavy = weightedFairnessWeight(cfg, metrics({ randomAssignments: 6 }), averages);
    expect(light.weight).toBeGreaterThan(heavy.weight);
  });

  it('never drops below the configured floor', () => {
    const overloaded = metrics({ randomAssignments: 1000, daysSinceLastRandomAssignment: 0 });
    const terms = weightedFairnessWeight(cfg, overloaded, {
      avgRandomAssignments: 0,
      avgVoluntaryCompletions: 0,
    });
    expect(terms.raw).toBeLessThan(0);
    expect(terms.weight).toBe(cfg.fairness.weightFloor);
    expect(terms.weight).toBeGreaterThan(0);
  });

  it('averages over the candidate set', () => {
    expect(
      fairnessAverages([
        metrics({ randomAssignments: 0, voluntaryCompletions: 4 }),
        metrics({ randomAssignments: 2, voluntaryCompletions: 0 }),
        metrics({ randomAssignments: 4, voluntaryCompletions: 2 }),
      ]),
    ).toEqual({ avgRandomAssignments: 2, avgVoluntaryCompletions: 2 });
    expect(fairnessAverages([])).toEqual({ avgRandomAssignments: 0, avgVoluntaryCompletions: 0 });
  });
});

describe('the weighted draw (§6.8)', () => {
  it('is deterministic under a seeded RNG', () => {
    const a = drawWeighted([1, 1, 1, 1], mulberry32(42));
    const b = drawWeighted([1, 1, 1, 1], mulberry32(42));
    expect(a.index).toBe(b.index);
    expect(a.draw).toBe(b.draw);
  });

  it('normalizes weights into probabilities that sum to 1', () => {
    const { probabilities } = drawWeighted([1, 3], mulberry32(1));
    expect(probabilities).toEqual([0.25, 0.75]);
  });

  it('never selects a zero-weight candidate', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      expect(drawWeighted([0, 0, 1], rng).index).toBe(2);
    }
  });

  it('respects the weights over many draws', () => {
    const rng = mulberry32(2026);
    const counts = [0, 0];
    for (let i = 0; i < 20_000; i += 1) {
      const { index } = drawWeighted([1, 3], rng);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    const share = (counts[1] ?? 0) / 20_000;
    expect(share).toBeGreaterThan(0.72);
    expect(share).toBeLessThan(0.78);
  });
});

describe('every strategy is implemented and configurable (§6.11)', () => {
  it('has a function for each value of the config enum', () => {
    for (const strategy of Object.values(AssignmentStrategy)) {
      expect(typeof ASSIGNMENT_STRATEGIES[strategy]).toBe('function');
    }
    expect(Object.keys(ASSIGNMENT_STRATEGIES).sort()).toEqual(
      Object.values(AssignmentStrategy).sort(),
    );
  });

  it('PURE_RANDOM gives every candidate the same weight', () => {
    const weights = ASSIGNMENT_STRATEGIES.PURE_RANDOM(FAMILY.map((id) => candidate(id)), cfg);
    expect(weights.map((w) => w.weight)).toEqual([1, 1, 1, 1]);
  });

  it('LEAST_ASSIGNED_FIRST zeroes everyone above the minimum', () => {
    const weights = ASSIGNMENT_STRATEGIES.LEAST_ASSIGNED_FIRST(
      [
        candidate('anna', { metrics: metrics({ randomAssignments: 5 }) }),
        candidate('paul', { metrics: metrics({ randomAssignments: 1 }) }),
        candidate('maria', { metrics: metrics({ randomAssignments: 1 }) }),
      ],
      cfg,
    );
    expect(weights.map((w) => w.weight)).toEqual([0, 1, 1]);
  });
});

describe('§34 / PRD §3E — no member is ever systematically excluded', () => {
  const draws = 8_000;

  const run = (
    strategy: HouseholdConfig['assignment']['strategy'],
    candidates: EligibilityCandidate[],
  ): Map<string, number> => {
    const config = patch((c) => (c.assignment.strategy = strategy));
    const rng = mulberry32(20260830);
    const counts = new Map<string, number>(candidates.map((c) => [c.memberId, 0]));

    for (let i = 0; i < draws; i += 1) {
      const outcome = selectAssignee({
        cfg: config,
        candidates,
        options: OPTIONS,
        configVersion: 1,
        decidedAt: '2026-08-30T12:00:00.000Z',
        rng,
      });
      const selected = outcome.selectedMemberId;
      expect(selected).not.toBeNull();
      counts.set(selected as string, (counts.get(selected as string) ?? 0) + 1);
    }
    return counts;
  };

  it('WEIGHTED_FAIRNESS reaches every eligible member, even a heavily loaded one', () => {
    // Anna has absorbed far more random work than anyone and was picked
    // yesterday, so her weight sits at the floor. She must still be reachable —
    // that is exactly what the floor is for.
    const candidates = [
      candidate('anna', {
        metrics: metrics({ randomAssignments: 40, daysSinceLastRandomAssignment: 0 }),
      }),
      candidate('paul', { metrics: metrics({ randomAssignments: 1 }) }),
      candidate('maria', { metrics: metrics({ randomAssignments: 2 }) }),
      candidate('hannes', { metrics: metrics({ randomAssignments: 3 }) }),
    ];

    const counts = run(AssignmentStrategy.WEIGHTED_FAIRNESS, candidates);
    for (const [memberId, count] of counts) {
      expect(count, `${memberId} was never selected`).toBeGreaterThan(0);
    }
    // The heavily loaded member is protected but not excluded.
    expect(counts.get('anna')).toBeLessThan(counts.get('paul') as number);
  });

  it('WEIGHTED_FAIRNESS spreads an equal-history household roughly evenly', () => {
    const candidates = FAMILY.map((id) => candidate(id));
    const counts = run(AssignmentStrategy.WEIGHTED_FAIRNESS, candidates);
    const expected = draws / FAMILY.length;
    for (const [memberId, count] of counts) {
      // §34's end condition: nobody above 1.5x the mean random load.
      expect(count, `${memberId} drifted from the mean`).toBeGreaterThan(expected * 0.85);
      expect(count, `${memberId} drifted from the mean`).toBeLessThan(expected * 1.15);
    }
  });

  it('PURE_RANDOM is uniform', () => {
    const counts = run(AssignmentStrategy.PURE_RANDOM, FAMILY.map((id) => candidate(id)));
    const expected = draws / FAMILY.length;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });

  it('WEIGHTED_RANDOM reaches everyone too', () => {
    const candidates = [
      candidate('anna', { metrics: metrics({ randomAssignments: 40 }) }),
      candidate('paul', { metrics: metrics({ randomAssignments: 0 }) }),
      candidate('maria', { metrics: metrics({ randomAssignments: 1 }) }),
    ];
    for (const count of run(AssignmentStrategy.WEIGHTED_RANDOM, candidates).values()) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it('LEAST_ASSIGNED_FIRST concentrates on the least loaded, breaking ties uniformly', () => {
    const candidates = [
      candidate('anna', { metrics: metrics({ randomAssignments: 5 }) }),
      candidate('paul', { metrics: metrics({ randomAssignments: 1 }) }),
      candidate('maria', { metrics: metrics({ randomAssignments: 1 }) }),
    ];
    const counts = run(AssignmentStrategy.LEAST_ASSIGNED_FIRST, candidates);
    expect(counts.get('anna')).toBe(0);
    expect(counts.get('paul')).toBeGreaterThan(draws * 0.4);
    expect(counts.get('maria')).toBeGreaterThan(draws * 0.4);
  });
});

describe('the selection trace (§6.10, §32)', () => {
  it('records every candidate, its weight terms and the winner', () => {
    const candidates = [
      candidate('anna', { isAbsent: true }),
      candidate('paul', { metrics: metrics({ randomAssignments: 1 }) }),
      candidate('maria', { metrics: metrics({ randomAssignments: 3 }) }),
    ];

    const outcome = selectAssignee({
      cfg,
      candidates,
      options: OPTIONS,
      configVersion: 7,
      decidedAt: '2026-08-30T12:00:00.000Z',
      rng: mulberry32(1),
    });

    expect(outcome.trace.strategy).toBe('WEIGHTED_FAIRNESS');
    expect(outcome.trace.configVersion).toBe(7);
    expect(outcome.trace.windowDays).toBe(28);
    expect(outcome.trace.candidates).toHaveLength(3);

    const anna = outcome.trace.candidates.find((c) => c.memberId === 'anna');
    expect(anna?.included).toBe(false);
    expect(anna?.exclusionReason).toBe('MEMBER_ABSENT');
    expect(anna?.weight).toBeNull();

    const paul = outcome.trace.candidates.find((c) => c.memberId === 'paul');
    expect(paul?.included).toBe(true);
    expect(paul?.weight).toBeGreaterThan(0);
    expect(paul?.probability).toBeGreaterThan(0);
    // §32 wants the number explained, not merely asserted.
    expect(paul?.weightTerms).toMatchObject({ base: 1 });

    expect(outcome.trace.candidates.filter((c) => c.selected)).toHaveLength(1);
    expect(outcome.selectedMemberId).not.toBe('anna');
  });

  it('keeps the raw draw out of the trace and hands it back separately (§32)', () => {
    const outcome = selectAssignee({
      cfg,
      candidates: FAMILY.map((id) => candidate(id)),
      options: OPTIONS,
      configVersion: 1,
      decidedAt: '2026-08-30T12:00:00.000Z',
      rng: mulberry32(5),
    });
    expect(JSON.stringify(outcome.trace)).not.toMatch(/"draw"/);
    expect(outcome.draw).toBeGreaterThanOrEqual(0);
    expect(outcome.draw).toBeLessThan(1);
  });

  it('returns no assignee and a full trace when nobody is eligible (T5)', () => {
    const outcome = selectAssignee({
      cfg,
      candidates: FAMILY.map((id) => candidate(id, { isActive: false })),
      options: OPTIONS,
      configVersion: 1,
      decidedAt: '2026-08-30T12:00:00.000Z',
      rng: mulberry32(1),
    });
    expect(outcome.selectedMemberId).toBeNull();
    expect(outcome.draw).toBeNull();
    expect(outcome.trace.candidates.every((c) => !c.included)).toBe(true);
    expect(outcome.trace.candidates.every((c) => c.exclusionReason === 'MEMBER_INACTIVE')).toBe(
      true,
    );
  });
});
