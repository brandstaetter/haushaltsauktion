import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MemberDto } from '@haushaltsauktion/shared';
import { Leaderboard } from './Leaderboard';

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
  title: 'Components/Leaderboard',
  component: Leaderboard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Leaderboard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Vier unterschiedliche Punktestände — Gold/Silber/Bronze, danach durchnummeriert. */
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

/** Zwei Erste teilen sich Gold — Silber wird übersprungen, die/der Nächste ist bereits Dritte(r). */
export const TieForFirst: Story = {
  args: {
    members: [
      makeMember({ id: 'elke', displayName: 'Elke', balance: 20 }),
      makeMember({ id: 'arthur', displayName: 'Arthur', balance: 20 }),
      makeMember({ id: 'luise', displayName: 'Luise', balance: 8 }),
    ],
  },
};

/** Dreifach-Gleichstand auf Platz 1 — Silber und Bronze werden beide übersprungen, die/der Nächste ist Platz 4. */
export const ThreeWayTie: Story = {
  args: {
    members: [
      makeMember({ id: 'elke', displayName: 'Elke', balance: 20 }),
      makeMember({ id: 'arthur', displayName: 'Arthur', balance: 20 }),
      makeMember({ id: 'luise', displayName: 'Luise', balance: 20 }),
      makeMember({ id: 'hannes', displayName: 'Hannes', balance: 3 }),
    ],
  },
};

/** Punktestand 0 scheint gar nicht auf; ein negativer Punktestand bleibt sichtbar (bewusst kein Filter dafür). */
export const ZeroExcludedNegativeShown: Story = {
  args: {
    members: [
      makeMember({ id: 'elke', displayName: 'Elke', balance: 12 }),
      makeMember({ id: 'arthur', displayName: 'Arthur', balance: 0 }),
      makeMember({ id: 'luise', displayName: 'Luise', balance: -4 }),
    ],
  },
};

/** Niemand hat Punkte über 0 — zeigt den Hinweistext statt einer leeren Liste. */
export const Empty: Story = {
  args: {
    members: [makeMember({ balance: 0 })],
  },
};
