import type { Meta, StoryObj } from '@storybook/react-vite';
import { RewardPurchaseDisclosure } from './RewardPurchaseDisclosure';

const meta = {
  title: 'Components/RewardPurchaseDisclosure',
  component: RewardPurchaseDisclosure,
  args: {
    balance: 42,
    cost: 15,
  },
} satisfies Meta<typeof RewardPurchaseDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default state — shows balance before, cost, and positive balance after. */
export const Default: Story = {};

/** Balance after is zero — user spends all their points on this reward. */
export const ExactBalance: Story = {
  args: {
    balance: 50,
    cost: 50,
  },
};

/** Balance after is negative — the user does not have enough points (should only appear if negative balance is allowed). */
export const InsufficientBalance: Story = {
  args: {
    balance: 20,
    cost: 30,
  },
};

/** Demonstrates German number formatting with large values (thousands separator). */
export const LargeNumbers: Story = {
  args: {
    balance: 1234,
    cost: 567,
  },
};

/** Expensive reward with large balance — both numbers formatted with thousands separators. */
export const HighValueReward: Story = {
  args: {
    balance: 5000,
    cost: 3500,
  },
};
