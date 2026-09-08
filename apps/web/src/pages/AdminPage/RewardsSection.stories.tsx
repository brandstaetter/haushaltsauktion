import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import type { AdminRewardDto } from '../../api/types';
import { RewardsSection } from './RewardsSection';

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

const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Rewards catalog section (admin panel) — shows active and archived rewards with
 * a FAB to create new ones. RewardsSection is a page-local component, not a route,
 * so it renders standalone without route decorators.
 */
const meta = {
  title: 'Pages/Admin/RewardsSection',
  component: RewardsSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RewardsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Reward catalog populated with multiple active and archived rewards. */
export const Populated: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: mockRewards })),
      ],
    },
  },
};

/** Empty reward catalog — no rewards configured yet. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: [] })),
      ],
    },
  },
};

/** Catalog fetch is in progress — indefinite loading state. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => new Promise(() => {})),
      ],
    },
  },
};

/** Catalog fetch failed — 500 error, user can retry. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () =>
          HttpResponse.json({ error: { message: 'Fehler beim Laden der Rewards.' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** Mobile (iPhone 13) viewing the catalog with populated rewards. */
export const Mobile: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/rewards', () => HttpResponse.json({ items: mockRewards })),
      ],
    },
  },
};
