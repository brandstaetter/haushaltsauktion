import type { Meta, StoryObj } from '@storybook/react-vite';
import { ValueChip } from './ValueChip';

const meta = {
  title: 'Components/ValueChip',
  component: ValueChip,
  args: {
    value: 4,
    baseValue: 4,
    buyoutCount: 0,
    size: 'md',
  },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof ValueChip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Fresh offer, never bought out — base tier styling. */
export const BaseValue: Story = {};

/** After one buyout: `4 → 6` (§9 default multiplier 1.5, ceil). */
export const AfterOneBuyout: Story = {
  args: { value: 6, baseValue: 4, buyoutCount: 1 },
};

/** After two buyouts: `4 → 6 → 9`. */
export const AfterTwoBuyouts: Story = {
  args: { value: 9, baseValue: 4, buyoutCount: 2 },
};

/** Three or more buyouts share the same top tier styling (`Math.min(buyoutCount, 3)`). */
export const AfterManyBuyouts: Story = {
  args: { value: 14, baseValue: 4, buyoutCount: 5 },
};

export const WithoutBaseLabel: Story = {
  args: { showBase: false },
};

export const Small: Story = {
  args: { size: 'sm' },
};

export const Large: Story = {
  args: { size: 'lg', value: 9, baseValue: 4, buyoutCount: 2 },
};

/**
 * Intake "time-based-value-growth": a chore nobody has taken keeps getting
 * more rewarding. §31 means the card has to say so, not leave members to
 * notice the number moving.
 */
export const Growing: Story = {
  args: {
    value: 9,
    baseValue: 4,
    growth: {
      pointsPerInterval: 1,
      intervalMinutes: 60,
      since: '2026-09-16T08:00:00.000Z',
      nextAt: '2026-09-16T09:00:00.000Z',
      maximumValue: null,
    },
  },
};

export const GrowingTowardsACap: Story = {
  args: {
    value: 17,
    baseValue: 4,
    buyoutCount: 2,
    growth: {
      pointsPerInterval: 2,
      intervalMinutes: 180,
      since: '2026-09-16T08:00:00.000Z',
      nextAt: '2026-09-16T11:00:00.000Z',
      maximumValue: 20,
    },
  },
};
