import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { AdminMemberDto, CategoryDto, TaskDefinitionSummaryDto } from '../../api/types';
import { AdminMembersPage } from './AdminMembersPage';
import { Layout } from '../../components/Layout/Layout';

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

/** Seed-data categories. */
const seedCategories: CategoryDto[] = [
  { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 1 },
  { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 2 },
];

/** Seed-data tasks. */
const seedTasks: TaskDefinitionSummaryDto[] = [
  { id: 'def-dishwasher', title: 'Geschirrspüler ausräumen' },
  { id: 'def-trash', title: 'Müll hinausbringen' },
  { id: 'def-bathroom', title: 'Bad putzen' },
];

/**
 * Page-level story: renders AdminMembersPage inside the real Layout so the
 * header, nav, and admin tab bar show up. Uses the real route `/verwaltung/benutzer`
 * to trigger the correct admin tab highlight.
 */
const meta = {
  title: 'Pages/Admin/AdminMembersPage',
  component: AdminMembersPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: {
      initialEntries: ['/verwaltung/benutzer'],
    },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/benutzer" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminMembersPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default state — the page loads with the full household member list,
 * showing the real admin chrome (title, back button, admin tab bar) around
 * the members section.
 */
export const Default: Story = {
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
              makeMember({
                id: 'member-luise',
                displayName: 'Luise',
                pointsCache: -8,
                maxRandomAssignmentsPerWeek: 3,
              }),
            ],
          }),
        ),
        http.get('/api/admin/categories', () => HttpResponse.json({ items: seedCategories })),
        http.get('/api/admin/task-definitions', () => HttpResponse.json({ items: seedTasks })),
      ],
    },
  },
};

/**
 * Empty state — no members yet. The page shows the empty affordance and
 * the "+" FAB to add the first member.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () => HttpResponse.json({ items: [] })),
        http.get('/api/admin/categories', () => HttpResponse.json({ items: seedCategories })),
        http.get('/api/admin/task-definitions', () => HttpResponse.json({ items: seedTasks })),
      ],
    },
  },
};

/**
 * iPhone 13 viewport — shows the mobile layout with the admin tab bar and
 * members section on a 390px-wide screen. The responsive layout should adapt
 * without horizontal scrolling.
 */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/members', () =>
          HttpResponse.json({
            items: [
              makeMember({ id: 'member-elke', displayName: 'Elke', role: 'ADMIN' }),
              makeMember({ id: 'member-arthur', displayName: 'Arthur' }),
            ],
          }),
        ),
        http.get('/api/admin/categories', () => HttpResponse.json({ items: seedCategories })),
        http.get('/api/admin/task-definitions', () => HttpResponse.json({ items: seedTasks })),
      ],
    },
  },
};
