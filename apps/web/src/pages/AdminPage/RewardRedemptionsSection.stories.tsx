import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import type { AdminRedemptionDto } from '../../api/types';
import { RewardRedemptionsSection } from './RewardRedemptionsSection';
import { mockMembers } from '../../mocks/data';

/** Fulfillment queue — mix of PENDING (awaiting admin action) and FULFILLED (historical). */
const mockRedemptions: AdminRedemptionDto[] = [
  {
    id: 'redemption-1',
    status: 'PENDING',
    costAtPurchase: 80,
    purchasedAt: '2026-09-08T14:20:00Z',
    fulfilledAt: null,
    reward: { id: 'reward-cinema', title: 'Kinoabend' },
    member: mockMembers[1], // Arthur
  },
  {
    id: 'redemption-2',
    status: 'PENDING',
    costAtPurchase: 45,
    purchasedAt: '2026-09-08T13:50:00Z',
    fulfilledAt: null,
    reward: { id: 'reward-favorite-meal', title: 'Lieblingsessen aussuchen' },
    member: mockMembers[2], // Luise
  },
  {
    id: 'redemption-3',
    status: 'FULFILLED',
    costAtPurchase: 30,
    purchasedAt: '2026-09-07T15:30:00Z',
    fulfilledAt: '2026-09-08T10:00:00Z',
    reward: { id: 'reward-late-bedtime', title: 'Länger aufbleiben' },
    member: mockMembers[3], // Hannes
  },
  {
    id: 'redemption-4',
    status: 'FULFILLED',
    costAtPurchase: 20,
    purchasedAt: '2026-09-06T11:15:00Z',
    fulfilledAt: '2026-09-07T09:30:00Z',
    reward: { id: 'reward-skip-task', title: 'Eine Aufgabe überspringen' },
    member: mockMembers[0], // Elke
  },
];

const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Reward fulfillment queue section (admin panel) — displays pending redemptions
 * awaiting admin action (mark as fulfilled). RewardRedemptionsSection is a
 * page-local component, not a route, so it renders standalone without route
 * decorators. Queries with `status=PENDING` by default.
 */
const meta = {
  title: 'Pages/Admin/RewardRedemptionsSection',
  component: RewardRedemptionsSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RewardRedemptionsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Fulfillment queue with pending items awaiting admin action.
 * Shows members who have purchased rewards and are waiting for physical/manual fulfilment.
 */
export const WithPending: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards/redemptions', ({ request }) => {
          const url = new URL(request.url);
          const status = url.searchParams.get('status');
          // Section queries with status=PENDING
          if (status === 'PENDING') {
            return HttpResponse.json({
              items: mockRedemptions.filter((r) => r.status === 'PENDING'),
            });
          }
          return HttpResponse.json({ items: mockRedemptions });
        }),
      ],
    },
  },
};

/** Empty fulfillment queue — all pending redemptions have been fulfilled. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards/redemptions', () =>
          HttpResponse.json({ items: [] }),
        ),
      ],
    },
  },
};

/** Fulfillment queue fetch is in progress — indefinite loading state. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards/redemptions', () => new Promise(() => {})),
      ],
    },
  },
};

/** Fulfillment queue fetch failed — 500 error, user can retry. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards/redemptions', () =>
          HttpResponse.json(
            { error: { message: 'Fehler beim Laden der Redemptions.' } },
            { status: 500 },
          ),
        ),
      ],
    },
  },
};

/** Mobile (iPhone 13) viewing the fulfillment queue with pending items. */
export const Mobile: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards/redemptions', ({ request }) => {
          const url = new URL(request.url);
          const status = url.searchParams.get('status');
          if (status === 'PENDING') {
            return HttpResponse.json({
              items: mockRedemptions.filter((r) => r.status === 'PENDING'),
            });
          }
          return HttpResponse.json({ items: mockRedemptions });
        }),
      ],
    },
  },
};
