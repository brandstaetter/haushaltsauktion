import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AvailableTaskDto } from '@haushaltsauktion/shared';
import { TaskCard } from './TaskCard';

function taskFixture(overrides: Partial<AvailableTaskDto> = {}): AvailableTaskDto {
  return {
    id: 'task-1',
    version: 1,
    title: 'Bad putzen',
    description: null,
    category: null,
    currentValue: 6,
    baseValue: 6,
    buyoutCount: 0,
    estimatedMinutes: null,
    dueAt: null,
    isOverdue: false,
    offerExpiresAt: null,
    status: 'AVAILABLE',
    canVolunteer: true,
    ineligibleReason: null,
    potentialReward: 6,
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('zeigt ohne assignee-Prop keinen Zuweisungsträger (bestehende Nutzung bleibt unverändert)', () => {
    render(<TaskCard task={taskFixture()} />);
    expect(screen.queryByText(/^an /)).not.toBeInTheDocument();
  });

  it('zeigt mit assignee=null (AVAILABLE, householdweiter Tab) ebenfalls keinen Zuweisungsträger', () => {
    render(<TaskCard task={taskFixture()} assignee={null} />);
    expect(screen.queryByText(/^an /)).not.toBeInTheDocument();
  });

  it('zeigt Name und Art der Zuweisung, wenn assignee gesetzt ist', () => {
    render(
      <TaskCard
        task={taskFixture({ status: 'ASSIGNED' })}
        assignee={{ id: 'member-anna', displayName: 'Anna', avatarUrl: null, kind: 'RANDOM' }}
      />,
    );
    expect(screen.getByText(/an Anna/)).toBeInTheDocument();
    expect(screen.getByText(/zufällig/)).toBeInTheDocument();
  });

  it('unterscheidet freiwillig von zufällig zugewiesen', () => {
    render(
      <TaskCard
        task={taskFixture({ status: 'ASSIGNED' })}
        assignee={{ id: 'member-paul', displayName: 'Paul', avatarUrl: null, kind: 'VOLUNTARY' }}
      />,
    );
    expect(screen.getByText(/an Paul/)).toBeInTheDocument();
    expect(screen.getByText(/freiwillig/)).toBeInTheDocument();
  });
});
