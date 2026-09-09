import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkerCountMode } from '@haushaltsauktion/shared';
import type { AdminTaskInstanceRowDto } from '../../api/types';
import { InstanceRow } from './InstanceRow';
import styles from './AdminPage.module.css';

function createInstance(overrides: Partial<AdminTaskInstanceRowDto> = {}): AdminTaskInstanceRowDto {
  return {
    id: 'inst-available',
    status: 'AVAILABLE',
    currentValue: 6,
    dueAt: null,
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    activeSlotCount: 0,
    assignments: [],
    ...overrides,
  };
}

const meta = {
  title: 'Pages/Admin/InstanceRow',
  component: InstanceRow,
  parameters: { layout: 'padded' },
  args: {
    baseValue: 6,
    error: null,
    cancelling: false,
    unassigning: false,
    disabled: false,
    onCancel: () => {},
    onUnassign: () => {},
  },
  render: (args) => (
    <ul className={styles.checkboxList}>
      <InstanceRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof InstanceRow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** AVAILABLE, unassigned — nobody has claimed it yet, so "Zuweisung aufheben" is disabled (nothing to release). */
export const Available: Story = {
  args: {
    instance: createInstance(),
  },
};

/** ASSIGNED to one member via random draw. */
export const Assigned: Story = {
  args: {
    instance: createInstance({
      id: 'inst-assigned',
      status: 'ASSIGNED',
      currentValue: 9,
      dueAt: '2026-01-05T14:00:00.000Z',
      activeSlotCount: 1,
      assignments: [
        { id: 'asg-1', kind: 'RANDOM', slotIndex: 0, member: { id: 'member-anna', displayName: 'Anna' } },
      ],
    }),
  },
};

/** Multi-worker instance — 2 of 3 slots filled, both holders listed. */
export const MultiWorker: Story = {
  args: {
    instance: createInstance({
      id: 'inst-multi',
      status: 'ASSIGNED',
      currentValue: 4,
      workerCountMode: WorkerCountMode.EXACTLY,
      workerCount: 3,
      activeSlotCount: 2,
      assignments: [
        { id: 'asg-1', kind: 'VOLUNTARY', slotIndex: 0, member: { id: 'member-paul', displayName: 'Paul' } },
        { id: 'asg-2', kind: 'RANDOM', slotIndex: 1, member: { id: 'member-maria', displayName: 'Maria' } },
      ],
    }),
    baseValue: 4,
  },
};

/** The cancel action is in flight for this row. */
export const Cancelling: Story = {
  args: {
    instance: createInstance({ id: 'inst-cancelling', status: 'ASSIGNED', currentValue: 6 }),
    cancelling: true,
    disabled: true,
  },
};

/** The unassign action is in flight for this row. */
export const Unassigning: Story = {
  args: {
    instance: createInstance({
      id: 'inst-unassigning',
      status: 'ASSIGNED',
      currentValue: 6,
      assignments: [
        { id: 'asg-1', kind: 'RANDOM', slotIndex: 0, member: { id: 'member-paul', displayName: 'Paul' } },
      ],
    }),
    unassigning: true,
    disabled: true,
  },
};

/** A previous cancel attempt on this row failed. */
export const WithError: Story = {
  args: {
    instance: createInstance({ id: 'inst-error', status: 'ASSIGNED', currentValue: 6 }),
    error: 'Aufgabe konnte nicht storniert werden.',
  },
};
