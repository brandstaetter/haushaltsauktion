import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MemberDto } from '@haushaltsauktion/shared';
import { Leaderboard, rankMembers } from './Leaderboard';

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

describe('rankMembers', () => {
  it('vergibt Gold/Silber/Bronze an die ersten drei unterschiedlichen Punktestände', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
      memberFixture({ id: 'p', displayName: 'Paul', balance: 8 }),
      memberFixture({ id: 'm', displayName: 'Maria', balance: 5 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('nummeriert ab Platz 4 durch', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', balance: 10 }),
      memberFixture({ id: 'p', balance: 8 }),
      memberFixture({ id: 'm', balance: 5 }),
      memberFixture({ id: 'h', balance: 3 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('vergibt bei Gleichstand auf Platz 1 die Goldmedaille mehrfach und überspringt Silber', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
      memberFixture({ id: 'p', displayName: 'Paul', balance: 10 }),
      memberFixture({ id: 'm', displayName: 'Maria', balance: 5 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('überspringt bei einem Dreifach-Gleichstand auf Platz 1 sowohl Silber als auch Bronze', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', balance: 10 }),
      memberFixture({ id: 'p', balance: 10 }),
      memberFixture({ id: 'm', balance: 10 }),
      memberFixture({ id: 'h', balance: 3 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it('lässt Mitglieder mit genau 0 Punkten aus', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
      memberFixture({ id: 'z', displayName: 'Zero', balance: 0 }),
    ]);
    expect(ranked.map((r) => r.member.id)).toEqual(['a']);
  });

  it('behält Mitglieder mit negativem Punktestand', () => {
    const ranked = rankMembers([
      memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
      memberFixture({ id: 'n', displayName: 'Negativ', balance: -3 }),
    ]);
    expect(ranked.map((r) => r.member.id)).toEqual(['a', 'n']);
    expect(ranked[1].rank).toBe(2);
  });
});

describe('Leaderboard', () => {
  it('zeigt einen Hinweistext statt einer Liste, wenn niemand mehr als 0 Punkte hat', () => {
    render(<Leaderboard members={[memberFixture({ balance: 0 })]} />);
    expect(screen.getByText('Keine Punkte bisher vergeben...')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('zeigt Medaillen-Emoji für die ersten drei Plätze und Zahlen danach', () => {
    render(
      <Leaderboard
        members={[
          memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
          memberFixture({ id: 'p', displayName: 'Paul', balance: 8 }),
          memberFixture({ id: 'm', displayName: 'Maria', balance: 5 }),
          memberFixture({ id: 'h', displayName: 'Hannes', balance: 3 }),
        ]}
      />,
    );
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
    expect(screen.getByText('4.')).toBeInTheDocument();
  });

  it('gibt jeder Zeile einen barrierefreien Namen mit Platz, Name und Punkten', () => {
    render(<Leaderboard members={[memberFixture({ displayName: 'Anna', balance: 10 })]} />);
    expect(
      screen.getByRole('listitem', { name: '1. Platz: Anna, 10 Punkte' }),
    ).toBeInTheDocument();
  });

  it('zeigt eine Krone nach dem Namen des/der Erstplatzierten, sonst nicht', () => {
    render(
      <Leaderboard
        members={[
          memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
          memberFixture({ id: 'p', displayName: 'Paul', balance: 8 }),
        ]}
      />,
    );
    expect(screen.getByRole('listitem', { name: /^1\. Platz: Anna/ }).textContent).toContain('👑');
    expect(screen.getByRole('listitem', { name: /^2\. Platz: Paul/ }).textContent).not.toContain('👑');
  });

  it('zeigt bei einem Gleichstand auf Platz 1 die Krone bei allen Erstplatzierten', () => {
    render(
      <Leaderboard
        members={[
          memberFixture({ id: 'a', displayName: 'Anna', balance: 10 }),
          memberFixture({ id: 'p', displayName: 'Paul', balance: 10 }),
        ]}
      />,
    );
    expect(screen.getByRole('listitem', { name: /^1\. Platz: Anna/ }).textContent).toContain('👑');
    expect(screen.getByRole('listitem', { name: /^1\. Platz: Paul/ }).textContent).toContain('👑');
  });
});
