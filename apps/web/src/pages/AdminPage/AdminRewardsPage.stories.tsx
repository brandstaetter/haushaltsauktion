import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { AdminRedemptionDto, AdminRewardDto } from '../../api/types';
import { AdminRewardsPage } from './AdminRewardsPage';
import { Layout } from '../../components/Layout/Layout';
import { mockMembers } from '../../mocks/data';

/** Realistic reward catalog — mix of manual fulfillment and virtual effects. */
const mockRewards: AdminRewardDto[] = [
  {
    id: 'reward-cinema',
    title: 'Kinoabend',
    description: 'Familie geht gemeinsam ins Kino',
    cost: 80,
    kind: 'MANUAL_FULFILLMENT',
    effectType: null,
    effectDurationMinutes: null,
    effectCharges: null,
    effectMultiplier: null,
    isActive: true,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'reward-skip-task',
    title: 'Eine Aufgabe überspringen',
    description: 'Darf eine zufällig zugewiesene Aufgabe einmal ignorieren',
    cost: 20,
    kind: 'VIRTUAL_EFFECT',
    effectType: 'IMMUNITY',
    effectDurationMinutes: 1440,
    effectCharges: 1,
    effectMultiplier: null,
    isActive: true,
    createdAt: '2026-08-10T14:30:00Z',
    updatedAt: '2026-08-10T14:30:00Z',
  },
  {
    id: 'reward-favorite-meal',
    title: 'Lieblingsessen aussuchen',
    description: 'Wählt das nächste Familienessen',
    cost: 45,
    kind: 'MANUAL_FULFILLMENT',
    effectType: null,
    effectDurationMinutes: null,
    effectCharges: null,
    effectMultiplier: null,
    isActive: true,
    createdAt: '2026-08-05T09:15:00Z',
    updatedAt: '2026-08-05T09:15:00Z',
  },
  {
    id: 'reward-points-multiplier',
    title: 'Punkte-Multiplikator',
    description: 'Nächste freiwillige Aufgabe zählt doppelt',
    cost: 60,
    kind: 'VIRTUAL_EFFECT',
    effectType: 'MULTIPLIER',
    effectDurationMinutes: 1440,
    effectCharges: 1,
    effectMultiplier: 2.0,
    isActive: true,
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-08-15T11:00:00Z',
  },
  {
    id: 'reward-late-bedtime',
    title: 'Länger aufbleiben',
    description: 'Eine Stunde später ins Bett',
    cost: 30,
    kind: 'VIRTUAL_EFFECT',
    effectType: 'IMMUNITY',
    effectDurationMinutes: 60,
    effectCharges: null,
    effectMultiplier: null,
    isActive: false,
    createdAt: '2026-07-20T16:45:00Z',
    updatedAt: '2026-08-20T16:45:00Z',
  },
];

/** Fulfillment queue — mix of PENDING (awaiting admin action) and FULFILLED (for history). */
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
];

const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Admin rewards page (route: `/verwaltung/punkte-shop`) — the full-page view with
 * both the fulfillment queue (RewardRedemptionsSection) and reward catalog
 * (RewardsSection) sections, rendered inside the admin chrome.
 */
const meta = {
  title: 'Pages/Admin/AdminRewardsPage',
  component: AdminRewardsPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: { initialEntries: ['/verwaltung/punkte-shop'] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/punkte-shop" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminRewardsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Household state with both rewards and pending redemptions. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: mockRewards })),
        http.get('/api/admin/rewards/redemptions', ({ request }) => {
          const url = new URL(request.url);
          const status = url.searchParams.get('status');
          if (status === 'PENDING') {
            return HttpResponse.json({ items: mockRedemptions.filter((r) => r.status === 'PENDING') });
          }
          return HttpResponse.json({ items: mockRedemptions });
        }),
      ],
    },
  },
};

/** Empty household — no rewards configured and no pending redemptions. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: [] })),
        http.get('/api/admin/rewards/redemptions', () => HttpResponse.json({ items: [] })),
      ],
    },
  },
};

/** Mobile (iPhone 13) viewing the page with default state. */
export const Mobile: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: mockRewards })),
        http.get('/api/admin/rewards/redemptions', ({ request }) => {
          const url = new URL(request.url);
          const status = url.searchParams.get('status');
          if (status === 'PENDING') {
            return HttpResponse.json({ items: mockRedemptions.filter((r) => r.status === 'PENDING') });
          }
          return HttpResponse.json({ items: mockRedemptions });
        }),
      ],
    },
  },
};
