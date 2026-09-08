import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { HouseholdTaskDto } from '@haushaltsauktion/shared';
import { TaskListPage } from './TaskListPage';
import { Layout } from '../../components/Layout/Layout';
import { mockAvailableTasks, mockSession } from '../../mocks/data';

const kitchenCategory = { id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b' };
const bathroomCategory = { id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6' };

/** Household-wide tasks mixing AVAILABLE and ASSIGNED (different assignees and kinds). */
const householdTasks: HouseholdTaskDto[] = [
  {
    ...mockAvailableTasks[1],
    id: 'instance-available-household',
    title: 'Müll hinausbringen',
    status: 'AVAILABLE',
    canVolunteer: true,
    assignee: null,
    assignees: [],
  },
  {
    ...mockAvailableTasks[0],
    id: 'instance-assigned-random',
    title: 'Geschirrspüler ausräumen',
    status: 'ASSIGNED',
    canVolunteer: false,
    category: kitchenCategory,
    assignee: { id: 'member-arthur', displayName: 'Arthur', avatarUrl: null, kind: 'RANDOM' },
    assignees: [{ id: 'member-arthur', displayName: 'Arthur', avatarUrl: null, kind: 'RANDOM' }],
  },
  {
    ...mockAvailableTasks[1],
    id: 'instance-assigned-voluntary',
    title: 'Bad putzen',
    status: 'ASSIGNED',
    canVolunteer: false,
    category: bathroomCategory,
    assignee: { id: 'member-luise', displayName: 'Luise', avatarUrl: null, kind: 'VOLUNTARY' },
    assignees: [{ id: 'member-luise', displayName: 'Luise', avatarUrl: null, kind: 'VOLUNTARY' }],
  },
];

const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

const iphone13Viewport = { value: 'iphone13', isRotated: false };

const meta = {
  title: 'Pages/TaskListPage',
  component: TaskListPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: { initialEntries: ['/aufgaben'] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/aufgaben" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof TaskListPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** All three tabs populated: available tasks, assigned to me, and household-wide roster. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ items: mockAvailableTasks }),
        ),
        http.get('/api/tasks/assigned-to-me', () =>
          HttpResponse.json({ items: [mockAvailableTasks[0]] }),
        ),
        http.get('/api/tasks/all', () =>
          HttpResponse.json({ items: householdTasks }),
        ),
      ],
    },
  },
};

/** All three tabs empty — the empty-state copy surfaces on each tab. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/tasks/assigned-to-me', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/tasks/all', () =>
          HttpResponse.json({ items: [] }),
        ),
      ],
    },
  },
};

/** Fetch of available tasks fails (500) — retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** Indefinite delay on available tasks — skeleton/spinner. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () => new Promise(() => {})),
      ],
    },
  },
};

/** iPhone 13 viewport with ADMIN (default fixture) — mobile-first layout. */
export const MobileAdmin: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ items: mockAvailableTasks }),
        ),
        http.get('/api/tasks/assigned-to-me', () =>
          HttpResponse.json({ items: [mockAvailableTasks[0]] }),
        ),
        http.get('/api/tasks/all', () =>
          HttpResponse.json({ items: householdTasks }),
        ),
      ],
    },
  },
};

/** iPhone 13 viewport with MEMBER role — mobile layout without admin nav. */
export const MobileMember: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        memberSessionHandler,
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ items: mockAvailableTasks }),
        ),
        http.get('/api/tasks/assigned-to-me', () =>
          HttpResponse.json({ items: [mockAvailableTasks[0]] }),
        ),
        http.get('/api/tasks/all', () =>
          HttpResponse.json({ items: householdTasks }),
        ),
      ],
    },
  },
};

/** Household tab fully populated: AVAILABLE and ASSIGNED tasks (random + voluntary) with assignee names. */
export const HouseholdTab: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/tasks/available', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/tasks/assigned-to-me', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/tasks/all', () =>
          HttpResponse.json({ items: householdTasks }),
        ),
      ],
    },
  },
};
