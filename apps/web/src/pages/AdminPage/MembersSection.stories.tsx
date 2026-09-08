import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { AdminMemberDto, CategoryDto, TaskDefinitionSummaryDto } from '../../api/types';
import { MembersSection } from './MembersSection';

/** Fixture factory for AdminMemberDto matching the shape from GET /api/admin/members. */
function makeMember(overrides: Partial<AdminMemberDto> = {}): AdminMemberDto {
  return {
    id: `member-${Math.random().toString(36).slice(2, 9)}`,
    displayName: 'Anna',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    pointsCache: 42,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'anna@example.com', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
    ...overrides,
  };
}

/** Seed-data categories matching the household's task categories. */
const seedCategories: CategoryDto[] = [
  { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
  { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
  { id: 'cat-laundry', name: 'Wäsche', colorHex: '#10b981', sortOrder: 3 },
];

/** Seed-data tasks for restriction pickers. */
const seedTasks: TaskDefinitionSummaryDto[] = [
  { id: 'def-dishwasher', title: 'Geschirrspüler ausräumen' },
  { id: 'def-trash', title: 'Müll hinausbringen' },
  { id: 'def-laundry', title: 'Wäsche aufhängen' },
  { id: 'def-bathroom', title: 'Bad putzen' },
  { id: 'def-vacuum', title: 'Staubsaugen' },
];

/** Shared MSW handlers for categories and task labels — used by all stories. */
const categoryAndTaskHandlers = [
  http.get('/api/admin/categories', () => HttpResponse.json({ items: seedCategories })),
  http.get('/api/admin/task-definitions', () => HttpResponse.json({ items: seedTasks })),
];

const meta = {
  title: 'Pages/Admin/MembersSection',
  component: MembersSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MembersSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Types a query into the filter to reach a state the story name claims. */
async function typeFilterQuery(canvasElement: HTMLElement, query: string): Promise<void> {
  const canvas = within(canvasElement);
  const input = await canvas.findByPlaceholderText('Name oder E-Mail durchsuchen…');
  await userEvent.type(input, query);
}

/**
 * Default state — a mixed household with an ADMIN (Elke), regular MEMBERs
 * (Arthur, Luise, Hannes), one inactive, and various restriction states.
 * One member has a negative balance to show point-adjustment affordances.
 */
export const Populated: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({
                id: 'member-elke',
                displayName: 'Elke',
                role: 'ADMIN',
                isActive: true,
                pointsCache: 120,
              }),
              makeMember({
                id: 'member-arthur',
                displayName: 'Arthur',
                role: 'MEMBER',
                isActive: true,
                pointsCache: 17,
                user: { email: 'arthur@example.com', isActive: true },
              }),
              makeMember({
                id: 'member-luise',
                displayName: 'Luise',
                role: 'MEMBER',
                isActive: true,
                pointsCache: -8,
                maxRandomAssignmentsPerWeek: 3,
                user: { email: 'luise@example.com', isActive: true },
                categoryExclusions: [{ categoryId: 'cat-kitchen' }],
              }),
              makeMember({
                id: 'member-hannes',
                displayName: 'Hannes',
                role: 'MEMBER',
                isActive: false,
                pointsCache: 50,
                user: { email: 'hannes@example.com', isActive: true },
              }),
            ],
          }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};

/**
 * No members — the empty state. The "+" button is still visible for adding
 * the first member.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () => HttpResponse.json({ items: [] })),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};

/**
 * Members data is loading — shows the spinner while fetch is in flight.
 * Simulated with an indefinite-delay handler.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () => new Promise(() => {})),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};

/**
 * Members fetch fails with HTTP 500 — surfaces the retry affordance
 * via the section's error boundary.
 */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({ error: { message: 'Server error' } }, { status: 500 }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};

/**
 * Filter is active and matches only one member — shows the filtered list
 * without the non-matching rows. `play` types "Boris" into the search box.
 */
export const FilteredList: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({
                id: 'member-anna',
                displayName: 'Anna',
                user: { email: 'anna@example.com', isActive: true },
              }),
              makeMember({
                id: 'member-boris',
                displayName: 'Boris',
                user: { email: 'boris@example.com', isActive: true },
              }),
            ],
          }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await typeFilterQuery(canvasElement, 'Boris');
  },
};

/**
 * Filter is active but returns no matches — the "filter empty" state.
 * `play` types a query that doesn't match any member.
 */
export const FilterEmpty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({ id: 'member-anna', displayName: 'Anna' }),
              makeMember({ id: 'member-boris', displayName: 'Boris' }),
            ],
          }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await typeFilterQuery(canvasElement, 'xyz-no-match');
  },
};

/**
 * iPhone 13 viewport (390px) — the responsive case for a 703-line admin
 * table on a 390px-wide screen. Shows card layout and touch-friendly
 * button sizing.
 */
export const MobilePopulated: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({
                id: 'member-elke',
                displayName: 'Elke',
                role: 'ADMIN',
                pointsCache: 120,
              }),
              makeMember({
                id: 'member-arthur',
                displayName: 'Arthur',
                pointsCache: 17,
              }),
            ],
          }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};


/**
 * Member with existing restrictions (category exclusions, absences).
 * Shows the full restriction picture when viewing or editing.
 */
export const MemberWithRestrictions: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({
                id: 'member-luise',
                displayName: 'Luise',
                categoryExclusions: [{ categoryId: 'cat-kitchen' }],
                taskEligibility: [
                  { taskDefinitionId: 'def-dishwasher', mode: 'EXCLUDED' },
                ],
                absences: [
                  {
                    id: 'abs-1',
                    startsAt: '2026-09-10',
                    endsAt: '2026-09-17',
                    reason: 'Urlaub',
                  },
                  {
                    id: 'abs-2',
                    startsAt: '2026-10-01',
                    endsAt: '2026-10-05',
                    reason: null,
                  },
                ],
              }),
            ],
          }),
        ),
        ...categoryAndTaskHandlers,
      ],
    },
  },
};
