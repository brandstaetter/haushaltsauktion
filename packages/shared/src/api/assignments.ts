/**
 * Fairness transparency (Architektur §3.6, §6.10; CLAUDE.md §32).
 *
 * Answers "Warum wurde mir diese Aufgabe zugewiesen?" from the trace stored at
 * assignment time, so the answer stays true even after the weights change.
 */

import type { AssignmentStrategy } from '../domain/enums.js';
import type { EligibilityReason, RelaxedConstraint } from '../domain/reasons.js';

/** The per-member inputs of §12's criteria, over `fairness.windowDays`. */
export interface FairnessMetrics {
  randomAssignments: number;
  voluntaryCompletions: number;
  buyouts: number;
  completedTasks: number;
  totalEstimatedMinutes: number;
  /** `windowDays` for a member with no random assignment in the window (§6.8). */
  daysSinceLastRandomAssignment: number;
}

export interface SelectionCandidateTrace {
  memberId: string;
  included: boolean;
  exclusionReason: EligibilityReason | null;
  metrics: FairnessMetrics | null;
  /** Per-term breakdown of §6.8's formula, so the number is explainable. */
  weightTerms: Record<string, number> | null;
  weight: number | null;
  probability: number | null;
  selected: boolean;
}

/** Stored on `TaskAssignment.selectionTrace`. Never contains the raw draw. */
export interface SelectionTrace {
  strategy: AssignmentStrategy;
  configVersion: number;
  decidedAt: string;
  windowDays: number;
  constraintsRelaxed: RelaxedConstraint[];
  candidates: SelectionCandidateTrace[];
}

/** `GET /api/assignments/:id/explain` (Reconciliation §1.2 — `/explain`). */
export interface SelectionExplanationDto {
  assignmentId: string;
  strategy: AssignmentStrategy;
  decidedAt: string;
  configVersion: number;
  /** "Für diese Aufgabe waren 4 Personen verfügbar." */
  eligibleCount: number;
  constraintsRelaxed: RelaxedConstraint[];
  candidates: Array<
    Omit<SelectionCandidateTrace, 'metrics'> & {
      displayName: string;
    }
  >;
}
