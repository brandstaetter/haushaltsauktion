/**
 * Machine-readable reason codes (Architektur §6.9, §3.13).
 *
 * These are stored in `TaskAssignment.selectionTrace` and returned by
 * `GET /api/assignments/:id/explain`, so the German rendering lives in the web
 * app and the stored data stays prose-free (§0, §2.6).
 */

function asEnum<const T extends Record<string, string>>(members: T): Readonly<T> {
  return Object.freeze(members);
}

/** §6.9 — ordered predicates of the eligibility filter. */
export const EligibilityReason = asEnum({
  /** rule 1 — hard */
  MEMBER_INACTIVE: 'MEMBER_INACTIVE',
  /** rule 2 — hard */
  MEMBER_ABSENT: 'MEMBER_ABSENT',
  /** rule 3 — hard */
  EXCLUDED_FROM_TASK: 'EXCLUDED_FROM_TASK',
  /** rule 4 — hard */
  NOT_IN_ALLOWLIST: 'NOT_IN_ALLOWLIST',
  /** rule 5 — hard */
  CATEGORY_EXCLUDED: 'CATEGORY_EXCLUDED',
  /** rule 6 — soft, never blocks volunteering */
  RANDOM_ASSIGNMENT_CAP_REACHED: 'RANDOM_ASSIGNMENT_CAP_REACHED',
  /** rule 7 — soft, never blocks volunteering */
  IMMEDIATE_REASSIGNMENT_BLOCKED: 'IMMEDIATE_REASSIGNMENT_BLOCKED',
  /**
   * rule 8 (intake "points-shop-virtual-gamification-items") — hard for the
   * random draw only, and never relaxed: unlike rules 1-5 it does not gate
   * volunteering, and unlike rules 6-7 it is not in `CONSTRAINT_OF`, so the
   * relaxation ladder can never drop it.
   */
  MEMBER_IMMUNE: 'MEMBER_IMMUNE',
  /**
   * Additional hard rule (intake
   * "task-role-based-eligibility-and-preferred-assignee"): the definition
   * restricts this task to one role (`TaskDefinition.requiredRole`) and the
   * candidate does not have it. Hard and never relaxed, exactly like rules
   * 1–5 — evaluated alongside them in `hardEligibilityReason`, so it also
   * gates volunteering, not just the random draw.
   */
  ROLE_NOT_ELIGIBLE: 'ROLE_NOT_ELIGIBLE',
  /**
   * Additional hard rule (same intake): the definition configures
   * `minAdminSlots` and every remaining open slot on this instance must go to
   * an admin for that minimum to still be reachable
   * (`worker-slots.ts` `adminSlotReservationActive`). Hard and never relaxed;
   * never evicts an already-active non-admin slot — it only gates the *next*
   * join, computed fresh before each one.
   */
  ADMIN_SLOT_RESERVED: 'ADMIN_SLOT_RESERVED',
});
export type EligibilityReason = (typeof EligibilityReason)[keyof typeof EligibilityReason];

/**
 * Rules 1–5, plus the two additional hard rules above. Never relaxed (§6.9)
 * and the only ones that gate volunteering.
 */
export const HARD_ELIGIBILITY_REASONS = Object.freeze([
  EligibilityReason.MEMBER_INACTIVE,
  EligibilityReason.MEMBER_ABSENT,
  EligibilityReason.EXCLUDED_FROM_TASK,
  EligibilityReason.NOT_IN_ALLOWLIST,
  EligibilityReason.CATEGORY_EXCLUDED,
  EligibilityReason.ROLE_NOT_ELIGIBLE,
  EligibilityReason.ADMIN_SLOT_RESERVED,
] as const);

/** The constraints the relaxation ladder may drop, in the order it drops them. */
export const RelaxableConstraint = asEnum({
  IMMEDIATE_REASSIGNMENT: 'IMMEDIATE_REASSIGNMENT',
  ASSIGNMENT_CAP: 'ASSIGNMENT_CAP',
});
export type RelaxableConstraint = (typeof RelaxableConstraint)[keyof typeof RelaxableConstraint];

export interface RelaxedConstraint {
  constraint: RelaxableConstraint;
  /** Why the ladder had to drop it — PRD §3D `constraint_relaxed`. */
  reason: 'NO_ELIGIBLE_CANDIDATES';
}

/** Why `BuyoutQuoteDto.allowed` is false (§3.5). */
export const BuyoutDenialReason = asEnum({
  BUYOUT_DISABLED_GLOBALLY: 'BUYOUT_DISABLED_GLOBALLY',
  BUYOUT_DISABLED_FOR_TASK: 'BUYOUT_DISABLED_FOR_TASK',
  NOT_RANDOM_ASSIGNMENT: 'NOT_RANDOM_ASSIGNMENT',
  INSUFFICIENT_POINTS: 'INSUFFICIENT_POINTS',
  WEEKLY_LIMIT_REACHED: 'WEEKLY_LIMIT_REACHED',
  CONSECUTIVE_LIMIT_REACHED: 'CONSECUTIVE_LIMIT_REACHED',
  VALUE_CAP_REACHED: 'VALUE_CAP_REACHED',
  ASSIGNMENT_CLOSED: 'ASSIGNMENT_CLOSED',
});
export type BuyoutDenialReason = (typeof BuyoutDenialReason)[keyof typeof BuyoutDenialReason];
