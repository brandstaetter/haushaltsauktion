/**
 * Task DTOs (Architektur §3.4, §3.5).
 *
 * Every binding number in here was computed server-side (§36). The client
 * displays them and echoes them back for confirmation; it never originates one.
 */

import type {
  AssignmentKind,
  AssignmentResponse,
  BuyoutCostStrategy,
  TaskStatus,
  ValueIncreaseStrategy,
} from '../domain/enums.js';
import type { BuyoutDenialReason, EligibilityReason } from '../domain/reasons.js';

export interface CategoryRefDto {
  id: string;
  name: string;
  colorHex: string | null;
}

export interface MemberRefDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** §20 — the "Offene Aufgaben" card. */
export interface AvailableTaskDto {
  id: string;
  /** ETag for `expectedVersion` (§4.6). */
  version: number;
  title: string;
  description: string | null;
  category: CategoryRefDto | null;
  currentValue: number;
  baseValue: number;
  /** §20 "bisherige Freikäufe" */
  buyoutCount: number;
  estimatedMinutes: number | null;
  dueAt: string | null;
  /** Computed, not stored (§1.4). */
  isOverdue: boolean;
  offerExpiresAt: string | null;
  status: TaskStatus;
  /** Server-computed. If false, the volunteer CTA is disabled with a reason. */
  canVolunteer: boolean;
  ineligibleReason: EligibilityReason | null;
  /** What the caller would earn by volunteering and completing. */
  potentialReward: number;
}

/** §31 — everything the user must see before deciding. All server-computed. */
export interface BuyoutQuoteDto {
  assignmentId: string;
  allowed: boolean;
  disallowedReason: BuyoutDenialReason | null;
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  taskValueBefore: number;
  taskValueAfter: number;
  costStrategy: BuyoutCostStrategy;
  valueIncreaseStrategy: ValueIncreaseStrategy;
  buyoutsUsedThisWeek: number;
  buyoutsAllowedThisWeek: number | null;
  /** The pinned version the quote was computed from (§5.5). */
  configVersion: number;
}

export interface AssignmentSummaryDto {
  id: string;
  /** Member this assignment belongs to; needed so the viewer can tell "mine". */
  memberId: string;
  kind: AssignmentKind;
  response: AssignmentResponse;
  assignedAt: string;
  valueAtAssignment: number;
  /** §7: exactly 0 for RANDOM. Never derived on the client. */
  rewardOnCompletion: number;
  /** null when buyout is not permitted; the reason says why (§21, §31). */
  buyoutQuote: BuyoutQuoteDto | null;
}

/** §21 — the assigned-task screen. */
export interface AssignedTaskDto extends AvailableTaskDto {
  assignment: AssignmentSummaryDto;
}

export interface TaskInstanceDetailDto extends AvailableTaskDto {
  taskDefinitionId: string;
  scheduledFor: string;
  publishedAt: string | null;
  completedAt: string | null;
  completedBy: MemberRefDto | null;
  activeAssignment: AssignmentSummaryDto | null;
}

export interface BuyoutResultDto {
  instance: TaskInstanceDetailDto;
  transaction: PointTransactionRefDto;
  balanceAfter: number;
  taskValueBefore: number;
  taskValueAfter: number;
}

export interface CompletionResultDto {
  instance: TaskInstanceDetailDto;
  /** Exactly 0 for RANDOM (§7, §44). */
  pointsAwarded: number;
  /** null when nothing was awarded — the zero is an absence, not a zero row. */
  transaction: PointTransactionRefDto | null;
  balanceAfter: number;
  valueResetFrom: number;
  valueResetTo: number;
}

/** Minimal ledger reference embedded in mutation results. */
export interface PointTransactionRefDto {
  id: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  createdAt: string;
}

/** Request bodies for the two confirmation-bearing mutations (§3.5). */
export interface VolunteerRequest {
  expectedVersion?: number;
}

export interface CompleteRequest {
  assignmentId: string;
  expectedVersion?: number;
}

/**
 * Reconciliation §1.1 — the echo-confirm protocol. The server recomputes both
 * numbers from the pinned config and rejects with `409 QUOTE_STALE` on any
 * mismatch. These values are only ever *compared*, never used in the
 * computation, so echoing them does not trust the client.
 */
export interface BuyoutRequest {
  acceptedCost: number;
  acceptedNewValue: number;
}
