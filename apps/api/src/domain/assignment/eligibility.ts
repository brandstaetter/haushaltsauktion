/**
 * Eligibility filter and relaxation ladder (Architektur §6.9, §6.12, PRD §3D).
 *
 * Eight ordered predicates, plus two more added by intake
 * "task-role-based-eligibility-and-preferred-assignee". Rules 1–5 are
 * **hard**: they are never relaxed, and they are the only ones that gate
 * volunteering — assigning a chore to someone on holiday or explicitly
 * excluded is worse than leaving it unassigned. Rules 6 and 7 are fairness
 * protections against being *given* work, so they never block someone who
 * wants the task. Rule 8 (intake "points-shop-virtual-gamification-items")
 * is hard for the random draw but, unlike rules 1–5, does not gate
 * volunteering — an immunity potion buys out of being *drawn*, not out of
 * *choosing* to help. It is evaluated separately from `hardEligibilityReason`
 * for exactly that reason: folding it into rules 1–5 would also block
 * volunteering, which the intake explicitly forbids.
 *
 * `ROLE_NOT_ELIGIBLE` (a definition-level role restriction) and
 * `ADMIN_SLOT_RESERVED` (a multi-worker admin-headcount guarantee) are
 * evaluated *inside* `hardEligibilityReason`, alongside rules 1–5 — they are
 * hard and gate volunteering exactly like the original five, they are just
 * newer and configured differently (per-definition scalar / per-fill-attempt
 * boolean rather than a per-member join row).
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2). "Now" arrives already
 * folded into `isAbsent` and `hasActiveImmunity`; the caller resolved the
 * absence/effect windows against the injected clock.
 */

import {
  EligibilityReason,
  MemberRole,
  RelaxableConstraint,
  type FairnessMetrics,
  type HouseholdConfig,
  type RelaxedConstraint,
} from '@haushaltsauktion/shared';

import { ForbiddenError } from '../errors.js';

export interface EligibilityCandidate {
  memberId: string;
  /** Intake "task-role-based-eligibility-and-preferred-assignee". */
  role: MemberRole;
  /**
   * Intake "task-role-based-eligibility-and-preferred-assignee" — a
   * `TaskDefinitionPreferredAssignee` row exists for this member and task.
   * Consulted only by `weights.ts`' `WEIGHTED_FAIRNESS` term, never by
   * eligibility itself: a preference is soft and must never exclude anyone.
   */
  isPreferredAssignee: boolean;
  /** rule 1 — `HouseholdMember.isActive` */
  isActive: boolean;
  /** rule 2 — an absence window covers the decision instant */
  isAbsent: boolean;
  /** rule 3 — a `TaskDefinitionEligibility.EXCLUDED` row exists */
  excludedFromTask: boolean;
  /** rule 4 — the definition has INCLUDED rows and this member is one of them */
  inAllowlist: boolean;
  /** rule 5 — a `MemberCategoryExclusion` covers the task's category */
  categoryExcluded: boolean;
  /** rule 6 — random assignments already taken in the current ISO week (§5.6) */
  randomAssignmentsThisWeek: number;
  /** rule 6 — `HouseholdMember.maxRandomAssignmentsPerWeek`; null = uncapped */
  maxRandomAssignmentsPerWeek: number | null;
  /**
   * rule 7 — completed offer cycles since this member last held **this task**
   * by random draw. `0` means they held it in the cycle immediately before;
   * `null` means never.
   */
  cyclesSinceLastRandomAssignmentOfTask: number | null;
  /**
   * rule 8 (§6.12, intake "points-shop-virtual-gamification-items") — an
   * unexpired `MemberEffect` of type IMMUNITY covers the decision instant.
   * Hard for the random draw, never relaxed, never consulted by
   * `assertCanVolunteer`/`canVolunteer`.
   */
  hasActiveImmunity: boolean;
  metrics: FairnessMetrics;
}

/** Rule 4 is only meaningful when the definition actually has an allowlist. */
export interface EligibilityOptions {
  definitionHasAllowlist: boolean;
  /**
   * Intake "task-role-based-eligibility-and-preferred-assignee" —
   * `TaskDefinition.requiredRole`. `null` = no role filter (default, every
   * pre-existing definition behaves exactly as before this feature).
   */
  requiredRole: MemberRole | null;
  /**
   * Intake "task-role-based-eligibility-and-preferred-assignee" — true when
   * every remaining open slot on this instance must go to an admin for
   * `TaskDefinition.minAdminSlots` to still be reachable
   * (`worker-slots.ts` `adminSlotReservationActive`). Computed fresh by the
   * caller before *each* fill attempt — never a static, once-per-instance
   * value — so an already-filled non-admin slot is never retroactively
   * evicted, only the *next* join is gated.
   */
  adminSlotReserved: boolean;
}

export interface EligibilityEvaluation {
  memberId: string;
  included: boolean;
  reason: EligibilityReason | null;
}

/** §6.9 rules 1–5. Never relaxed, and the only ones volunteering consults. */
export function hardEligibilityReason(
  candidate: EligibilityCandidate,
  options: EligibilityOptions,
): EligibilityReason | null {
  if (!candidate.isActive) return EligibilityReason.MEMBER_INACTIVE;
  if (candidate.isAbsent) return EligibilityReason.MEMBER_ABSENT;
  // EXCLUDED always subtracts and wins over INCLUDED (§1.3).
  if (candidate.excludedFromTask) return EligibilityReason.EXCLUDED_FROM_TASK;
  if (options.definitionHasAllowlist && !candidate.inAllowlist) {
    return EligibilityReason.NOT_IN_ALLOWLIST;
  }
  if (candidate.categoryExcluded) return EligibilityReason.CATEGORY_EXCLUDED;
  // Additional hard rules (intake
  // "task-role-based-eligibility-and-preferred-assignee"), evaluated after
  // rules 1-5 but with the same never-relaxed, gates-volunteering semantics.
  if (options.requiredRole !== null && candidate.role !== options.requiredRole) {
    return EligibilityReason.ROLE_NOT_ELIGIBLE;
  }
  if (options.adminSlotReserved && candidate.role !== MemberRole.ADMIN) {
    return EligibilityReason.ADMIN_SLOT_RESERVED;
  }
  return null;
}

/**
 * §6.9 rules 6–7. Relaxable, and never applied to a volunteer.
 *
 * The cooldown (rule 7) is evaluated **before** the weekly cap (rule 6),
 * deliberately inverting §6.9's numbering. The relaxation ladder drops the
 * cooldown first because being drawn twice in a row is the milder imposition;
 * if the cap were reported first it would mask the cooldown, and the ladder
 * would end up relaxing the two constraints in the opposite order to the one
 * the architecture chose. Evaluating in ladder order keeps the reported reason
 * and the relaxation order consistent.
 */
export function softEligibilityReason(
  cfg: HouseholdConfig,
  candidate: EligibilityCandidate,
  relaxed: ReadonlySet<RelaxableConstraint>,
): EligibilityReason | null {
  if (!relaxed.has(RelaxableConstraint.IMMEDIATE_REASSIGNMENT)) {
    if (cfg.assignment.preventImmediateReassignment) {
      const since = candidate.cyclesSinceLastRandomAssignmentOfTask;
      if (since !== null && since < cfg.assignment.reassignmentCooldownCycles) {
        return EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED;
      }
    }
  }
  if (!relaxed.has(RelaxableConstraint.ASSIGNMENT_CAP)) {
    const cap = candidate.maxRandomAssignmentsPerWeek;
    if (cap !== null && candidate.randomAssignmentsThisWeek >= cap) {
      return EligibilityReason.RANDOM_ASSIGNMENT_CAP_REACHED;
    }
  }
  return null;
}

/** Which soft constraint a rejection reason belongs to, for the ladder. */
const CONSTRAINT_OF: Partial<Record<EligibilityReason, RelaxableConstraint>> = {
  [EligibilityReason.IMMEDIATE_REASSIGNMENT_BLOCKED]: RelaxableConstraint.IMMEDIATE_REASSIGNMENT,
  [EligibilityReason.RANDOM_ASSIGNMENT_CAP_REACHED]: RelaxableConstraint.ASSIGNMENT_CAP,
};

function evaluate(
  cfg: HouseholdConfig,
  candidate: EligibilityCandidate,
  options: EligibilityOptions,
  relaxed: ReadonlySet<RelaxableConstraint>,
): EligibilityEvaluation {
  const hard = hardEligibilityReason(candidate, options);
  if (hard !== null) return { memberId: candidate.memberId, included: false, reason: hard };
  // Rule 8 — checked here, between the hard and soft rules, not inside
  // `hardEligibilityReason`: that function is also what `assertCanVolunteer`
  // consults, and immunity must never block volunteering (§6.12).
  if (candidate.hasActiveImmunity) {
    return { memberId: candidate.memberId, included: false, reason: EligibilityReason.MEMBER_IMMUNE };
  }
  const soft = softEligibilityReason(cfg, candidate, relaxed);
  if (soft !== null) return { memberId: candidate.memberId, included: false, reason: soft };
  return { memberId: candidate.memberId, included: true, reason: null };
}

export interface EligibilityResult {
  /** Candidates the draw may choose from. Empty means T5 (§2.2). */
  eligible: EligibilityCandidate[];
  /** Every candidate, included or not, with the reason — feeds §32 and the audit log. */
  evaluations: EligibilityEvaluation[];
  /** Which soft constraints the ladder had to drop, in the order it dropped them. */
  constraintsRelaxed: RelaxedConstraint[];
}

/**
 * §6.9's relaxation ladder (PRD §3D).
 *
 * `preventImmediateReassignment` deadlocks a task permanently if the person who
 * just had it is the only eligible candidate. So the constraint degrades rather
 * than starving the chore: drop the cooldown, then drop the weekly cap, and
 * record `constraint_relaxed` either way — §6 requires the exclusion reasoning
 * be visible, and this is precisely the case where a person deserves to see why
 * they were picked again.
 *
 * Rules 1–5 are never in the ladder.
 */
export function resolveEligibility(
  cfg: HouseholdConfig,
  candidates: readonly EligibilityCandidate[],
  options: EligibilityOptions,
): EligibilityResult {
  const ladder: readonly RelaxableConstraint[] = [
    RelaxableConstraint.IMMEDIATE_REASSIGNMENT,
    RelaxableConstraint.ASSIGNMENT_CAP,
  ];

  const relaxed = new Set<RelaxableConstraint>();
  const constraintsRelaxed: RelaxedConstraint[] = [];

  for (;;) {
    const evaluations = candidates.map((c) => evaluate(cfg, c, options, relaxed));
    const includedIds = new Set(evaluations.filter((e) => e.included).map((e) => e.memberId));
    const eligible = candidates.filter((c) => includedIds.has(c.memberId));

    if (eligible.length > 0 || !cfg.assignment.relaxConstraintsWhenNoCandidates) {
      return { eligible, evaluations, constraintsRelaxed };
    }

    // Only relax a constraint that is *actually* blocking somebody. Walking the
    // ladder blindly would record "wir haben die Sperre gelockert" in the
    // history and in `/explain` for a task where every candidate is on holiday
    // — a rung that changed nothing, reported as though it had. §6 requires the
    // exclusion reasoning to be true, so an ineffective rung is not recorded.
    const blocking = new Set(
      evaluations
        .map((e) => (e.reason === null ? undefined : CONSTRAINT_OF[e.reason]))
        .filter((c): c is RelaxableConstraint => c !== undefined),
    );

    const next = ladder.find((c) => !relaxed.has(c) && blocking.has(c));
    if (next === undefined) {
      // Nothing left the ladder can do: T5 — no assignment, notify the admins.
      return { eligible: [], evaluations, constraintsRelaxed };
    }

    relaxed.add(next);
    constraintsRelaxed.push({ constraint: next, reason: 'NO_ELIGIBLE_CANDIDATES' });
  }
}

/**
 * §5 / T3 — volunteering checks rules 1–5 only. Caps and cooldowns exist to
 * protect people from being *given* work; they must never stop someone who is
 * offering to do it.
 */
export function assertCanVolunteer(
  candidate: EligibilityCandidate,
  options: EligibilityOptions,
): void {
  const reason = hardEligibilityReason(candidate, options);
  if (reason !== null) {
    throw new ForbiddenError('NOT_ELIGIBLE', 'Diese Aufgabe ist für dich nicht freigegeben.', {
      reason,
    });
  }
}

export function canVolunteer(
  candidate: EligibilityCandidate,
  options: EligibilityOptions,
): boolean {
  return hardEligibilityReason(candidate, options) === null;
}
