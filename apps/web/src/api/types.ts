import type {
  AssignmentKind,
  AvailableTaskDto,
  EligibilityMode,
  HouseholdConfig,
  MemberDto,
  MemberRole,
  RecurrenceType,
  TaskInstanceDetailDto,
  TaskStatus,
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

export interface PublicConfigDto {
  voluntary: {
    rewardTiming: 'ON_ACCEPT' | 'ON_COMPLETE';
    rewardEnabled: boolean;
    rewardMultiplier: number;
  };
  buyout: {
    enabled: boolean;
    allowNegativeBalance: boolean;
  };
  assignment: {
    strategy: string;
  };
  valueIncrease: {
    strategy: string;
    multiplier: number;
    minimumIncrease: number;
    maximumValue: number | null;
  };
  points: {
    decay: {
      enabled: boolean;
    };
  };
  integrations: {
    todoist: {
      enabled: boolean;
    };
  };
}

export interface AdminConfigDto {
  version: number;
  values: HouseholdConfig;
  defaults: HouseholdConfig;
  updatedAt: string | null;
  updatedBy: { id: string; displayName: string } | null;
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

/** One open instance of a definition, as `GET /admin/task-definitions/:id`
 * embeds it — `assignments` holds at most one row (the active assignment). */
export interface AdminTaskInstanceRowDto {
  id: string;
  status: TaskStatus;
  currentValue: number;
  dueAt: string | null;
  assignments: {
    id: string;
    kind: AssignmentKind;
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
  recurrence: RecurrenceDto;
}

/** Body shape for `POST`/`PUT /admin/categories[/:id]` — mirrors
 * `CategoryBody` server-side exactly. */
export interface CategoryWriteBody {
  name: string;
  colorHex: string | null;
  sortOrder: number;
}
