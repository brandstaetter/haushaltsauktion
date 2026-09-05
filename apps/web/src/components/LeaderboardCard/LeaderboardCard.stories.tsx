import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MemberDto } from '@haushaltsauktion/shared';
import { LeaderboardCard } from './LeaderboardCard';

function makeMember(overrides: Partial<MemberDto> = {}): MemberDto {
  return {
    id: 'member-1',
    displayName: 'Anna',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    balance: 10,
    maxRandomAssignmentsPerWeek: null,
    ...overrides,
  };
}

const meta = {
  title: 'Components/LeaderboardCard',
  component: LeaderboardCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LeaderboardCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    members: [
      makeMember({ id: 'elke', displayName: 'Elke', balance: 42 }),
      makeMember({ id: 'arthur', displayName: 'Arthur', balance: 17 }),
      makeMember({ id: 'luise', displayName: 'Luise', balance: 8 }),
      makeMember({ id: 'hannes', displayName: 'Hannes', balance: 3 }),
    ],
  },
};

/** Niemand hat Punkte über 0 — die Karte bleibt mit Überschrift bestehen, `Leaderboard` zeigt seinen Hinweistext statt einer leeren Liste. */
export const Empty: Story = {
  args: {
    members: [makeMember({ balance: 0 })],
  },
};
