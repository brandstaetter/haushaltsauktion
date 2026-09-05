/**
 * Fixture data for MSW handlers (`handlers.ts`). Shaped by hand against the
 * real DTOs (`@haushaltsauktion/shared`, `../api/types`) rather than
 * generated, so a story renders something a household would actually see —
 * consistent member names, task titles matching the seed data in
 * `apps/api/prisma/seed.ts`, plausible point values.
 */
import type { AvailableTaskDto, TaskInstanceDetailDto } from '@haushaltsauktion/shared';
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
  csrfToken: 'mock-operator-csrf-token',
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
