import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecurrenceType, WorkerCountMode } from '@haushaltsauktion/shared';
import { http, HttpResponse } from 'msw';
import type {
  AdminMemberDto,
  AdminTaskDefinitionDto,
  CategoryDto,
} from '../../api/types';
import { TaskDefinitionsSection } from './TaskDefinitionsSection';

const meta = {
  title: 'Pages/Admin/TaskDefinitionsSection',
  component: TaskDefinitionsSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TaskDefinitionsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Fixture factory for task definitions. Spreads partial overrides
 * to avoid repetition (matches the test file's `definitionFixture` pattern).
 */
function createDefinition(overrides: Partial<AdminTaskDefinitionDto> = {}): AdminTaskDefinitionDto {
  return {
    id: 'def-1',
    title: 'Bad putzen',
    description: null,
    categoryId: null,
    category: null,
    baseValue: 6,
    estimatedMinutes: null,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: null,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: null,
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: null,
    nextDueAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    eligibility: [],
    preferredAssignees: [],
    ...overrides,
  };
}

const kitchenCategory: CategoryDto = {
  id: 'cat-kitchen',
  name: 'Küche',
  colorHex: '#f59e0b',
  sortOrder: 0,
};

const bathroomCategory: CategoryDto = {
  id: 'cat-bathroom',
  name: 'Bad',
  colorHex: '#3b82f6',
  sortOrder: 1,
};

const mockMembers: AdminMemberDto[] = [
  {
    id: 'member-elke',
    displayName: 'Elke',
    avatarUrl: null,
    role: 'ADMIN',
    isActive: true,
    pointsCache: 42,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'elke@demo.local', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
  },
  {
    id: 'member-arthur',
    displayName: 'Arthur',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    pointsCache: 17,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'arthur@demo.local', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
  },
  {
    id: 'member-luise',
    displayName: 'Luise',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    pointsCache: 8,
    maxRandomAssignmentsPerWeek: 3,
    user: { email: 'luise@demo.local', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
  },
  {
    id: 'member-hannes',
    displayName: 'Hannes',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    pointsCache: 23,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'hannes@demo.local', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
  },
];

/**
 * Populated list showing a rich mix of task definition variants covering:
 * - Different recurrence types (DAILY, WEEKLY with specific weekdays, EVERY_N_DAYS, MONTHLY, MANUAL)
 * - Varied base values and estimated durations
 * - Tasks with and without categories
 * - Multi-worker tasks (workerCount > 1) with role requirements
 * - One archived definition (to show archivedAt field)
 * - Different buyout settings
 * - Eligibility restrictions on some definitions
 *
 * This single story demonstrates all major UI branches without requiring one story per variant.
 */
export const Populated: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({
            items: [
              createDefinition({
                id: 'def-geschirrspueler',
                title: 'Geschirrspüler ausräumen',
                description: 'Täglich nach dem Essen',
                category: kitchenCategory,
                categoryId: kitchenCategory.id,
                baseValue: 2,
                estimatedMinutes: 5,
                recurrenceType: RecurrenceType.DAILY,
                buyoutEnabled: true,
              }),
              createDefinition({
                id: 'def-bad',
                title: 'Bad putzen',
                description: 'Grundreinigung',
                category: bathroomCategory,
                categoryId: bathroomCategory.id,
                baseValue: 6,
                estimatedMinutes: 30,
                recurrenceType: RecurrenceType.WEEKLY,
                recurrenceWeekdays: [6], // Saturday
                recurrenceTimeOfDay: '14:00',
                dueOffsetMinutes: 120,
                buyoutEnabled: true,
              }),
              createDefinition({
                id: 'def-waesche',
                title: 'Wäsche aufhängen',
                category: null,
                categoryId: null,
                baseValue: 4,
                estimatedMinutes: 15,
                recurrenceType: RecurrenceType.EVERY_N_DAYS,
                recurrenceInterval: 3,
                recurrenceTimeOfDay: '10:00',
                buyoutEnabled: true,
              }),
              createDefinition({
                id: 'def-staubsaugen',
                title: 'Staubsaugen',
                category: null,
                categoryId: null,
                baseValue: 4,
                estimatedMinutes: 20,
                recurrenceType: RecurrenceType.WEEKDAYS,
                recurrenceWeekdays: [2, 4], // Tuesday, Thursday
                recurrenceTimeOfDay: '18:00',
                buyoutEnabled: false,
              }),
              createDefinition({
                id: 'def-küche',
                title: 'Küche gründlich reinigen',
                category: kitchenCategory,
                categoryId: kitchenCategory.id,
                baseValue: 7,
                estimatedMinutes: 45,
                recurrenceType: RecurrenceType.MONTHLY,
                recurrenceDayOfMonth: 15,
                recurrenceTimeOfDay: '09:00',
                dueOffsetMinutes: 180,
                buyoutEnabled: true,
              }),
              createDefinition({
                id: 'def-keller',
                title: 'Keller aufräumen',
                description: 'Ein-malige Aufräumaktion',
                category: null,
                categoryId: null,
                baseValue: 10,
                estimatedMinutes: 90,
                recurrenceType: RecurrenceType.MANUAL,
                buyoutEnabled: true,
              }),
              createDefinition({
                id: 'def-müll',
                title: 'Müll hinausbringen',
                category: null,
                categoryId: null,
                baseValue: 2,
                estimatedMinutes: 10,
                recurrenceType: RecurrenceType.WEEKLY,
                recurrenceWeekdays: [1, 4], // Monday, Thursday
                recurrenceTimeOfDay: '19:00',
                buyoutEnabled: true,
                workerCountMode: WorkerCountMode.AT_LEAST,
                workerCount: 2,
              }),
              createDefinition({
                id: 'def-garten',
                title: 'Garten pflegen',
                description: 'Arbeit im Freien',
                category: null,
                categoryId: null,
                baseValue: 8,
                estimatedMinutes: 60,
                recurrenceType: RecurrenceType.WEEKLY,
                recurrenceWeekdays: [6],
                recurrenceTimeOfDay: '10:00',
                buyoutEnabled: true,
                workerCountMode: WorkerCountMode.EXACTLY,
                workerCount: 2,
                minAdminSlots: 1,
              }),
              createDefinition({
                id: 'def-steuern',
                title: 'Steuererklärung vorbereiten',
                description: 'Nur für Admins',
                category: null,
                categoryId: null,
                baseValue: 5,
                estimatedMinutes: 120,
                recurrenceType: RecurrenceType.MONTHLY,
                recurrenceDayOfMonth: 1,
                recurrenceTimeOfDay: '09:00',
                buyoutEnabled: true,
                requiredRole: 'ADMIN',
                workerCountMode: WorkerCountMode.EXACTLY,
                workerCount: 1,
                eligibility: [
                  { memberId: 'member-elke', mode: 'INCLUDED' },
                ],
                preferredAssignees: [{ memberId: 'member-elke' }],
              }),
              createDefinition({
                id: 'def-archived',
                title: 'Fenster putzen (archiviert)',
                category: null,
                categoryId: null,
                baseValue: 5,
                estimatedMinutes: 40,
                recurrenceType: RecurrenceType.MONTHLY,
                recurrenceDayOfMonth: 20,
                isActive: false,
                archivedAt: '2025-12-01T00:00:00.000Z',
                buyoutEnabled: true,
              }),
            ],
          }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [kitchenCategory, bathroomCategory],
          }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Empty state: no task definitions have been created yet.
 * Shows the empty-state hint to prompt the user to create the first definition.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: [kitchenCategory, bathroomCategory] }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Loading state: the task definitions list is being fetched from the server.
 * Shows the indefinite loading spinner.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          // Never resolves — demonstrates the loading spinner
          new Promise(() => {}),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [kitchenCategory, bathroomCategory],
          }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Error state: the task definitions fetch failed (HTTP 500).
 * Shows the error message and retry affordance.
 */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json(
            {
              error: {
                message:
                  'Fehler beim Laden der Aufgabendefinitionen. Bitte versuchen Sie es später erneut.',
              },
            },
            { status: 500 },
          ),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [kitchenCategory, bathroomCategory],
          }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Populated list where categories are not available (categories API returns empty).
 * Demonstrates how task definition cards render when no category system is configured,
 * or when a category has been deleted and the definition still references it.
 */
export const NoCategories: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({
            items: [
              createDefinition({
                id: 'def-geschirrspueler',
                title: 'Geschirrspüler ausräumen',
                baseValue: 2,
                estimatedMinutes: 5,
                recurrenceType: RecurrenceType.DAILY,
                categoryId: 'cat-kitchen', // Referenced but not returned by categories API
                category: null,
              }),
              createDefinition({
                id: 'def-bad',
                title: 'Bad putzen',
                baseValue: 6,
                estimatedMinutes: 30,
                recurrenceType: RecurrenceType.WEEKLY,
                recurrenceWeekdays: [6],
                categoryId: 'cat-bathroom',
                category: null,
              }),
              createDefinition({
                id: 'def-waesche',
                title: 'Wäsche aufhängen',
                baseValue: 4,
                estimatedMinutes: 15,
                recurrenceType: RecurrenceType.EVERY_N_DAYS,
                recurrenceInterval: 3,
              }),
            ],
          }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Populated list with members unavailable or inactive.
 * Tests the eligibility picker state when the member list is empty,
 * or when critical members are inactive and should be filtered out.
 */
export const NoActiveMembers: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({
            items: [
              createDefinition({
                id: 'def-1',
                title: 'Aufgabe 1',
                baseValue: 5,
              }),
              createDefinition({
                id: 'def-2',
                title: 'Aufgabe 2',
                baseValue: 3,
              }),
            ],
          }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: [kitchenCategory, bathroomCategory] }),
        ),
        http.get('/api/admin/members', () =>
          // All members are inactive, so the eligibility picker has no options
          HttpResponse.json({
            items: mockMembers.map((m) => ({ ...m, isActive: false })),
          }),
        ),
      ],
    },
  },
};

/**
 * Large list of task definitions to verify rendering performance and scrolling UX.
 * Demonstrates the section's ability to handle a realistic household with many recurring tasks.
 */
export const ManyDefinitions: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () => {
          const items = Array.from({ length: 20 }, (_, i) => {
            const recurrenceTypes = Object.values(RecurrenceType);
            const recType = recurrenceTypes[i % recurrenceTypes.length];
            const baseValues = [2, 3, 4, 5, 6, 7, 8, 10];
            const baseValue = baseValues[i % baseValues.length];

            return createDefinition({
              id: `def-${i + 1}`,
              title: `Aufgabe ${i + 1}`,
              baseValue,
              estimatedMinutes: 10 + i * 5,
              recurrenceType: recType,
              recurrenceWeekdays:
                recType === RecurrenceType.WEEKLY || recType === RecurrenceType.WEEKDAYS
                  ? [1, 3, 5]
                  : [],
              recurrenceInterval: recType === RecurrenceType.EVERY_N_DAYS ? (i % 7) + 1 : null,
              recurrenceDayOfMonth: recType === RecurrenceType.MONTHLY ? (i % 28) + 1 : null,
            });
          });
          return HttpResponse.json({ items });
        }),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [kitchenCategory, bathroomCategory],
          }),
        ),
        http.get('/api/admin/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};
