import { BuyoutDenialReason, type BuyoutQuoteDto } from '@haushaltsauktion/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BuyoutDisclosure } from './BuyoutDisclosure';

function quoteFixture(overrides: Partial<BuyoutQuoteDto> = {}): BuyoutQuoteDto {
  return {
    assignmentId: 'assignment-1',
    allowed: true,
    disallowedReason: null,
    cost: 6,
    balanceBefore: 10,
    balanceAfter: 4,
    taskValueBefore: 6,
    taskValueAfter: 9,
    costStrategy: 'CURRENT_TASK_VALUE',
    valueIncreaseStrategy: 'MULTIPLIER',
    buyoutsUsedThisWeek: 1,
    buyoutsAllowedThisWeek: 3,
    configVersion: 4,
    ...overrides,
  };
}

const meta = {
  title: 'Components/BuyoutDisclosure',
  component: BuyoutDisclosure,
  args: {
    quote: quoteFixture(),
  },
} satisfies Meta<typeof BuyoutDisclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Buyout is allowed — shows all five required values (§31) without a denial reason. */
export const Default: Story = {};

/** Buyout is disallowed due to insufficient points — shows the denial reason and demonstrates negative balance after. */
export const InsufficientPoints: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: BuyoutDenialReason.INSUFFICIENT_POINTS,
      balanceBefore: 4,
      cost: 6,
      balanceAfter: -2,
    }),
  },
};

/** Buyout is disallowed because the weekly buyout limit has been reached — shows the denial reason. */
export const WeeklyLimitReached: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: BuyoutDenialReason.WEEKLY_LIMIT_REACHED,
      buyoutsUsedThisWeek: 3,
      buyoutsAllowedThisWeek: 3,
    }),
  },
};

/** Buyout is disallowed for a task-specific reason (buyout disabled for this task). */
export const DisabledForTask: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: BuyoutDenialReason.BUYOUT_DISABLED_FOR_TASK,
    }),
  },
};

/** Buyout is disallowed globally (buyout feature turned off by admin). */
export const DisabledGlobally: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: BuyoutDenialReason.BUYOUT_DISABLED_GLOBALLY,
    }),
  },
};

/** Buyout is disallowed because consecutive buyout limit has been reached. */
export const ConsecutiveLimitReached: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: BuyoutDenialReason.CONSECUTIVE_LIMIT_REACHED,
    }),
  },
};

/** Buyout is disallowed with no specific reason provided — shows a generic message. */
export const DisabledUnknownReason: Story = {
  args: {
    quote: quoteFixture({
      allowed: false,
      disallowedReason: null,
    }),
  },
};

/** Demonstrates German number formatting with large values (thousands separator). */
export const LargeNumbers: Story = {
  args: {
    quote: quoteFixture({
      balanceBefore: 1234,
      cost: 567,
      balanceAfter: 667,
      taskValueBefore: 890,
      taskValueAfter: 1335,
    }),
  },
};
