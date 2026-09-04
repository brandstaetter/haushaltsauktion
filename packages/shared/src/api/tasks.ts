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
  WorkerCountMode,
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
  /**
   * Multi-worker-tasks (Phase 3). How many concurrent slots this instance
   * carries (`workerCount`, under `workerCountMode`) and how many are
   * currently held by an `ACTIVE` assignment (`activeSlotCount`). For every
   * `EXACTLY(1)` task — the default, i.e. every task predating this feature —
   * this is `{ workerCountMode: 'EXACTLY', workerCount: 1, activeSlotCount: 0 | 1 }`,
   * so a client that ignores these fields sees no behavior change.
   */
  workerCountMode: WorkerCountMode;
  workerCount: number;
  activeSlotCount: number;
  /**
   * Bugfix (multi-worker vanish-from-list): whether the viewer holds one of
   * this instance's currently `ACTIVE` slots. An `ASSIGNED` instance with
   * `AT_LEAST`/`AT_MOST` still recruits while a slot is free, so `status`
   * alone can no longer tell a client "the viewer already holds this" —
   * that used to be implicit (only the holder's own request ever saw an
   * `ASSIGNED` row in a viewer-scoped list), but is explicit now that
   * `listAvailableTasks` also returns `ASSIGNED` rows other members can
   * still join.
   */
  viewerHasActiveSlot: boolean;
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

/**
 * §21 — the assigned-task screen. `assignment` stays the caller's *own* slot
 * (viewer-scoped, as before); `activeAssignments` is new (Phase 3) — every
 * currently active slot on the instance, so a multi-worker task can show
 * co-assignees for context even though this DTO answers "what am I on".
 */
export interface AssignedTaskDto extends AvailableTaskDto {
  assignment: AssignmentSummaryDto;
  activeAssignments: AssignmentSummaryDto[];
}

/** Who holds an `ASSIGNED` task, and how they got it — for the household-wide view. */
export interface HouseholdTaskAssigneeDto extends MemberRefDto {
  kind: AssignmentKind;
}

/**
 * §20 extended — the "Alle Aufgaben" tab: every `AVAILABLE`/`ASSIGNED` task in
 * the household, not scoped to the viewer. `assignee` is null for `AVAILABLE`
 * tasks (there isn't one) and set to the first active slot (lowest
 * `slotIndex`) for `ASSIGNED` ones — kept for backward compatibility.
 * `assignees` (Phase 3) is every currently active slot's holder.
 */
export interface HouseholdTaskDto extends AvailableTaskDto {
  assignee: HouseholdTaskAssigneeDto | null;
  assignees: HouseholdTaskAssigneeDto[];
}

/**
 * `activeAssignment` is kept for backward compatibility — the first active
 * slot (lowest `slotIndex`); for an `EXACTLY(1)` task this is the only slot,
 * so existing callers see no change. `activeAssignments` (Phase 3) is every
 * currently active slot, ordered by `slotIndex`.
 */
export interface TaskInstanceDetailDto extends AvailableTaskDto {
  taskDefinitionId: string;
  scheduledFor: string;
  publishedAt: string | null;
  completedAt: string | null;
  completedBy: MemberRefDto | null;
  activeAssignment: AssignmentSummaryDto | null;
  activeAssignments: AssignmentSummaryDto[];
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
