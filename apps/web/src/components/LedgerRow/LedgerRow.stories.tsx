import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PointTransactionDto } from '@haushaltsauktion/shared';
import { LedgerRow } from './LedgerRow';

const baseTransaction: PointTransactionDto = {
  id: 'tx-1',
  seq: '1',
  amount: 6,
  balanceBefore: 36,
  balanceAfter: 42,
  type: 'VOLUNTARY_TASK_REWARD',
  taskInstanceId: 'instance-bathroom-1',
  taskInstanceTitle: 'Bad putzen',
  taskAssignmentId: 'assignment-1',
  description: 'Freiwillige Übernahme erledigt',
  createdAt: new Date(Date.now() - 3600_000).toISOString(),
  initiator: { memberId: 'member-elke', displayName: 'Elke' },
};

const meta = {
  title: 'Components/LedgerRow',
  component: LedgerRow,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}><Story /></ol>],
} satisfies Meta<typeof LedgerRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const VoluntaryReward: Story = {
  args: { transaction: baseTransaction },
};

export const Buyout: Story = {
  args: {
    transaction: {
      ...baseTransaction,
      id: 'tx-2',
      amount: -2,
      balanceBefore: 42,
      balanceAfter: 40,
      type: 'BUYOUT',
      taskInstanceTitle: 'Müll hinausbringen',
      description: 'Aufgabe freigekauft',
    },
  },
};

/** No task reference — pure ledger entries like decay or manual adjustments omit the task line. */
export const WithoutTask: Story = {
  args: {
    transaction: {
      ...baseTransaction,
      id: 'tx-3',
      amount: -1,
      balanceBefore: 48,
      balanceAfter: 47,
      type: 'DECAY',
      taskInstanceId: null,
      taskInstanceTitle: null,
      taskAssignmentId: null,
      description: 'Wöchentlicher Verfall',
      initiator: null,
    },
  },
};
