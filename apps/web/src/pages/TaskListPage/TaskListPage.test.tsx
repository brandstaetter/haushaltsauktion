import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailableTaskDto, HouseholdTaskDto } from '@haushaltsauktion/shared';
import { de } from '../../strings/de';
import { TaskListPage } from './TaskListPage';

vi.mock('../../api/client', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, body?: { error?: { code?: string; message?: string } }) {
      super(body?.error?.message ?? `HTTP ${status}`);
      this.status = status;
      this.code = body?.error?.code ?? 'UNKNOWN';
      this.name = 'ApiError';
    }
  },
}));

import { api } from '../../api/client';

const mockedApi = vi.mocked(api);

function availableTaskFixture(overrides: Partial<AvailableTaskDto> = {}): AvailableTaskDto {
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

function householdTaskFixture(overrides: Partial<HouseholdTaskDto> = {}): HouseholdTaskDto {
  return {
    ...availableTaskFixture(),
    assignee: null,
    assignees: [],
    ...overrides,
  };
}

/** `GET /tasks/all` — every open instance in the household, other members included. */
const householdItems: HouseholdTaskDto[] = [
  householdTaskFixture({
    id: 'task-available',
    title: 'Müll hinausbringen',
    status: 'AVAILABLE',
    canVolunteer: true,
    assignee: null,
  }),
  householdTaskFixture({
    id: 'task-assigned-other',
    title: 'Bad putzen',
    status: 'ASSIGNED',
    canVolunteer: false,
    assignee: { id: 'member-anna', displayName: 'Anna', avatarUrl: null, kind: 'RANDOM' },
  }),
  householdTaskFixture({
    id: 'task-assigned-other-voluntary',
    title: 'Staubsaugen',
    status: 'ASSIGNED',
    canVolunteer: false,
    assignee: { id: 'member-paul', displayName: 'Paul', avatarUrl: null, kind: 'VOLUNTARY' },
  }),
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TaskListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TaskListPage — "Alle Aufgaben" tab', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('lädt die householdweite Liste über einen eigenen Endpunkt, nicht aus den anderen beiden Tabs', async () => {
    const user = userEvent.setup();

    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/tasks/available') return { items: [availableTaskFixture()] };
      if (path === '/tasks/assigned-to-me') return { items: [] };
      if (path === '/tasks/all') return { items: householdItems };
      throw new Error(`unerwarteter Pfad: ${path}`);
    });

    renderPage();

    // The two existing tabs stay exactly as they were.
    expect(screen.getByRole('tab', { name: de.dashboard.available })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: de.dashboard.myTasks })).toBeInTheDocument();

    const householdTab = screen.getByRole('tab', { name: de.task.allHouseholdTasksTab });
    await user.click(householdTab);

    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/tasks/all'));

    // Both an AVAILABLE task and ASSIGNED tasks belonging to *other* members show up.
    expect(await screen.findByText('Müll hinausbringen')).toBeInTheDocument();
    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(await screen.findByText('Staubsaugen')).toBeInTheDocument();

    // Each ASSIGNED card names the correct assignee and how they got it.
    expect(screen.getByText(/an Anna/)).toBeInTheDocument();
    expect(screen.getByText(/zufällig/)).toBeInTheDocument();
    expect(screen.getByText(/an Paul/)).toBeInTheDocument();
    expect(screen.getByText(/freiwillig/)).toBeInTheDocument();
  });

  it('zeigt für die AVAILABLE-Aufgabe im householdweiten Tab keinen Zuweisungsträger', async () => {
    const user = userEvent.setup();

    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/tasks/available') return { items: [] };
      if (path === '/tasks/assigned-to-me') return { items: [] };
      if (path === '/tasks/all') return { items: householdItems };
      throw new Error(`unerwarteter Pfad: ${path}`);
    });

    renderPage();
    await user.click(screen.getByRole('tab', { name: de.task.allHouseholdTasksTab }));

    const availableCard = (await screen.findByText('Müll hinausbringen')).closest('article');
    expect(availableCard).not.toBeNull();
    expect(availableCard).not.toHaveTextContent('an ');
  });

  it('lässt die "Freiwillig verfügbar"-Ansicht unverändert (weiterhin nur AVAILABLE, eigene Ansicht)', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/tasks/available') return { items: [availableTaskFixture({ title: 'Geschirrspüler' })] };
      if (path === '/tasks/assigned-to-me') return { items: [] };
      if (path === '/tasks/all') return { items: householdItems };
      throw new Error(`unerwarteter Pfad: ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Geschirrspüler')).toBeInTheDocument();
    // Only the two originally-fetched tabs render on first paint; the
    // household query still fires (react-query default), but its cards are
    // not shown until that tab is selected.
    expect(screen.queryByText('Bad putzen')).not.toBeInTheDocument();
  });
});
