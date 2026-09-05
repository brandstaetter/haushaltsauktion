import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    workerCountMode: 'EXACTLY',
    workerCount: 1,
    activeSlotCount: 0,
    viewerHasActiveSlot: false,
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

  it('zeigt "N/M" für eine Multi-Worker-Aufgabe', () => {
    render(<TaskCard task={taskFixture({ workerCount: 3, activeSlotCount: 2 })} />);
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });

  it('zeigt keine Belegungsanzeige für workerCount === 1 (Standardfall)', () => {
    render(<TaskCard task={taskFixture({ workerCount: 1, activeSlotCount: 1 })} />);
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });

  it('bietet "Mithelfen" für eine ASSIGNED Multi-Worker-Aufgabe mit freiem Slot, die der Viewer noch nicht hält', () => {
    const onAction = vi.fn();
    render(
      <TaskCard
        task={taskFixture({
          status: 'ASSIGNED',
          workerCount: 2,
          activeSlotCount: 1,
          canVolunteer: true,
          viewerHasActiveSlot: false,
        })}
        onAction={onAction}
      />,
    );
    const button = screen.getByRole('button', { name: 'Mithelfen' });
    expect(button).not.toBeDisabled();
  });

  it('bietet "Freiwillig übernehmen" für eine frische Multi-Worker-Aufgabe ohne bisherige Zusage', () => {
    render(
      <TaskCard
        task={taskFixture({ workerCount: 2, activeSlotCount: 0, canVolunteer: true })}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Freiwillig übernehmen' })).toBeInTheDocument();
  });

  it('bietet "Öffnen" für eine ASSIGNED-Aufgabe, deren Slot der Viewer selbst hält', () => {
    const onAction = vi.fn();
    render(
      <TaskCard
        task={taskFixture({
          status: 'ASSIGNED',
          canVolunteer: false,
          viewerHasActiveSlot: true,
        })}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('button', { name: 'Öffnen' })).toBeInTheDocument();
  });
});
