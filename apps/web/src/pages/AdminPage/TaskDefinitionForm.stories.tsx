import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecurrenceType, WorkerCountMode } from '@haushaltsauktion/shared';
import { http, HttpResponse } from 'msw';
import type {
  AdminTaskDefinitionDetailDto,
  AdminTaskDefinitionDto,
  CategoryDto,
} from '../../api/types';
import { TaskDefinitionForm } from './TaskDefinitionForm';

const meta = {
  title: 'Pages/Admin/TaskDefinitionForm',
  component: TaskDefinitionForm,
  parameters: { layout: 'padded' },
  args: {
    onClose: () => {},
    onSaved: () => {},
  },
} satisfies Meta<typeof TaskDefinitionForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const bathroomCategory: CategoryDto = {
  id: 'cat-bathroom',
  name: 'Bad',
  colorHex: '#3b82f6',
  sortOrder: 1,
};

const kitchenCategory: CategoryDto = {
  id: 'cat-kitchen',
  name: 'Küche',
  colorHex: '#f59e0b',
  sortOrder: 0,
};

const categories = [kitchenCategory, bathroomCategory];

function createDefinition(overrides: Partial<AdminTaskDefinitionDto> = {}): AdminTaskDefinitionDto {
  return {
    id: 'def-bad',
    title: 'Bad putzen',
    description: 'Grundreinigung',
    categoryId: bathroomCategory.id,
    category: bathroomCategory,
    baseValue: 6,
    estimatedMinutes: 30,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: null,
    recurrenceWeekdays: [6],
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: '14:00',
    dueOffsetMinutes: 120,
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

/** The blank form for creating a brand-new task definition — no live-instances list, since none exist yet. */
export const Create: Story = {
  args: {
    initial: null,
    categories,
  },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/admin/task-definitions', () =>
          HttpResponse.json(createDefinition({ id: 'def-new' })),
        ),
      ],
    },
  },
};

/** Editing an existing definition — every field pre-filled, plus the live-instances list underneath. */
export const Edit: Story = {
  args: {
    initial: createDefinition(),
    categories,
  },
  parameters: {
    msw: {
      handlers: [
        http.put('/api/admin/task-definitions/:id', () => HttpResponse.json({ id: 'def-bad' })),
        http.get('/api/admin/task-definitions/:id', () =>
          HttpResponse.json<AdminTaskDefinitionDetailDto>({
            ...createDefinition(),
            instances: [
              {
                id: 'inst-available',
                status: 'AVAILABLE',
                currentValue: 6,
                dueAt: null,
                workerCountMode: WorkerCountMode.EXACTLY,
                workerCount: 1,
                activeSlotCount: 0,
                assignments: [],
              },
              {
                id: 'inst-assigned',
                status: 'ASSIGNED',
                currentValue: 9,
                dueAt: '2026-01-05T14:00:00.000Z',
                workerCountMode: WorkerCountMode.EXACTLY,
                workerCount: 1,
                activeSlotCount: 1,
                assignments: [
                  {
                    id: 'asg-1',
                    kind: 'RANDOM',
                    slotIndex: 0,
                    member: { id: 'member-anna', displayName: 'Anna' },
                  },
                ],
              },
            ],
            marketValue: { averageVoluntaryTakeoverValue: 7.3, sampleSize: 12 },
          }),
        ),
      ],
    },
  },
};

/** Editing a definition with no open instances — the live-instances section shows its empty hint instead of a list. */
export const EditNoInstances: Story = {
  args: {
    initial: createDefinition({ id: 'def-empty', title: 'Müll hinausbringen' }),
    categories,
  },
  parameters: {
    msw: {
      handlers: [
        http.put('/api/admin/task-definitions/:id', () => HttpResponse.json({ id: 'def-empty' })),
        http.get('/api/admin/task-definitions/:id', () =>
          HttpResponse.json<AdminTaskDefinitionDetailDto>({
            ...createDefinition({ id: 'def-empty', title: 'Müll hinausbringen' }),
            instances: [],
            marketValue: { averageVoluntaryTakeoverValue: null, sampleSize: 0 },
          }),
        ),
      ],
    },
  },
};
