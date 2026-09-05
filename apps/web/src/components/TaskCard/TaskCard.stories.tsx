import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AvailableTaskDto } from '@haushaltsauktion/shared';
import { TaskCard } from './TaskCard';

/** A fully-specified `AvailableTaskDto` so each story only overrides what it varies. */
function makeTask(overrides: Partial<AvailableTaskDto> = {}): AvailableTaskDto {
  return {
    id: 'task-1',
    version: 1,
    title: 'Bad putzen',
    description: null,
    category: { id: 'cat-bad', name: 'Bad', colorHex: '#5b8def' },
    currentValue: 6,
    baseValue: 4,
    buyoutCount: 0,
    estimatedMinutes: 30,
    dueAt: null,
    isOverdue: false,
    offerExpiresAt: null,
    status: 'AVAILABLE',
    canVolunteer: true,
    ineligibleReason: null,
    potentialReward: 6,
    workerCountMode: 'EXACTLY',
    workerCount: 1,
    activeSlotCount: 0,
    viewerHasActiveSlot: false,
    ...overrides,
  };
}

const meta = {
  title: 'Components/TaskCard',
  component: TaskCard,
  parameters: { layout: 'padded' },
  args: {
    onAction: () => {},
  },
} satisfies Meta<typeof TaskCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Freshly offered — CTA is "Freiwillig übernehmen" (§20). */
export const Available: Story = {
  args: { task: makeTask() },
};

/** Randomly assigned to the current viewer — CTA switches to "Öffnen" (§21). */
export const Assigned: Story = {
  args: {
    task: makeTask({ status: 'ASSIGNED', potentialReward: 0, viewerHasActiveSlot: true }),
    assignee: { id: 'member-anna', displayName: 'Anna', avatarUrl: null, kind: 'RANDOM' },
  },
};

/**
 * Multi-worker task, first slot already taken by someone else — still
 * ASSIGNED, but a slot is free and the viewer hasn't joined, so the CTA stays
 * "Freiwillig übernehmen" instead of switching to "Öffnen".
 * Regression coverage for the vanish-from-list bugfix.
 */
export const AssignedWithOpenSlot: Story = {
  args: {
    task: makeTask({
      status: 'ASSIGNED',
      workerCountMode: 'AT_LEAST',
      workerCount: 1,
      activeSlotCount: 1,
      canVolunteer: true,
      viewerHasActiveSlot: false,
    }),
    assignee: { id: 'member-anna', displayName: 'Anna', avatarUrl: null, kind: 'VOLUNTARY' },
  },
};

/** Already bought out once — the value has grown per §9's default multiplier. */
export const AfterBuyout: Story = {
  args: {
    task: makeTask({ currentValue: 9, buyoutCount: 1, potentialReward: 9 }),
  },
};

/** Due today, with a category badge and an estimated duration shown in the meta row. */
export const DueToday: Story = {
  args: { task: makeTask({ dueAt: new Date().toISOString() }) },
};

/** Overdue — the meta row's due-date text switches to the "seit …" phrasing. */
export const Overdue: Story = {
  args: {
    task: makeTask({
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      isOverdue: true,
    }),
  },
};

/** The current viewer is not eligible (§6 exclusion rules) — the CTA is disabled. */
export const NotEligible: Story = {
  args: {
    task: makeTask({ canVolunteer: false, ineligibleReason: 'CATEGORY_EXCLUDED' }),
  },
};

/** No category assigned, and completed — combines two optional pieces of the card. */
export const CompletedNoCategory: Story = {
  args: {
    task: makeTask({ category: null, status: 'COMPLETED', currentValue: 4, potentialReward: 0 }),
  },
};
