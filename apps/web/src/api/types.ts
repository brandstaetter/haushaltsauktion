import type {
  AssignmentKind,
  AvailableTaskDto,
  EligibilityMode,
  HouseholdConfig,
  MemberDto,
  MemberEffectDto,
  MemberRole,
  PublicHouseholdConfig,
  RecurrenceType,
  TaskInstanceDetailDto,
  TaskStatus,
  WorkerCountMode,
} from '@haushaltsauktion/shared';

export interface SessionDto {
  user: { id: string; email: string; displayName: string } | null;
  member: MemberDto | null;
  household: { id: string; name: string; timezone: string } | null;
  role: 'MEMBER' | 'ADMIN' | null;
  csrfToken: string | null;
}

export interface DashboardDto {
  me: {
    memberId: string;
    displayName: string;
    balance: number;
    assigned: TaskInstanceDetailDto[];
    available: AvailableTaskDto[];
    activeEffects: MemberEffectDto[];
  };
  family: {
    members: MemberDto[];
    openTasks: AvailableTaskDto[];
    recentlyCompleted: {
      id: string;
      title: string;
      completedAt: string;
      completedBy: string | null;
      completedByMemberId: string | null;
      value: number;
      pointsAwarded: number;
      rejected: boolean;
      /** Every currently-COMPLETED slot on this instance — see reads.ts. */
      completions: { assignmentId: string; memberId: string; memberName: string }[];
    }[];
  };
}

export type RejectCompletionOutcome = 'REASSIGN_TO_MEMBER' | 'REOFFER_MARKET';

/** Result of `POST /admin/instances/:id/reject-completion`. */
export interface RejectCompletionResultDto {
  instanceId: string;
  assignmentId: string;
  memberId: string;
  clawedBack: number;
  outcome: RejectCompletionOutcome;
  status: string;
  newAssignmentId: string | null;
}

/** Result of `POST /admin/instances/:id/revoke-assignment`. */
export interface RevokeAssignmentResultDto {
  instanceId: string;
  status: string;
  currentValue: number;
  clawedBack: number;
}

export interface HistoryEventRow {
  id: string;
  seq: string;
  createdAt: string;
  taskInstanceId: string;
  taskTitle: string;
  member: { id: string; displayName: string } | null;
  type: string;
  payload: Record<string, unknown>;
}

export interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  taskInstanceId: string | null;
  taskTitle: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * `GET /config/public` (`loadPublicConfig`, `apps/api/src/app/config/
 * updateConfig.ts:171-177`) returns the same versioned envelope as
 * `AdminConfigDto` — `{ version, values }`, not the config fields
 * themselves at the top level. Consumers must read `data.values.*`.
 */
export interface PublicConfigDto {
  version: number;
  values: PublicHouseholdConfig;
}

export interface AdminConfigDto {
  version: number;
  values: HouseholdConfig;
  defaults: HouseholdConfig;
  updatedAt: string | null;
  updatedBy: { id: string; displayName: string } | null;
  /** Whether the server process itself supports each integration, independent of the household switch. */
  integrationsAvailable: { todoist: boolean };
}

/**
 * Admin-facing member shape from `GET /admin/members` — richer than the
 * self-facing `MemberDto` from `/members` (which has no `user.email` and no
 * restriction sub-lists). Kept separate rather than widening `MemberDto`,
 * which other, non-admin views rely on staying minimal.
 */
export interface AdminMemberDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
  isActive: boolean;
  /** Raw Prisma field name — this route returns the row as-is, no DTO mapping. */
  pointsCache: number;
  maxRandomAssignmentsPerWeek: number | null;
  user: { email: string; isActive: boolean };
  categoryExclusions: { categoryId: string }[];
  absences: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  taskEligibility: { taskDefinitionId: string; mode: string }[];
}

export interface CategoryDto {
  id: string;
  name: string;
  colorHex: string | null;
  sortOrder: number;
}

/** Minimal label shape for the members panel's restriction pickers — full
 * task-definition CRUD (Phase 4) can widen this or add its own DTO. */
export interface TaskDefinitionSummaryDto {
  id: string;
  title: string;
}

/** Recurrence rule as it round-trips through the admin task-definition API
 * (`RecurrenceBody` in `apps/api/src/infra/http/routes/admin.ts`). */
export interface RecurrenceDto {
  type: RecurrenceType;
  interval: number | null;
  weekdays: number[];
  dayOfMonth: number | null;
  timeOfDay: string | null;
  dueOffsetMinutes: number | null;
}

/**
 * Full task-definition row from `GET /admin/task-definitions[/:id]` — a
 * superset of `TaskDefinitionSummaryDto` (structurally assignable to it),
 * used by the admin panel's list/create/edit/eligibility UI.
 */
export interface AdminTaskDefinitionDto {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string; colorHex: string | null } | null;
  baseValue: number;
  estimatedMinutes: number | null;
  isActive: boolean;
  buyoutEnabled: boolean;
  /** Multi-worker-tasks (Phase 4). Default `EXACTLY`/`1` reproduces today's single-worker shape. */
  workerCountMode: WorkerCountMode;
  workerCount: number;
  recurrenceType: RecurrenceType;
  recurrenceInterval: number | null;
  recurrenceWeekdays: number[];
  recurrenceDayOfMonth: number | null;
  recurrenceTimeOfDay: string | null;
  dueOffsetMinutes: number | null;
  carriedValue: number | null;
  lastCompletedAt: string | null;
  nextDueAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  eligibility: { memberId: string; mode: EligibilityMode }[];
}

/**
 * One open instance of a definition, as `GET /admin/task-definitions/:id`
 * embeds it. `assignments` holds every currently-`ACTIVE` assignment on the
 * instance, ordered by `slotIndex` (Multi-worker-tasks Phase 3) — for an
 * `EXACTLY(1)` task this is 0 or 1 rows, same as before this feature.
 */
export interface AdminTaskInstanceRowDto {
  id: string;
  status: TaskStatus;
  currentValue: number;
  dueAt: string | null;
  /** Multi-worker-tasks (Phase 3). See `AvailableTaskDto` for the same triple. */
  workerCountMode: WorkerCountMode;
  workerCount: number;
  activeSlotCount: number;
  assignments: {
    id: string;
    kind: AssignmentKind;
    slotIndex: number;
    member: { id: string; displayName: string };
  }[];
}

/** Full response of `GET /admin/task-definitions/:id` — the list row plus
 * its currently open instances and §33's market-value figure. */
export interface AdminTaskDefinitionDetailDto extends AdminTaskDefinitionDto {
  instances: AdminTaskInstanceRowDto[];
  marketValue: {
    averageVoluntaryTakeoverValue: number | null;
    sampleSize: number;
  };
}

/** Body shape for `POST`/`PUT /admin/task-definitions[/:id]` — mirrors
 * `DefinitionBody` server-side exactly. */
export interface TaskDefinitionWriteBody {
  title: string;
  description: string | null;
  categoryId: string | null;
  baseValue: number;
  estimatedMinutes: number | null;
  buyoutEnabled: boolean;
  isActive: boolean;
  workerCountMode: WorkerCountMode;
  workerCount: number;
  recurrence: RecurrenceDto;
}

/** Body shape for `POST`/`PUT /admin/categories[/:id]` — mirrors
 * `CategoryBody` server-side exactly. */
export interface CategoryWriteBody {
  name: string;
  colorHex: string | null;
  sortOrder: number;
}

/** Full reward-catalog row from `GET /admin/rewards[/:id]` (Punkte-Shop,
 * intake "points-shop-real-life-rewards", erweitert um virtuelle Effekte
 * durch "points-shop-virtual-gamification-items"). */
export interface AdminRewardDto {
  id: string;
  title: string;
  description: string | null;
  cost: number;
  kind: 'MANUAL_FULFILLMENT' | 'VIRTUAL_EFFECT';
  effectType: 'IMMUNITY' | 'MULTIPLIER' | null;
  effectDurationMinutes: number | null;
  effectCharges: number | null;
  effectMultiplier: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body shape for `POST`/`PUT /admin/rewards[/:id]` — mirrors `RewardBody`
 * server-side exactly. */
export interface RewardWriteBody {
  title: string;
  description: string | null;
  cost: number;
  isActive: boolean;
  kind: 'MANUAL_FULFILLMENT' | 'VIRTUAL_EFFECT';
  effectType: 'IMMUNITY' | 'MULTIPLIER' | null;
  effectDurationMinutes: number | null;
  effectCharges: number | null;
  effectMultiplier: number | null;
}

/** One row of `GET /admin/rewards/redemptions` — the fulfillment queue. */
export interface AdminRedemptionDto {
  id: string;
  status: 'PENDING' | 'FULFILLED';
  costAtPurchase: number;
  purchasedAt: string;
  fulfilledAt: string | null;
  reward: { id: string; title: string };
  member: { id: string; displayName: string };
}
