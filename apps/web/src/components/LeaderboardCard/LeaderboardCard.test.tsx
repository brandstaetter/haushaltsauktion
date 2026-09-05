import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MemberDto } from '@haushaltsauktion/shared';
import { LeaderboardCard } from './LeaderboardCard';

function memberFixture(overrides: Partial<MemberDto> = {}): MemberDto {
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

describe('LeaderboardCard', () => {
  it('zeigt die Überschrift "Rangliste" und die Mitglieder aus der Leaderboard', () => {
    render(
      <LeaderboardCard
        members={[
          memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
          memberFixture({ id: 'p', displayName: 'Paul', balance: 5 }),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Rangliste' })).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Paul')).toBeInTheDocument();
  });

  it('zeigt Überschrift und Hinweistext, wenn niemand über 0 Punkten liegt', () => {
    render(<LeaderboardCard members={[memberFixture({ balance: 0 })]} />);
    expect(screen.getByRole('heading', { name: 'Rangliste' })).toBeInTheDocument();
    expect(screen.getByText('Keine Punkte bisher vergeben...')).toBeInTheDocument();
  });
});
