import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { RecurrenceType, WorkerCountMode } from '@haushaltsauktion/shared';
import { AdminTasksPage } from './AdminTasksPage';
import { Layout } from '../../components/Layout/Layout';
import { mockMembers, mockSession } from '../../mocks/data';
import type {
  AdminTaskDefinitionDetailDto,
  AdminTaskDefinitionDto,
  AdminTaskInstanceRowDto,
} from '../../api/types';

/** Shared with `AsMember` — a plain MEMBER instead of the default fixture's ADMIN. */
const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Clicks the sweep button ("Zufallszuweisung jetzt ausführen") to trigger the assignment sweep.
 * This allows stories that mock the sweep mutation to actually reach their claimed state.
 */
async function clickSweep(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  // Find the first sweep button (not the dry-run one) by searching for "Zufallszuweisung jetzt ausführen"
  const buttons = await canvas.findAllByRole('button', { name: 'Zufallszuweisung jetzt ausführen' });
  if (buttons.length === 0) throw new Error('Sweep button not found');
  await userEvent.click(buttons[0]);
}

/**
 * Realistic task-definition fixtures matching the seed data from `apps/api/prisma/seed.ts`.
 * Each definition includes open instances and market-value data.
 */
const mockTaskDefinitions: AdminTaskDefinitionDto[] = [
  {
    id: 'def-dishwasher',
    title: 'Geschirrspüler ausräumen',
    description: null,
    categoryId: 'cat-kitchen',
    category: { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b' },
    baseValue: 2,
    estimatedMinutes: 5,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.DAILY,
    recurrenceInterval: 1,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: '19:00',
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: new Date(Date.now() - 3600000).toISOString(),
    nextDueAt: new Date(Date.now() + 3600000).toISOString(),
    archivedAt: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    eligibility: [],
    preferredAssignees: [],
  },
  {
    id: 'def-trash',
    title: 'Müll hinausbringen',
    description: null,
    categoryId: null,
    category: null,
    baseValue: 2,
    estimatedMinutes: 3,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: 1,
    recurrenceWeekdays: [1, 4], // Monday, Thursday
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: '18:30',
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: new Date(Date.now() - 86400000).toISOString(),
    nextDueAt: new Date(Date.now() + 172800000).toISOString(),
    archivedAt: null,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    eligibility: [],
    preferredAssignees: [],
  },
  {
    id: 'def-bathroom',
    title: 'Bad putzen',
    description: null,
    categoryId: 'cat-bathroom',
    category: { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6' },
    baseValue: 6,
    estimatedMinutes: 30,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: 1,
    recurrenceWeekdays: [5], // Saturday
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: '10:00',
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: new Date(Date.now() - 432000000).toISOString(),
    nextDueAt: new Date(Date.now() + 259200000).toISOString(),
    archivedAt: null,
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date(Date.now() - 432000000).toISOString(),
    eligibility: [],
    preferredAssignees: [],
  },
  {
    id: 'def-laundry',
    title: 'Wäsche aufhängen',
    description: null,
    categoryId: null,
    category: null,
    baseValue: 4,
    estimatedMinutes: 20,
    isActive: true,
    buyoutEnabled: true,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: 1,
    recurrenceWeekdays: [2, 5], // Wednesday, Saturday
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: null,
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: new Date(Date.now() - 172800000).toISOString(),
    nextDueAt: new Date(Date.now() + 86400000).toISOString(),
    archivedAt: null,
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    eligibility: [],
    preferredAssignees: [],
  },
];

/**
 * Per-definition open-instance counts for `GET /admin/task-definitions/:id`
 * (`LiveInstancesList`, inside the edit sheet's "Laufende Instanzen"
 * section) — keyed by id so a story can claim a specific count for one task
 * without every other definition needing an instance too.
 */
const instanceCountByDefinitionId: Record<string, number> = {
  'def-dishwasher': 1,
  'def-trash': 2,
};

/** `GET /admin/task-definitions/:id` — resolves against `mockTaskDefinitions`,
 * attaching `instanceCountByDefinitionId`'s count of plausible open instances. */
function taskDefinitionDetailHandler() {
  return http.get('/api/admin/task-definitions/:id', ({ params }) => {
    const definition = mockTaskDefinitions.find((d) => d.id === params.id);
    if (!definition) {
      return HttpResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }
    const count = instanceCountByDefinitionId[definition.id] ?? 0;
    const instances: AdminTaskInstanceRowDto[] = Array.from({ length: count }, (_, i) => ({
      id: `${definition.id}-inst-${i + 1}`,
      status: 'AVAILABLE',
      currentValue: definition.baseValue,
      dueAt: null,
      workerCountMode: definition.workerCountMode,
      workerCount: definition.workerCount,
      activeSlotCount: 0,
      assignments: [],
    }));
    return HttpResponse.json<AdminTaskDefinitionDetailDto>({
      ...definition,
      instances,
      marketValue: { averageVoluntaryTakeoverValue: null, sampleSize: 0 },
    });
  });
}

/**
 * Proof-of-concept for full-page stories: renders the real page against MSW
 * instead of props, wrapped in the real `Layout` so header/nav/notification
 * chrome show up exactly as the app renders it — matching `/verwaltung/aufgaben`
 * route where the page lives.
 */
const meta = {
  title: 'Pages/Admin/AdminTasksPage',
  component: AdminTasksPage,
  parameters: { layout: 'fullscreen', reactRouter: { initialEntries: ['/verwaltung/aufgaben'] } },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/aufgaben" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminTasksPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default task list — page loads successfully with all task definitions and their current instances. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: mockTaskDefinitions }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
              { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
            ],
          }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/** Task definitions fetch is indefinitely delayed — shows spinner aria-label="Wird geladen". */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () => new Promise(() => {})),
      ],
    },
  },
};

/** Task definitions fetch fails with 500 — page displays error state for TaskDefinitionsSection. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ error: { message: 'Aufgabendefinitionen konnten nicht geladen werden' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** No task definitions exist yet — empty state with "Neue Aufgabe hinzufügen" button. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
      ],
    },
  },
};

/**
 * Sweep in-flight state — user clicked "Sweep ausführen" and the request is pending.
 * Button shows loading spinner, TaskDefinitionsSection is still visible and interactive.
 */
export const SweepInFlight: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: mockTaskDefinitions }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
              { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
            ],
          }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
        http.post('/api/admin/assignments/run', () => new Promise(() => {})),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSweep(canvasElement);
  },
};

/**
 * Sweep success — user clicked "Sweep ausführen" and got 200. Toast message displays
 * with result counts: materialized, published, assigned, expired, skipped.
 */
export const SweepSuccess: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: mockTaskDefinitions }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
              { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
            ],
          }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
        http.post('/api/admin/assignments/run', () =>
          HttpResponse.json({
            materialized: 3,
            published: 2,
            assigned: 1,
            expired: 0,
            skipped: 0,
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSweep(canvasElement);
  },
};

/**
 * Sweep error — user clicked "Sweep ausführen", request failed with 500.
 * Error message displayed in Toast, TaskDefinitionsSection remains visible.
 */
export const SweepFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: mockTaskDefinitions }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
              { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
            ],
          }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
        http.post('/api/admin/assignments/run', () =>
          HttpResponse.json(
            { error: { message: 'Sweep-Ausführung fehlgeschlagen' } },
            { status: 500 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSweep(canvasElement);
  },
};

/** Logged in as a plain member (no ADMIN role) — page redirects to home or shows permission denied. */
export const AsMember: Story = {
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};

/**
 * iPhone 13 viewport, logged in as ADMIN — primary mobile-first layout
 * target (§19). Also mocks the per-definition detail endpoint so opening the
 * edit sheet's "Laufende Instanzen" section shows a plausible instance count
 * for "Geschirrspüler ausräumen" (1) and "Müll hinausbringen" (2).
 */
export const MobileAdmin: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/task-definitions', () =>
          HttpResponse.json({ items: mockTaskDefinitions }),
        ),
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
              { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
            ],
          }),
        ),
        http.get('/api/members', () =>
          HttpResponse.json({ items: mockMembers }),
        ),
        taskDefinitionDetailHandler(),
      ],
    },
  },
};

/** iPhone 13 viewport, logged in as plain MEMBER — same layout without access. */
export const MobileMember: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};
