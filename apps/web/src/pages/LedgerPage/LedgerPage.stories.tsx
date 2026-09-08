import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { PointTransactionDto } from '@haushaltsauktion/shared';
import { LedgerPage } from './LedgerPage';
import { Layout } from '../../components/Layout/Layout';
import { mockSession } from '../../mocks/data';

/** Mix of transaction types spanning the full app lifecycle. */
const ledgerTransactions: PointTransactionDto[] = [
  {
    id: 'tx-1',
    seq: '1',
    amount: 6,
    balanceBefore: 36,
    balanceAfter: 42,
    type: 'VOLUNTARY_TASK_REWARD',
    taskInstanceId: 'instance-bathroom-1',
    taskInstanceTitle: 'Bad putzen',
    taskAssignmentId: 'assignment-1',
    description: 'Freiwillige Übernahme erledigt',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
  {
    id: 'tx-2',
    seq: '2',
    amount: -2,
    balanceBefore: 42,
    balanceAfter: 40,
    type: 'BUYOUT',
    taskInstanceId: 'instance-trash-1',
    taskInstanceTitle: 'Müll hinausbringen',
    taskAssignmentId: 'assignment-2',
    description: 'Aufgabe freigekauft',
    createdAt: new Date(Date.now() - 2700_000).toISOString(),
    initiator: { memberId: mockSession.member!.id, displayName: mockSession.member!.displayName },
  },
  {
    id: 'tx-3',
    seq: '3',
    amount: 4,
    balanceBefore: 40,
    balanceAfter: 44,
    type: 'VOLUNTARY_TASK_REWARD',
    taskInstanceId: 'instance-vacuum-1',
    taskInstanceTitle: 'Staubsaugen',
    taskAssignmentId: 'assignment-3',
    description: 'Freiwillige Übernahme erledigt',
    createdAt: new Date(Date.now() - 2400_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
  {
    id: 'tx-4',
    seq: '4',
    amount: 5,
    balanceBefore: 44,
    balanceAfter: 49,
    type: 'BONUS',
    taskInstanceId: 'instance-kitchen-1',
    taskInstanceTitle: 'Küche gründlich reinigen',
    taskAssignmentId: null,
    description: 'Administrativer Bonus',
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
  {
    id: 'tx-5',
    seq: '5',
    amount: -3,
    balanceBefore: 49,
    balanceAfter: 46,
    type: 'PENALTY',
    taskInstanceId: null,
    taskInstanceTitle: null,
    taskAssignmentId: null,
    description: 'Verwarnungsabzug',
    createdAt: new Date(Date.now() - 1200_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
  {
    id: 'tx-6',
    seq: '6',
    amount: 2,
    balanceBefore: 46,
    balanceAfter: 48,
    type: 'CORRECTION',
    taskInstanceId: 'instance-bathroom-2',
    taskInstanceTitle: 'Bad putzen',
    taskAssignmentId: null,
    description: 'Fehlerkorrektur',
    createdAt: new Date(Date.now() - 600_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
  {
    id: 'tx-7',
    seq: '7',
    amount: -1,
    balanceBefore: 48,
    balanceAfter: 47,
    type: 'DECAY',
    taskInstanceId: null,
    taskInstanceTitle: null,
    taskAssignmentId: null,
    description: 'Wöchentlicher Verfall',
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    initiator: null,
  },
  {
    id: 'tx-8',
    seq: '8',
    amount: 3,
    balanceBefore: 47,
    balanceAfter: 50,
    type: 'MANUAL_ADJUSTMENT',
    taskInstanceId: null,
    taskInstanceTitle: null,
    taskAssignmentId: null,
    description: 'Manuelle Anpassung durch Admin',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    initiator: { memberId: 'member-elke', displayName: 'Elke' },
  },
];

/** First page of paginated transactions. */
const paginatedTransactions = ledgerTransactions.slice(0, 3);

const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

const iphone13Viewport = { value: 'iphone13', isRotated: false };

const meta = {
  title: 'Pages/LedgerPage',
  component: LedgerPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: { initialEntries: ['/punktekonto'] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/punktekonto" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof LedgerPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** All transaction types: VOLUNTARY_TASK_REWARD (positive), BUYOUT (negative), BONUS, PENALTY, CORRECTION, DECAY, MANUAL_ADJUSTMENT. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me/point-transactions', () =>
          HttpResponse.json({ items: ledgerTransactions, nextCursor: null }),
        ),
      ],
    },
  },
};

/** No transactions — the empty-state copy. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me/point-transactions', () =>
          HttpResponse.json({ items: [], nextCursor: null }),
        ),
      ],
    },
  },
};

/** Ledger fetch fails (500) — retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me/point-transactions', () =>
          HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** Indefinite delay on transactions — skeleton/spinner. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me/point-transactions', () => new Promise(() => {})),
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
        http.get('/api/members/me/point-transactions', () =>
          HttpResponse.json({ items: ledgerTransactions, nextCursor: null }),
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
        http.get('/api/members/me/point-transactions', () =>
          HttpResponse.json({ items: ledgerTransactions, nextCursor: null }),
        ),
      ],
    },
  },
};

/** Paginated result: first page has three transactions with a "load more" affordance. */
export const Paginated: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me/point-transactions', ({ request }) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          if (cursor) {
            // Simulating the second page
            return HttpResponse.json({ items: ledgerTransactions.slice(3, 6), nextCursor: null });
          }
          // First page
          return HttpResponse.json({ items: paginatedTransactions, nextCursor: 'cursor-page-2' });
        }),
      ],
    },
  },
};
