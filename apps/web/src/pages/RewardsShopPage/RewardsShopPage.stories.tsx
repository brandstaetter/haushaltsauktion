import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { RewardShopItemDto, MemberEffectDto } from '@haushaltsauktion/shared';
import { RewardsShopPage } from './RewardsShopPage';
import { Layout } from '../../components/Layout/Layout';
import { mockMembers } from '../../mocks/data';

/**
 * Reward shop fixtures with various item kinds and states. Real German
 * titles from typical household reward scenarios.
 */
const mockRewards: RewardShopItemDto[] = [
  {
    id: 'reward-pizza',
    title: 'Pizza für den Haushalt',
    description: 'Eine große Pizza für alle',
    cost: 50,
    kind: 'MANUAL_FULFILLMENT',
    effectType: null,
    effectDurationMinutes: null,
    effectCharges: null,
    effectMultiplier: null,
  },
  {
    id: 'reward-immunity',
    title: 'Aufgabenbefreiung (1 Stunde)',
    description: 'Du wirst für 1 Stunde keine neue Aufgabe zugeteilt',
    cost: 30,
    kind: 'VIRTUAL_EFFECT',
    effectType: 'IMMUNITY',
    effectDurationMinutes: 60,
    effectCharges: null,
    effectMultiplier: null,
  },
  {
    id: 'reward-multiplier',
    title: 'Punkte-Multiplikator (3x, 2 Aufgaben)',
    description: 'Die nächsten 2 Aufgaben geben dir 3x Punkte',
    cost: 40,
    kind: 'VIRTUAL_EFFECT',
    effectType: 'MULTIPLIER',
    effectDurationMinutes: null,
    effectCharges: 2,
    effectMultiplier: 3,
  },
  {
    id: 'reward-cinema',
    title: 'Kino-Gutschein',
    description: 'Gutschein für zwei Kinokarten',
    cost: 100,
    kind: 'MANUAL_FULFILLMENT',
    effectType: null,
    effectDurationMinutes: null,
    effectCharges: null,
    effectMultiplier: null,
  },
];

/** Member with high balance — can afford all rewards. */
const richMemberHandler = http.get('/api/members/me', () =>
  HttpResponse.json({ ...mockMembers[0], balance: 500 }),
);

/** Member with low balance — can only afford cheaper items. */
const poorMemberHandler = http.get('/api/members/me', () =>
  HttpResponse.json({ ...mockMembers[3], balance: 35 }),
);

/** Helper to click the "Kaufen" button for a specific reward. */
async function openPurchaseConfirmation(canvasElement: HTMLElement, rewardIndex: number): Promise<void> {
  const canvas = within(canvasElement);
  const buyButtons = await canvas.findAllByRole('button', { name: 'Kaufen' });
  await userEvent.click(buyButtons[rewardIndex]);
}

/** Helper to click the "Kauf bestätigen" button inside the confirmation sheet. */
async function confirmPurchase(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Kauf bestätigen' }));
}

const meta = {
  title: 'Pages/RewardsShopPage',
  component: RewardsShopPage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof RewardsShopPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Populated shop with manual and virtual rewards, high balance allows all purchases. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        richMemberHandler,
      ],
    },
  },
};

/** Shop with no rewards available — empty state. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: [] }),
        ),
      ],
    },
  },
};

/** Shop fetch fails — the page's retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/**
 * Shop loading indefinitely — shows spinner.
 * A pending promise never resolves.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () => new Promise(() => {})),
      ],
    },
  },
};

/**
 * Member with low balance (35 points) — only the two cheapest rewards
 * (30 and 40 points) are affordable; the others are visible but buttons
 * should be disabled or styled differently. Tests §31's requirement that
 * the balance is always shown.
 */
export const LowBalance: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        poorMemberHandler,
      ],
    },
  },
};

/**
 * Buy flow: member opens a reward's confirmation sheet. Tests the
 * RewardPurchaseDisclosure showing balance-before, cost, and balance-after.
 * The `play` function clicks the first reward's purchase button to open the sheet.
 */
export const ConfirmationOpen: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        richMemberHandler,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await openPurchaseConfirmation(canvasElement, 0);
  },
};

/**
 * Purchase in progress — button shows loading state while the mutation is pending.
 * The server never responds, so the loading UI persists. The `play` function
 * opens the confirmation sheet and clicks the confirm button to trigger the mutation.
 */
export const PurchaseLoading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        richMemberHandler,
        http.post('/api/rewards/:id/purchase', () => new Promise(() => {})),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await openPurchaseConfirmation(canvasElement, 0);
    await confirmPurchase(canvasElement);
  },
};

/**
 * Purchase succeeds and activates a VIRTUAL_EFFECT immediately.
 * Shows success toast with effect details. The `play` function opens the
 * confirmation sheet and confirms the purchase to trigger the successful response.
 */
export const PurchaseSuccess: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        richMemberHandler,
        http.post('/api/rewards/:id/purchase', () =>
          HttpResponse.json({
            redemptionId: 'redemption-1',
            cost: 30,
            balanceAfter: 470,
            activatedEffect: {
              id: 'effect-1',
              type: 'IMMUNITY',
              multiplierValue: null,
              chargesRemaining: null,
              totalCharges: null,
              expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            } satisfies MemberEffectDto,
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await openPurchaseConfirmation(canvasElement, 1);
    await confirmPurchase(canvasElement);
  },
};

/**
 * Purchase fails due to insufficient points — the server rejects with
 * INSUFFICIENT_POINTS and details showing the gap. The `play` function
 * opens the confirmation sheet and attempts the purchase to trigger the error.
 * The reward chosen (cinema ticket, 100 points) exceeds the poor member's balance (35).
 */
export const PurchaseInsufficientPoints: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        poorMemberHandler,
        http.post('/api/rewards/:id/purchase', () =>
          HttpResponse.json(
            {
              error: {
                code: 'INSUFFICIENT_POINTS',
                message: 'Nicht genug Punkte',
                details: { balance: 35, cost: 100 },
              },
            },
            { status: 400 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await openPurchaseConfirmation(canvasElement, 3);
    await confirmPurchase(canvasElement);
  },
};

/**
 * iPhone 13 viewport — shop should be readable and usable on mobile.
 * Buttons full-width, card layout vertical.
 */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/rewards', () =>
          HttpResponse.json({ items: mockRewards }),
        ),
        richMemberHandler,
      ],
    },
  },
};
