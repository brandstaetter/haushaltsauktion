/**
 * Fixture data for MSW handlers (`handlers.ts`). Shaped by hand against the
 * real DTOs (`@haushaltsauktion/shared`, `../api/types`) rather than
 * generated, so a story renders something a household would actually see —
 * consistent member names, task titles matching the seed data in
 * `apps/api/prisma/seed.ts`, plausible point values.
 */
import type {
  AssignmentSummaryDto,
  AvailableTaskDto,
  SelectionExplanationDto,
  TaskInstanceDetailDto,
} from '@haushaltsauktion/shared';
import type { DashboardDto, NotificationRow, SessionDto } from '../api/types';
import type { OperatorMetricsDto, OperatorSessionDto } from '../api/operatorTypes';

export const mockMembers = [
  { id: 'member-elke', displayName: 'Elke', avatarUrl: null, role: 'ADMIN' as const, isActive: true, balance: 42, maxRandomAssignmentsPerWeek: null },
  { id: 'member-arthur', displayName: 'Arthur', avatarUrl: null, role: 'MEMBER' as const, isActive: true, balance: 17, maxRandomAssignmentsPerWeek: null },
  { id: 'member-luise', displayName: 'Luise', avatarUrl: null, role: 'MEMBER' as const, isActive: true, balance: 8, maxRandomAssignmentsPerWeek: 3 },
  { id: 'member-hannes', displayName: 'Hannes', avatarUrl: null, role: 'MEMBER' as const, isActive: true, balance: 23, maxRandomAssignmentsPerWeek: null },
];

export const mockSession: SessionDto = {
  user: { id: 'user-elke', email: 'elke@example.com', displayName: 'Elke' },
  member: mockMembers[0],
  household: { id: 'household-demo', name: 'Demo Family', timezone: 'Europe/Vienna' },
  role: 'ADMIN',
  csrfToken: 'mock-csrf-token',
};

const kitchenCategory = { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b' };
const bathroomCategory = { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6' };

export const mockAvailableTasks: AvailableTaskDto[] = [
  {
    id: 'instance-dishwasher',
    version: 1,
    title: 'Geschirrspüler ausräumen',
    description: null,
    category: kitchenCategory,
    currentValue: 2,
    baseValue: 2,
    buyoutCount: 0,
    estimatedMinutes: 5,
    dueAt: null,
    isOverdue: false,
    offerExpiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    status: 'AVAILABLE',
    canVolunteer: true,
    ineligibleReason: null,
    potentialReward: 2,
    workerCountMode: 'EXACTLY',
    workerCount: 1,
    activeSlotCount: 0,
    viewerHasActiveSlot: false,
  },
  {
    id: 'instance-bathroom',
    version: 1,
    title: 'Bad putzen',
    description: null,
    category: bathroomCategory,
    currentValue: 6,
    baseValue: 6,
    buyoutCount: 0,
    estimatedMinutes: 30,
    dueAt: null,
    isOverdue: false,
    offerExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    status: 'AVAILABLE',
    canVolunteer: true,
    ineligibleReason: null,
    potentialReward: 6,
    workerCountMode: 'EXACTLY',
    workerCount: 1,
    activeSlotCount: 0,
    viewerHasActiveSlot: false,
  },
];

export const mockAssignedTask: TaskInstanceDetailDto = {
  ...mockAvailableTasks[0],
  id: 'instance-trash',
  title: 'Müll hinausbringen',
  currentValue: 2,
  baseValue: 2,
  status: 'ASSIGNED',
  category: null,
  viewerHasActiveSlot: true,
  taskDefinitionId: 'def-trash',
  scheduledFor: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  completedAt: null,
  completedBy: null,
  activeAssignment: {
    id: 'assignment-1',
    memberId: mockSession.member!.id,
    kind: 'RANDOM',
    response: 'PENDING',
    assignedAt: new Date().toISOString(),
    valueAtAssignment: 2,
    rewardOnCompletion: 0,
    buyoutQuote: {
      assignmentId: 'assignment-1',
      allowed: true,
      disallowedReason: null,
      cost: 2,
      balanceBefore: mockSession.member!.balance,
      balanceAfter: mockSession.member!.balance - 2,
      taskValueBefore: 2,
      taskValueAfter: 3,
      costStrategy: 'CURRENT_TASK_VALUE',
      valueIncreaseStrategy: 'MULTIPLIER',
      buyoutsUsedThisWeek: 0,
      buyoutsAllowedThisWeek: null,
      configVersion: 1,
    },
  },
  activeAssignments: [],
};

/**
 * `TaskDetailPage` fixtures (`TaskDetailPage.stories.tsx`). Distinct from
 * `mockAssignedTask` above (which only needs to look right as a `TaskCard`
 * row on the dashboard, so its `activeAssignments` is left empty) — the
 * detail page resolves "is this mine" from `activeAssignments`, so these
 * populate it for real.
 */
const mockBuyoutQuote = {
  assignmentId: 'assignment-detail-1',
  allowed: true,
  disallowedReason: null,
  cost: 6,
  balanceBefore: mockSession.member!.balance,
  balanceAfter: mockSession.member!.balance - 6,
  taskValueBefore: 6,
  taskValueAfter: 9,
  costStrategy: 'CURRENT_TASK_VALUE' as const,
  valueIncreaseStrategy: 'MULTIPLIER' as const,
  buyoutsUsedThisWeek: 0,
  buyoutsAllowedThisWeek: null,
  configVersion: 1,
};

/** RANDOM assignment, still awaiting the viewer's decision — §21's "Du wurdest ausgewählt". */
export const mockAssignmentPending: AssignmentSummaryDto = {
  id: 'assignment-detail-1',
  memberId: mockSession.member!.id,
  kind: 'RANDOM',
  response: 'PENDING',
  assignedAt: new Date().toISOString(),
  valueAtAssignment: 6,
  rewardOnCompletion: 0,
  buyoutQuote: mockBuyoutQuote,
};

/** Same assignment, already accepted — the "erledigen / freikaufen / zurückgeben" screen. */
export const mockAssignmentAccepted: AssignmentSummaryDto = {
  ...mockAssignmentPending,
  id: 'assignment-detail-2',
  response: 'ACCEPTED',
};

/**
 * PRD §3B — a voluntary takeover is released, never bought out: no fairness
 * trace either (only a `RANDOM` assignment has a `selectionTrace`), so the
 * screen is just "erledigen / zurückgeben". `buyoutQuote` mirrors what
 * `evaluateBuyoutRules` (`apps/api/src/domain/buyout/rules.ts`) actually
 * returns for a `VOLUNTARY` kind — `allowed: false` with
 * `NOT_RANDOM_ASSIGNMENT`, not `null` — so the mocked `/buyout-quote`
 * response stays true to the real API.
 */
export const mockAssignmentVoluntary: AssignmentSummaryDto = {
  id: 'assignment-detail-3',
  memberId: mockSession.member!.id,
  kind: 'VOLUNTARY',
  response: 'ACCEPTED',
  assignedAt: new Date().toISOString(),
  valueAtAssignment: 6,
  rewardOnCompletion: 6,
  buyoutQuote: {
    ...mockBuyoutQuote,
    assignmentId: 'assignment-detail-3',
    allowed: false,
    disallowedReason: 'NOT_RANDOM_ASSIGNMENT',
  },
};

export const mockTaskDetailAvailable: TaskInstanceDetailDto = {
  ...mockAvailableTasks[1],
  id: 'instance-bathroom',
  taskDefinitionId: 'def-bathroom',
  scheduledFor: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  completedAt: null,
  completedBy: null,
  activeAssignment: null,
  activeAssignments: [],
};

export const mockTaskDetailPending: TaskInstanceDetailDto = {
  ...mockTaskDetailAvailable,
  status: 'ASSIGNED',
  canVolunteer: false,
  viewerHasActiveSlot: true,
  potentialReward: 0,
  activeAssignment: mockAssignmentPending,
  activeAssignments: [mockAssignmentPending],
};

export const mockTaskDetailAssigned: TaskInstanceDetailDto = {
  ...mockTaskDetailPending,
  activeAssignment: mockAssignmentAccepted,
  activeAssignments: [mockAssignmentAccepted],
};

/** Voluntarily taken (not randomly assigned) — "erledigen / zurückgeben", no buyout, no fairness sheet. */
export const mockTaskDetailVoluntaryAssigned: TaskInstanceDetailDto = {
  ...mockTaskDetailPending,
  potentialReward: 6,
  activeAssignment: mockAssignmentVoluntary,
  activeAssignments: [mockAssignmentVoluntary],
};

/** §32 "Warum wurde mir diese Aufgabe zugewiesen?" — behind the pending story's fairness sheet. */
export const mockSelectionExplanation: SelectionExplanationDto = {
  assignmentId: mockAssignmentPending.id,
  strategy: 'WEIGHTED_FAIRNESS',
  decidedAt: new Date().toISOString(),
  configVersion: 1,
  eligibleCount: 3,
  constraintsRelaxed: [],
  candidates: [
    {
      memberId: mockMembers[1].id,
      displayName: mockMembers[1].displayName,
      included: true,
      exclusionReason: null,
      weightTerms: null,
      weight: 0.8,
      probability: 0.27,
      selected: false,
    },
    {
      memberId: mockMembers[2].id,
      displayName: mockMembers[2].displayName,
      included: false,
      exclusionReason: 'CATEGORY_EXCLUDED',
      weightTerms: null,
      weight: null,
      probability: null,
      selected: false,
    },
    {
      memberId: mockSession.member!.id,
      displayName: mockSession.member!.displayName,
      included: true,
      exclusionReason: null,
      weightTerms: null,
      weight: 1.2,
      probability: 0.4,
      selected: true,
    },
  ],
};

export const mockDashboard: DashboardDto = {
  me: {
    memberId: mockSession.member!.id,
    displayName: mockSession.member!.displayName,
    balance: mockSession.member!.balance,
    assigned: [mockAssignedTask],
    available: mockAvailableTasks,
    activeEffects: [],
  },
  family: {
    members: mockMembers,
    openTasks: mockAvailableTasks,
    recentlyCompleted: [
      {
        id: 'instance-vacuum',
        title: 'Staubsaugen',
        completedAt: new Date(Date.now() - 3600_000).toISOString(),
        completedBy: 'Paul',
        completedByMemberId: 'member-paul',
        value: 4,
        pointsAwarded: 4,
        rejected: false,
        completions: [{ assignmentId: 'assignment-2', memberId: 'member-paul', memberName: 'Paul' }],
      },
    ],
  },
};

export const mockOperatorSession: OperatorSessionDto = {
  operator: { id: 'operator-1', email: 'ops@example.com' },
  csrfToken: 'dummy-operator-csrf-token',
};

export const mockOperatorMetrics: OperatorMetricsDto = {
  households: { total: 34, active: 21 },
  users: { total: 118, active: 96, activeLast24h: 22, activeLast7d: 61 },
  taskThroughput: { completedLast24h: 47, completedLast7d: 312 },
  ledgerVolume: {
    transactionsLast7d: 289,
    byType: {
      VOLUNTARY_TASK_REWARD: { count: 210, sum: 940 },
      BUYOUT: { count: 34, sum: -186 },
      MANUAL_ADJUSTMENT: { count: 5, sum: 20 },
    },
  },
  buyouts: { last7d: 34 },
  todoistAdoption: { activeIntegrations: 12 },
  auditVolume: { last7d: 143 },
};

export const mockNotifications: { items: NotificationRow[]; unreadCount: number; nextCursor: string | null } = {
  items: [
    {
      id: 'notif-1',
      type: 'TASK_ASSIGNED',
      payload: {},
      taskInstanceId: 'instance-trash',
      taskTitle: 'Müll hinausbringen',
      readAt: null,
      createdAt: new Date(Date.now() - 600_000).toISOString(),
    },
  ],
  unreadCount: 1,
  nextCursor: null,
};
