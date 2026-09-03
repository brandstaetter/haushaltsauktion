/**
 * §6.9 — the eligibility filter and the relaxation ladder (PRD §3D).
 *
 * Two properties matter most: hard rules are never relaxed, and a task can
 * never starve because the only eligible person is the one who just had it.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG,
  EligibilityReason,
  RelaxableConstraint,
  cloneDefaultConfig,
  type FairnessMetrics,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { ForbiddenError } from '../../src/domain/errors.js';
import {
  assertCanVolunteer,
  canVolunteer,
  hardEligibilityReason,
  resolveEligibility,
  softEligibilityReason,
  type EligibilityCandidate,
} from '../../src/domain/assignment/eligibility.js';

const cfg = DEFAULT_CONFIG;
const NO_ALLOWLIST = { definitionHasAllowlist: false };
const WITH_ALLOWLIST = { definitionHasAllowlist: true };

const metrics: FairnessMetrics = {
  randomAssignments: 0,
  voluntaryCompletions: 0,
  buyouts: 0,
  completedTasks: 0,
  totalEstimatedMinutes: 0,
  daysSinceLastRandomAssignment: 28,
};

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
  metrics,
  ...over,
});

const patch = (mutate: (c: HouseholdConfig) => void): HouseholdConfig => {
  const next = cloneDefaultConfig();
  mutate(next);
  return next;
};

describe('hard rules 1-5 (§6.9)', () => {
  it('rejects an inactive member', () => {
    expect(hardEligibilityReason(candidate('a', { isActive: false }), NO_ALLOWLIST)).toBe(
      EligibilityReason.MEMBER_INACTIVE,
    );
  });

  it('rejects an absent member', () => {
    expect(hardEligibilityReason(candidate('a', { isAbsent: true }), NO_ALLOWLIST)).toBe(
      EligibilityReason.MEMBER_ABSENT,
    );
  });

  it('rejects a member excluded from this task', () => {
    expect(hardEligibilityReason(candidate('a', { excludedFromTask: true }), NO_ALLOWLIST)).toBe(
      EligibilityReason.EXCLUDED_FROM_TASK,
    );
  });

  it('applies the allowlist only when the definition has one', () => {
    const outsider = candidate('a', { inAllowlist: false });
    expect(hardEligibilityReason(outsider, NO_ALLOWLIST)).toBeNull();
    expect(hardEligibilityReason(outsider, WITH_ALLOWLIST)).toBe(
      EligibilityReason.NOT_IN_ALLOWLIST,
    );
  });

  it('lets EXCLUDED win over INCLUDED', () => {
    const both = candidate('a', { inAllowlist: true, excludedFromTask: true });
    expect(hardEligibilityReason(both, WITH_ALLOWLIST)).toBe(
      EligibilityReason.EXCLUDED_FROM_TASK,
    );
  });

  it('rejects a member excluded from the category', () => {
    expect(hardEligibilityReason(candidate('a', { categoryExcluded: true }), NO_ALLOWLIST)).toBe(
      EligibilityReason.CATEGORY_EXCLUDED,
    );
  });

  it('accepts an unencumbered member', () => {
    expect(hardEligibilityReason(candidate('a'), NO_ALLOWLIST)).toBeNull();
  });
});

describe('soft rules 6-7 never block a volunteer (§6.9, §5)', () => {
  const capped = candidate('a', {
    randomAssignmentsThisWeek: 3,
    maxRandomAssignmentsPerWeek: 3,
    cyclesSinceLastRandomAssignmentOfTask: 0,
  });

  it('flags the weekly cap and the cooldown for a random draw', () => {
    const none = new Set<RelaxableConstraint>();
    const capOnly = candidate('a', {
      randomAssignmentsThisWeek: 3,
      maxRandomAssignmentsPerWeek: 3,
    });
    expect(softEligibilityReason(cfg, capOnly, none)).toBe(
      EligibilityReason.RANDOM_ASSIGNMENT_CAP_REACHED,
    );
    const cooldownOnly = candidate('a', { cyclesSinceLastRandomAssignmentOfTask: 0 });
    expect(softEligibilityReason(cfg, cooldownOnly, none)).toBe(
      EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED,
    );
  });

  it('reports the cooldown first when both apply, matching the ladder order', () => {
    // The ladder drops the cooldown before the cap, so the reason has to
    // surface in that order too — otherwise the cap would mask the cooldown and
    // the two would be relaxed in the opposite order to the documented one.
    expect(softEligibilityReason(cfg, capped, new Set())).toBe(
      EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED,
    );
  });

  it('still lets that same member volunteer', () => {
    // Caps and cooldowns protect people from being GIVEN work. They must never
    // stop someone who is offering to do it.
    expect(canVolunteer(capped, NO_ALLOWLIST)).toBe(true);
    expect(() => assertCanVolunteer(capped, NO_ALLOWLIST)).not.toThrow();
  });

  it('blocks a volunteer only on a hard rule, with the reason in the error', () => {
    try {
      assertCanVolunteer(candidate('a', { isAbsent: true }), NO_ALLOWLIST);
      expect.unreachable('an absent member must not be able to volunteer');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      const forbidden = error as ForbiddenError;
      expect(forbidden.code).toBe('NOT_ELIGIBLE');
      expect(forbidden.details).toMatchObject({ reason: EligibilityReason.MEMBER_ABSENT });
    }
  });

  it('honours preventImmediateReassignment = false', () => {
    const relaxedConfig = patch((c) => (c.assignment.preventImmediateReassignment = false));
    const justHadIt = candidate('a', { cyclesSinceLastRandomAssignmentOfTask: 0 });
    expect(softEligibilityReason(relaxedConfig, justHadIt, new Set())).toBeNull();
  });

  it('honours a longer cooldown', () => {
    const longer = patch((c) => (c.assignment.reassignmentCooldownCycles = 3));
    expect(
      softEligibilityReason(longer, candidate('a', { cyclesSinceLastRandomAssignmentOfTask: 2 }), new Set()),
    ).toBe(EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED);
    expect(
      softEligibilityReason(longer, candidate('a', { cyclesSinceLastRandomAssignmentOfTask: 3 }), new Set()),
    ).toBeNull();
  });
});

describe('rule 8 — immunity blocks the draw but never volunteering (§6.12)', () => {
  it('excludes an immune member from hardEligibilityReason\'s caller path (evaluate, via resolveEligibility)', () => {
    const result = resolveEligibility(
      cfg,
      [candidate('anna', { hasActiveImmunity: true }), candidate('paul')],
      NO_ALLOWLIST,
    );
    expect(result.eligible.map((c) => c.memberId)).toEqual(['paul']);
    expect(result.evaluations.find((e) => e.memberId === 'anna')?.reason).toBe(
      EligibilityReason.MEMBER_IMMUNE,
    );
  });

  it('is never relaxed — the ladder leaves the eligible set empty (T5) rather than including the immune member', () => {
    // Anna is the only candidate and she is immune. Unlike the cooldown/cap
    // rungs, there is no ladder step for immunity — it must not be dropped
    // even though `relaxConstraintsWhenNoCandidates` is on.
    const result = resolveEligibility(
      cfg,
      [candidate('anna', { hasActiveImmunity: true })],
      NO_ALLOWLIST,
    );
    expect(result.eligible).toEqual([]);
    expect(result.constraintsRelaxed).toEqual([]);
    expect(result.evaluations[0]?.reason).toBe(EligibilityReason.MEMBER_IMMUNE);
  });

  it('still lets an immune member volunteer', () => {
    const immune = candidate('anna', { hasActiveImmunity: true });
    expect(canVolunteer(immune, NO_ALLOWLIST)).toBe(true);
    expect(() => assertCanVolunteer(immune, NO_ALLOWLIST)).not.toThrow();
    // hardEligibilityReason itself — what assertCanVolunteer/canVolunteer
    // consult — must not even see hasActiveImmunity.
    expect(hardEligibilityReason(immune, NO_ALLOWLIST)).toBeNull();
  });
});

describe('the relaxation ladder (PRD §3D)', () => {
  it('relaxes nothing when somebody is already eligible', () => {
    const result = resolveEligibility(
      cfg,
      [candidate('anna'), candidate('paul', { isAbsent: true })],
      NO_ALLOWLIST,
    );
    expect(result.eligible.map((c) => c.memberId)).toEqual(['anna']);
    expect(result.constraintsRelaxed).toEqual([]);
  });

  it('drops the cooldown rather than starving the task', () => {
    // Anna is the only person left and she just had this chore. Strict
    // enforcement would deadlock it permanently.
    const result = resolveEligibility(
      cfg,
      [
        candidate('anna', { cyclesSinceLastRandomAssignmentOfTask: 0 }),
        candidate('paul', { isActive: false }),
      ],
      NO_ALLOWLIST,
    );
    expect(result.eligible.map((c) => c.memberId)).toEqual(['anna']);
    expect(result.constraintsRelaxed).toEqual([
      { constraint: RelaxableConstraint.IMMEDIATE_REASSIGNMENT, reason: 'NO_ELIGIBLE_CANDIDATES' },
    ]);
  });

  it('drops the weekly cap next, recording both relaxations in order', () => {
    const result = resolveEligibility(
      cfg,
      [
        candidate('anna', {
          cyclesSinceLastRandomAssignmentOfTask: 0,
          randomAssignmentsThisWeek: 2,
          maxRandomAssignmentsPerWeek: 2,
        }),
      ],
      NO_ALLOWLIST,
    );
    expect(result.eligible.map((c) => c.memberId)).toEqual(['anna']);
    expect(result.constraintsRelaxed.map((r) => r.constraint)).toEqual([
      RelaxableConstraint.IMMEDIATE_REASSIGNMENT,
      RelaxableConstraint.ASSIGNMENT_CAP,
    ]);
  });

  it('never relaxes a hard rule — an absent person is left alone', () => {
    const result = resolveEligibility(
      cfg,
      [
        candidate('anna', { isAbsent: true }),
        candidate('paul', { isActive: false }),
        candidate('maria', { categoryExcluded: true }),
        candidate('hannes', { excludedFromTask: true }),
      ],
      NO_ALLOWLIST,
    );
    // Leaving the chore unassigned beats assigning it to someone on holiday.
    expect(result.eligible).toEqual([]);
    // And nothing is recorded as relaxed: no soft constraint was ever the
    // obstacle, so claiming one had been dropped would be a false explanation.
    expect(result.constraintsRelaxed).toEqual([]);
    expect(result.evaluations.map((e) => e.reason)).toEqual([
      EligibilityReason.MEMBER_ABSENT,
      EligibilityReason.MEMBER_INACTIVE,
      EligibilityReason.CATEGORY_EXCLUDED,
      EligibilityReason.EXCLUDED_FROM_TASK,
    ]);
  });

  it('records only the rung that was actually blocking', () => {
    // Only the weekly cap stands in the way, so the cooldown rung is skipped
    // rather than reported as a relaxation that changed nothing.
    const result = resolveEligibility(
      cfg,
      [
        candidate('anna', { randomAssignmentsThisWeek: 2, maxRandomAssignmentsPerWeek: 2 }),
        candidate('paul', { isAbsent: true }),
      ],
      NO_ALLOWLIST,
    );
    expect(result.eligible.map((c) => c.memberId)).toEqual(['anna']);
    expect(result.constraintsRelaxed.map((r) => r.constraint)).toEqual([
      RelaxableConstraint.ASSIGNMENT_CAP,
    ]);
  });

  it('does not relax anything when the fallback is switched off', () => {
    const strict = patch((c) => (c.assignment.relaxConstraintsWhenNoCandidates = false));
    const result = resolveEligibility(
      strict,
      [candidate('anna', { cyclesSinceLastRandomAssignmentOfTask: 0 })],
      NO_ALLOWLIST,
    );
    expect(result.eligible).toEqual([]);
    expect(result.constraintsRelaxed).toEqual([]);
    expect(result.evaluations[0]?.reason).toBe(EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED);
  });

  it('reports an evaluation for every candidate, included or not', () => {
    const result = resolveEligibility(
      cfg,
      [candidate('anna'), candidate('paul'), candidate('maria', { isAbsent: true })],
      NO_ALLOWLIST,
    );
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations.filter((e) => e.included)).toHaveLength(2);
  });
});
