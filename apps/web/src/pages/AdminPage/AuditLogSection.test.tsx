import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function mockApiWithEvents(events: AdminAuditEventDto[], members: { id: string; displayName: string }[] = []) {
  mockedApi.mockImplementation(async (path: string) => {
    if (path.startsWith('/admin/audit-events')) return { items: events };
    if (path.startsWith('/members')) return { items: members };
    throw new Error(`unerwarteter Aufruf: ${path}`);
  });
}

describe('AuditLogSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    mockedApi.mockReset();
  });

  it(
    'zeigt eine manuelle Punkteanpassung mit deutscher Aktion, Admin, Betrag und Begründung — nicht als rohes Enum',
    async () => {
      mockApiWithEvents([eventFixture()], [{ id: 'mem-elke', displayName: 'Elke' }]);

      renderSection();

      // The action label ("Punkte manuell angepasst") also appears as a
      // filter checkbox that is always present, even while loading — waiting
      // on it would resolve before the query ever settles. "Elke" only ever
      // comes from the loaded row, so it's the real load signal.
      await screen.findAllByText('Elke');
      const list = screen.getByRole('list');
      expect(within(list).getByText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeInTheDocument();
      expect(screen.queryByText(/^POINTS_ADJUSTED$/)).toBeNull();
      expect(within(list).getByText('Betrag +5')).toBeInTheDocument();
      expect(within(list).getByText('Begründung: Vorab erledigt')).toBeInTheDocument();
    },
  );

  it('zeigt "System" als Akteur für systemgenerierte Einträge', async () => {
    mockApiWithEvents([
      eventFixture({
        action: 'ASSIGNMENT_SWEEP_RUN',
        actorType: 'SYSTEM',
        actor: null,
        actorMemberId: null,
        payload: {},
      }),
    ]);

    renderSection();

    const list = await screen.findByRole('list');
    expect(within(list).getByText(de.admin.auditLog.actorSystem)).toBeInTheDocument();
    expect(within(list).getByText(de.admin.auditLog.actions.ASSIGNMENT_SWEEP_RUN)).toBeInTheDocument();
  });

  it('zeigt den Leerzustand, wenn es noch keine Einträge gibt', async () => {
    mockApiWithEvents([]);

    renderSection();

    expect(await screen.findByText(de.admin.auditLog.empty)).toBeInTheDocument();
  });

  it('erlaubt die Auswahl mehrerer Aktionen gleichzeitig im Checkbox-Grid', async () => {
    const user = userEvent.setup();
    mockApiWithEvents([
      eventFixture({ id: 'e1', action: 'POINTS_ADJUSTED' }),
      eventFixture({ id: 'e2', action: 'ROLE_CHANGED' }),
      eventFixture({ id: 'e3', action: 'MEMBER_UPDATED' }),
    ]);

    renderSection();
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);

    await user.click(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED));
    await user.click(screen.getByLabelText(de.admin.auditLog.actions.ROLE_CHANGED));

    // Both checked actions show, the unchecked third one is filtered out —
    // proving multiple simultaneous selections work, unlike the old single-select dropdown.
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeChecked();
    expect(screen.getByLabelText(de.admin.auditLog.actions.ROLE_CHANGED)).toBeChecked();
    expect(screen.getByLabelText(de.admin.auditLog.actions.MEMBER_UPDATED)).not.toBeChecked();
  });

  it('"Alle auswählen" markiert jede Aktion, "Keine auswählen" leert die Auswahl wieder', async () => {
    const user = userEvent.setup();
    mockApiWithEvents([eventFixture()]);

    renderSection();
    await screen.findByRole('list');

    await user.click(screen.getByText(de.admin.auditLog.selectAll));
    expect(screen.getByLabelText(de.admin.auditLog.actions.ROLE_CHANGED)).toBeChecked();
    expect(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeChecked();

    await user.click(screen.getByText(de.admin.auditLog.selectNone));
    expect(screen.getByLabelText(de.admin.auditLog.actions.ROLE_CHANGED)).not.toBeChecked();
    expect(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED)).not.toBeChecked();
  });

  it('filtert nach ausgewähltem Akteur (Mitglied)', async () => {
    const user = userEvent.setup();
    mockApiWithEvents(
      [
        eventFixture({ id: 'e1', actorMemberId: 'mem-elke', actor: { id: 'mem-elke', displayName: 'Elke' } }),
        eventFixture({
          id: 'e2',
          action: 'ROLE_CHANGED',
          actorMemberId: 'mem-paul',
          actor: { id: 'mem-paul', displayName: 'Paul' },
        }),
      ],
      [
        { id: 'mem-elke', displayName: 'Elke' },
        { id: 'mem-paul', displayName: 'Paul' },
      ],
    );

    renderSection();
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByLabelText('Paul'));

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('list')).getByText('Paul')).toBeInTheDocument();
  });

  it('merkt sich die Filterauswahl über einen Reload hinweg (localStorage)', async () => {
    const user = userEvent.setup();
    mockApiWithEvents([eventFixture()]);

    const { unmount } = renderSection();
    await screen.findByRole('list');
    await user.click(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED));
    expect(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeChecked();
    unmount();

    renderSection();
    await screen.findByRole('list');
    expect(screen.getByLabelText(de.admin.auditLog.actions.POINTS_ADJUSTED)).toBeChecked();
  });
});
