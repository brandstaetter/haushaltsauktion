import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskInstanceDetailDto } from '@haushaltsauktion/shared';
import { de } from '../../strings/de';
import { interpolate } from '../../utils/format';
import { TaskDetailPage } from './TaskDetailPage';

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

import { api, ApiError } from '../../api/client';

const mockedApi = vi.mocked(api);

function taskFixture(overrides: Partial<TaskInstanceDetailDto> = {}): TaskInstanceDetailDto {
  return {
    id: 'inst-1',
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
    status: 'ASSIGNED',
    canVolunteer: false,
    ineligibleReason: null,
    potentialReward: 6,
    workerCountMode: 'EXACTLY',
    workerCount: 1,
    activeSlotCount: 1,
    viewerHasActiveSlot: false,
    taskDefinitionId: 'def-1',
    scheduledFor: '2026-09-04T00:00:00.000Z',
    publishedAt: '2026-09-04T00:00:00.000Z',
    completedAt: null,
    completedBy: null,
    activeAssignment: null,
    activeAssignments: [],
    ...overrides,
  };
}

function memberFixture(overrides: Partial<MemberDto> = {}): MemberDto {
  return {
    id: 'mem-me',
    displayName: 'Elke',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    balance: 10,
    maxRandomAssignmentsPerWeek: null,
    ...overrides,
  };
}

function renderPage(instanceId = 'inst-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[`/aufgaben/${instanceId}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/aufgaben/:id" element={<TaskDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TaskDetailPage', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('EXACTLY(1): zeigt "Dir zugewiesen" und Erledigen/Freikauf/Zurückgeben für die eigene Zuweisung', async () => {
    const task = taskFixture({
      activeAssignment: {
        id: 'asg-me',
        memberId: 'mem-me',
        kind: 'VOLUNTARY',
        response: 'ACCEPTED',
        assignedAt: '2026-09-04T00:00:00.000Z',
        valueAtAssignment: 6,
        rewardOnCompletion: 6,
        buyoutQuote: null,
      },
      activeAssignments: [
        {
          id: 'asg-me',
          memberId: 'mem-me',
          kind: 'VOLUNTARY',
          response: 'ACCEPTED',
          assignedAt: '2026-09-04T00:00:00.000Z',
          valueAtAssignment: 6,
          rewardOnCompletion: 6,
          buyoutQuote: null,
        },
      ],
    });

    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/tasks/inst-1') return task;
      if (path === '/members/me') return memberFixture();
      if (path === '/members') return { items: [memberFixture()] };
      if (path === '/assignments/asg-me/buyout-quote') {
        return {
          assignmentId: 'asg-me',
          allowed: false,
          disallowedReason: 'BUYOUT_DISABLED_FOR_TASK',
          cost: 9,
          balanceBefore: 10,
          balanceAfter: 1,
          taskValueBefore: 6,
          taskValueAfter: 9,
          costStrategy: 'CURRENT_TASK_VALUE',
          valueIncreaseStrategy: 'MULTIPLIER',
          buyoutsUsedThisWeek: 0,
          buyoutsAllowedThisWeek: null,
          configVersion: 1,
        };
      }
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(screen.getByText(de.task.assignedYou)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.action.complete })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.action.release })).toBeInTheDocument();
    // No admin action for an ordinary member.
    expect(screen.queryByText(de.task.adminUnassign.trigger)).not.toBeInTheDocument();
  });

  it('Multi-Worker: listet jede aktive Zuweisung mit Namen und erlaubt der Admin, gezielt eine aufzuheben', async () => {
    const assignments: TaskInstanceDetailDto['activeAssignments'] = [
      {
        id: 'asg-me',
        memberId: 'mem-me',
        kind: 'VOLUNTARY',
        response: 'ACCEPTED',
        assignedAt: '2026-09-04T00:00:00.000Z',
        valueAtAssignment: 6,
        rewardOnCompletion: 6,
        buyoutQuote: null,
      },
      {
        id: 'asg-paul',
        memberId: 'mem-paul',
        kind: 'VOLUNTARY',
        response: 'ACCEPTED',
        assignedAt: '2026-09-04T00:00:00.000Z',
        valueAtAssignment: 6,
        rewardOnCompletion: 6,
        buyoutQuote: null,
      },
    ];
    const task = taskFixture({
      workerCountMode: 'AT_LEAST',
      workerCount: 2,
      activeSlotCount: 2,
      activeAssignment: assignments[0],
      activeAssignments: assignments,
    });

    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? 'GET';
      if (path === '/tasks/inst-1') return task;
      if (path === '/members/me') return memberFixture({ role: 'ADMIN' });
      if (path === '/members') {
        return { items: [memberFixture({ role: 'ADMIN' }), memberFixture({ id: 'mem-paul', displayName: 'Paul' })] };
      }
      if (path === '/assignments/asg-me/buyout-quote') {
        return {
          assignmentId: 'asg-me',
          allowed: false,
          disallowedReason: 'BUYOUT_DISABLED_FOR_TASK',
          cost: 9,
          balanceBefore: 10,
          balanceAfter: 1,
          taskValueBefore: 6,
          taskValueAfter: 9,
          costStrategy: 'CURRENT_TASK_VALUE',
          valueIncreaseStrategy: 'MULTIPLIER',
          buyoutsUsedThisWeek: 0,
          buyoutsAllowedThisWeek: null,
          configVersion: 1,
        };
      }
      if (path === '/admin/instances/inst-1/revoke-assignment' && method === 'POST') {
        return { instanceId: 'inst-1', status: 'ASSIGNED', currentValue: 6, clawedBack: 0 };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    // Slot occupancy for a multi-worker task, folded into the "Zugewiesen" heading itself.
    expect(
      screen.getByText(
        `Zugewiesen ${interpolate(de.task.slotsOccupied, { occupied: 2, total: 2 })}`,
      ),
    ).toBeInTheDocument();
    // My own row.
    expect(screen.getByText(de.task.assignedYou)).toBeInTheDocument();
    // Co-assignee's row, named (unlike the single-slot "Jemandem sonst" case).
    expect(
      screen.getByText(interpolate(de.task.assignedNamed, { name: 'Paul' })),
    ).toBeInTheDocument();

    // An admin sees one "Zuweisung aufheben" trigger per active slot.
    const triggers = screen.getAllByText(de.task.adminUnassign.trigger);
    expect(triggers).toHaveLength(2);

    // Clicking Paul's row and confirming must target Paul's assignment
    // specifically — the admin endpoint can now disambiguate by
    // `assignmentId`, so the co-assignee's own slot (`asg-me`) must never be
    // touched.
    await user.click(triggers[1]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: de.task.adminUnassign.confirm }));

    await waitFor(() => {
      const revokeCall = mockedApi.mock.calls.find(
        ([path, options]) =>
          path === '/admin/instances/inst-1/revoke-assignment' &&
          (options as { method?: string } | undefined)?.method === 'POST',
      );
      expect(revokeCall).toBeDefined();
      expect((revokeCall?.[1] as { body?: { assignmentId?: string } })?.body?.assignmentId).toBe(
        'asg-paul',
      );
    });
  });

  it('AT_LEAST mit freiem Slot: zeigt "Freiwillig übernehmen" für einen Betrachter, der die Aufgabe noch nicht hält, obwohl status bereits ASSIGNED ist', async () => {
    const task = taskFixture({
      status: 'ASSIGNED',
      workerCountMode: 'AT_LEAST',
      workerCount: 1,
      activeSlotCount: 1,
      canVolunteer: true,
      activeAssignment: {
        id: 'asg-anna',
        memberId: 'mem-anna',
        kind: 'VOLUNTARY',
        response: 'ACCEPTED',
        assignedAt: '2026-09-04T00:00:00.000Z',
        valueAtAssignment: 6,
        rewardOnCompletion: 6,
        buyoutQuote: null,
      },
      activeAssignments: [
        {
          id: 'asg-anna',
          memberId: 'mem-anna',
          kind: 'VOLUNTARY',
          response: 'ACCEPTED',
          assignedAt: '2026-09-04T00:00:00.000Z',
          valueAtAssignment: 6,
          rewardOnCompletion: 6,
          buyoutQuote: null,
        },
      ],
    });

    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/tasks/inst-1') return task;
      if (path === '/members/me') return memberFixture();
      if (path === '/members') return { items: [memberFixture(), memberFixture({ id: 'mem-anna', displayName: 'Anna' })] };
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: de.action.volunteer })).toBeInTheDocument();
    // Not the current viewer's slot, so no "Erledigen"/"Zurückgeben" for them.
    expect(screen.queryByRole('button', { name: de.action.complete })).not.toBeInTheDocument();
  });

  it('Multi-Worker: nach 409 STALE_VIEW (die andere Person hat gerade ihren Slot erledigt) wird die Ansicht neu geladen und der zweite Versuch klappt', async () => {
    const meAssignment: TaskInstanceDetailDto['activeAssignments'][number] = {
      id: 'asg-me',
      memberId: 'mem-me',
      kind: 'VOLUNTARY',
      response: 'ACCEPTED',
      assignedAt: '2026-09-04T00:00:00.000Z',
      valueAtAssignment: 6,
      rewardOnCompletion: 6,
      buyoutQuote: null,
    };
    const paulAssignment: TaskInstanceDetailDto['activeAssignments'][number] = {
      id: 'asg-paul',
      memberId: 'mem-paul',
      kind: 'VOLUNTARY',
      response: 'ACCEPTED',
      assignedAt: '2026-09-04T00:00:00.000Z',
      valueAtAssignment: 6,
      rewardOnCompletion: 6,
      buyoutQuote: null,
    };
    // Before Paul's completion: both slots active, version 1. Paul completing
    // concurrently bumps the instance to version 2 and drops his own now-
    // COMPLETED assignment out of `activeAssignments` (only `status: 'ACTIVE'`
    // rows are included, per `taskDto.ts`'s `INSTANCE_INCLUDE`) — this is what
    // a refetch after his completion actually returns.
    const beforePaulCompletes = taskFixture({
      version: 1,
      workerCountMode: 'EXACTLY',
      workerCount: 2,
      activeSlotCount: 2,
      activeAssignment: meAssignment,
      activeAssignments: [meAssignment, paulAssignment],
    });
    const afterPaulCompletes = taskFixture({
      version: 2,
      workerCountMode: 'EXACTLY',
      workerCount: 2,
      activeSlotCount: 1,
      activeAssignment: meAssignment,
      activeAssignments: [meAssignment],
    });

    let taskFetches = 0;
    let completeAttempts = 0;
    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? 'GET';
      if (path === '/tasks/inst-1' && method === 'GET') {
        taskFetches += 1;
        return taskFetches === 1 ? beforePaulCompletes : afterPaulCompletes;
      }
      if (path === '/members/me') return memberFixture();
      if (path === '/members') {
        return { items: [memberFixture(), memberFixture({ id: 'mem-paul', displayName: 'Paul' })] };
      }
      if (path === '/assignments/asg-me/buyout-quote') {
        return {
          assignmentId: 'asg-me',
          allowed: false,
          disallowedReason: 'NOT_RANDOM_ASSIGNMENT',
          cost: 6,
          balanceBefore: 10,
          balanceAfter: 4,
          taskValueBefore: 6,
          taskValueAfter: 9,
          costStrategy: 'CURRENT_TASK_VALUE',
          valueIncreaseStrategy: 'MULTIPLIER',
          buyoutsUsedThisWeek: 0,
          buyoutsAllowedThisWeek: null,
          configVersion: 1,
        };
      }
      if (path === '/tasks/inst-1/complete' && method === 'POST') {
        completeAttempts += 1;
        // First attempt still carries `expectedVersion: 1` (read from the
        // stale `beforePaulCompletes` fetch) — Paul's own completion already
        // moved the instance to version 2 server-side by the time this
        // request lands, so it is rejected exactly like the real endpoint
        // rejects a stale `expectedVersion` (`completeTask.ts`).
        if (completeAttempts === 1) {
          throw new ApiError(409, {
            error: { code: 'STALE_VIEW', message: 'Die Ansicht ist nicht mehr aktuell.' },
          });
        }
        return {
          instance: afterPaulCompletes,
          pointsAwarded: 6,
          transaction: null,
          balanceAfter: 16,
          valueResetFrom: 6,
          valueResetTo: 6,
        };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(await screen.findByText(interpolate(de.task.assignedNamed, { name: 'Paul' }))).toBeInTheDocument();
    const completeButton = await screen.findByRole('button', { name: de.action.complete });

    await user.click(completeButton);
    // The failed attempt surfaces feedback instead of silently doing nothing.
    await screen.findByText('Die Ansicht ist nicht mehr aktuell.');

    // The failure must have invalidated `['tasks', 'inst-1']` so the page
    // re-fetches and actually re-renders with the fresh data — without that,
    // this member would resubmit the exact same stale `expectedVersion`
    // forever and could never complete via the UI. Paul's row disappearing
    // (his own completion closed his assignment, so a refetch no longer
    // includes it) is the real signal that the new data landed, not just
    // that a refetch was *requested*.
    await waitFor(() =>
      expect(
        screen.queryByText(interpolate(de.task.assignedNamed, { name: 'Paul' })),
      ).not.toBeInTheDocument(),
    );

    // Retrying now succeeds, sending the refetched `task.version` (2) —
    // proving the retry used fresh data rather than repeating the same
    // rejected request.
    await user.click(screen.getByRole('button', { name: de.action.complete }));
    await waitFor(() => expect(completeAttempts).toBe(2));
    await screen.findByText('OK');

    const secondAttempt = mockedApi.mock.calls.filter(
      ([path, options]) =>
        path === '/tasks/inst-1/complete' &&
        (options as { method?: string } | undefined)?.method === 'POST',
    )[1];
    expect((secondAttempt?.[1] as { body?: { expectedVersion?: number } })?.body?.expectedVersion).toBe(2);
  });
});
