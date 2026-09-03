import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@haushaltsauktion/shared';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  argTypes: {
    status: { control: 'select', options: Object.values(TaskStatus) },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Available: Story = { args: { status: TaskStatus.AVAILABLE } };
export const Assigned: Story = { args: { status: TaskStatus.ASSIGNED } };
export const Completed: Story = { args: { status: TaskStatus.COMPLETED } };
export const Cancelled: Story = { args: { status: TaskStatus.CANCELLED } };
export const Paused: Story = { args: { status: TaskStatus.PAUSED } };
export const Expired: Story = { args: { status: TaskStatus.EXPIRED } };

/** An unrecognized status string falls back to a lowercased label instead of crashing. */
export const UnknownFallback: Story = { args: { status: 'SOMETHING_NEW' } };
