import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import type { AdminAuditEventDto } from '../../api/types';
import { AuditLogSection } from './AuditLogSection';

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

function eventFixture(overrides: Partial<AdminAuditEventDto> = {}): AdminAuditEventDto {
  return {
    id: 'audit-1',
    seq: '1',
    actorType: 'ADMIN',
    actorMemberId: 'mem-elke',
    actor: { id: 'mem-elke', displayName: 'Elke' },
    action: 'POINTS_ADJUSTED',
    entityType: 'HouseholdMember',
    entityId: 'mem-paul',
    payload: { amount: 5, reason: 'Vorab erledigt', transactionId: 'tx-1', balanceAfter: 15 },
    createdAt: '2026-09-04T12:00:00.000Z',
    ...overrides,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogSection />
    </QueryClientProvider>,
  );
}

describe('AuditLogSection', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it(
    'zeigt eine manuelle Punkteanpassung mit deutscher Aktion, Admin, Betrag und Begründung — nicht als rohes Enum',
    async () => {
      mockedApi.mockImplementation(async (path: string) => {
        if (path.startsWith('/admin/audit-events')) return { items: [eventFixture()] };
        throw new Error(`unerwarteter Aufruf: ${path}`);
      });

      renderSection();

      // The action label ("Punkte manuell angepasst") also appears as a
      // filter-dropdown <option> that is always present, even while loading
      // — waiting on it would resolve before the query ever settles. "Elke"
      // only ever comes from the loaded row, so it's the real load signal.
      await screen.findByText('Elke');
      const list = screen.getByRole('list');
      expect(within(list).getByText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeInTheDocument();
      expect(screen.queryByText(/^POINTS_ADJUSTED$/)).toBeNull();
      expect(within(list).getByText('Betrag +5')).toBeInTheDocument();
      expect(within(list).getByText('Begründung: Vorab erledigt')).toBeInTheDocument();
    },
  );

  it('zeigt "System" als Akteur für systemgenerierte Einträge', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/audit-events')) {
        return {
          items: [
            eventFixture({
              action: 'ASSIGNMENT_SWEEP_RUN',
              actorType: 'SYSTEM',
              actor: null,
              actorMemberId: null,
              payload: {},
            }),
          ],
        };
      }
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderSection();

    // Same reasoning as above: wait on the unambiguous, loaded-only text.
    await screen.findByText(de.admin.auditLog.actorSystem);
    const list = screen.getByRole('list');
    expect(within(list).getByText(de.admin.auditLog.actions.ASSIGNMENT_SWEEP_RUN)).toBeInTheDocument();
  });

  it('zeigt den Leerzustand, wenn es noch keine Einträge gibt', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/audit-events')) return { items: [] };
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderSection();

    expect(await screen.findByText(de.admin.auditLog.empty)).toBeInTheDocument();
  });

  it('fragt beim Filtern nach Aktion den gewählten Aktionstyp ab', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    mockedApi.mockImplementation(async (path: string) => {
      calls.push(path);
      if (path.startsWith('/admin/audit-events')) return { items: [eventFixture()] };
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderSection();
    await screen.findByText(de.admin.auditLog.actions.POINTS_ADJUSTED);

    await user.selectOptions(
      screen.getByLabelText(de.admin.auditLog.filterLabel),
      de.admin.auditLog.actions.POINTS_ADJUSTED,
    );

    expect(calls.some((c) => c.includes('action=POINTS_ADJUSTED'))).toBe(true);
  });
});
