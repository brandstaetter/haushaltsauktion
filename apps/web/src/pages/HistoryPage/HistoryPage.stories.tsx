import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { HistoryEventRow } from '../../api/types';
import { HistoryPage } from './HistoryPage';
import { Layout } from '../../components/Layout/Layout';
import { mockMembers, mockSession } from '../../mocks/data';

/** Mix of history event types showing the full lifecycle. */
const historyEvents: HistoryEventRow[] = [
  {
    id: 'event-1',
    seq: '1',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: null,
    type: 'OFFERED',
    payload: { value: 6 },
    pushNotified: false,
  },
  {
    id: 'event-2',
    seq: '2',
    createdAt: new Date(Date.now() - 3000_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: null,
    type: 'NO_VOLUNTEER',
    payload: {},
    pushNotified: true,
  },
  {
    id: 'event-3',
    seq: '3',
    createdAt: new Date(Date.now() - 2400_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: mockMembers[1],
    type: 'RANDOMLY_ASSIGNED',
    payload: { candidateCount: 4 },
    pushNotified: true,
  },
  {
    id: 'event-4',
    seq: '4',
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: mockMembers[1],
    type: 'BOUGHT_OUT',
    payload: { cost: 6 },
    pushNotified: false,
  },
  {
    id: 'event-5',
    seq: '5',
    createdAt: new Date(Date.now() - 1200_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: null,
    type: 'VALUE_INCREASED',
    payload: { from: 6, to: 9 },
    pushNotified: false,
  },
  {
    id: 'event-6',
    seq: '6',
    createdAt: new Date(Date.now() - 600_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: null,
    type: 'RE_OFFERED',
    payload: { value: 9, offerExpiresAt: null },
    pushNotified: true,
  },
  {
    id: 'event-7',
    seq: '7',
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: mockMembers[2],
    type: 'VOLUNTEERED',
    payload: { value: 9 },
    pushNotified: false,
  },
  {
    id: 'event-8',
    seq: '8',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: mockMembers[2],
    type: 'COMPLETED',
    payload: { value: 9, pointsAwarded: 9 },
    pushNotified: false,
  },
  {
    id: 'event-9',
    seq: '9',
    createdAt: new Date(Date.now() - 30_000).toISOString(),
    taskInstanceId: 'instance-bathroom-1',
    taskTitle: 'Bad putzen',
    member: null,
    type: 'VALUE_RESET',
    payload: { from: 9, to: 6, strategy: 'BASE_VALUE' },
    pushNotified: false,
  },
];

/** First page of paginated events. */
const paginatedEvents = historyEvents.slice(0, 3);

const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

const iphone13Viewport = { value: 'iphone13', isRotated: false };

const meta = {
  title: 'Pages/HistoryPage',
  component: HistoryPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: { initialEntries: ['/verlauf'] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verlauf" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof HistoryPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Full lifecycle from offer to completion: NO_VOLUNTEER → RANDOMLY_ASSIGNED → BOUGHT_OUT → RE_OFFERED → VOLUNTEERED → COMPLETED → VALUE_RESET. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/history', () =>
          HttpResponse.json({ items: historyEvents, nextCursor: null }),
        ),
      ],
    },
  },
};

/** No history events — the empty-state copy. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/history', () =>
          HttpResponse.json({ items: [], nextCursor: null }),
        ),
      ],
    },
  },
};

/** History fetch fails (500) — retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/history', () =>
          HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** Indefinite delay on history — skeleton/spinner. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/history', () => new Promise(() => {})),
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
        http.get('/api/history', () =>
          HttpResponse.json({ items: historyEvents, nextCursor: null }),
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
        http.get('/api/history', () =>
          HttpResponse.json({ items: historyEvents, nextCursor: null }),
        ),
      ],
    },
  },
};

/** Paginated result: first page has three events with a "load more" affordance. */
export const Paginated: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/history', ({ request }) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          if (cursor) {
            // Simulating the second page
            return HttpResponse.json({ items: historyEvents.slice(3, 6), nextCursor: null });
          }
          // First page
          return HttpResponse.json({ items: paginatedEvents, nextCursor: 'cursor-page-2' });
        }),
      ],
    },
  },
};
