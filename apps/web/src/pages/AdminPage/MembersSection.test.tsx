import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import type { AdminMemberDto } from '../../api/types';
import { MembersSection } from './MembersSection';

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

/** Ein Mitglied, wie `GET /admin/members` es liefert. */
function memberFixture(overrides: Partial<AdminMemberDto> = {}): AdminMemberDto {
  return {
    id: 'member-1',
    displayName: 'Anna',
    avatarUrl: null,
    role: 'ADMIN',
    isActive: true,
    pointsCache: 10,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'anna@demo.local', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
    ...overrides,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersSection />
    </QueryClientProvider>,
  );
}

describe('MembersSection', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt ein neu angelegtes Mitglied in der Liste, ohne dass die Seite neu lädt', async () => {
    const user = userEvent.setup();
    let members: AdminMemberDto[] = [memberFixture()];

    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: members };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === '/admin/members' && options?.method === 'POST') {
        const body = options.body as { email: string; displayName: string; role?: string };
        const created = memberFixture({
          id: 'member-2',
          displayName: body.displayName,
          role: (body.role as AdminMemberDto['role']) ?? 'MEMBER',
          isActive: true,
          pointsCache: 0,
          user: { email: body.email, isActive: true },
        });
        members = [...members, created];
        return { id: created.id };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText('Paul')).toBeNull();

    await user.click(screen.getByRole('button', { name: de.admin.members.addButton }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.members.email), 'paul@demo.local');
    await user.type(within(dialog).getByLabelText(de.admin.members.displayName), 'Paul');
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.create }));

    expect(await screen.findByText('Paul')).toBeInTheDocument();
  });

  it('zeigt das generierte Passwort an, wenn ein Mitglied ohne Passwort angelegt wird', async () => {
    const user = userEvent.setup();
    let members: AdminMemberDto[] = [memberFixture()];

    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: members };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === '/admin/members' && options?.method === 'POST') {
        const body = options.body as { email: string; displayName: string; role?: string };
        const created = memberFixture({
          id: 'member-2',
          displayName: body.displayName,
          role: (body.role as AdminMemberDto['role']) ?? 'MEMBER',
          isActive: true,
          pointsCache: 0,
          user: { email: body.email, isActive: true },
        });
        members = [...members, created];
        return { id: created.id, temporaryPassword: 'generated-secret-pw' };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    await user.click(screen.getByRole('button', { name: de.admin.members.addButton }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.members.email), 'paul@demo.local');
    await user.type(within(dialog).getByLabelText(de.admin.members.displayName), 'Paul');
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.create }));

    expect(await screen.findByText('generated-secret-pw')).toBeInTheDocument();
  });

  it('erlaubt einem Admin, ein neues Passwort für ein Mitglied zu vergeben', async () => {
    const user = userEvent.setup();
    const member = memberFixture();

    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [member] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === `/admin/members/${member.id}/reset-password` && options?.method === 'POST') {
        return { id: member.id, temporaryPassword: 'reset-secret-pw' };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.admin.members.resetPasswordButton }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.resetPasswordConfirm }));

    expect(await screen.findByText('reset-secret-pw')).toBeInTheDocument();
  });

  it('zeigt die LAST_ADMIN-Meldung, wenn der letzte Admin degradiert werden soll', async () => {
    const user = userEvent.setup();
    const member = memberFixture({ role: 'ADMIN', isActive: true });

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [member] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === `/admin/members/${member.id}` && options?.method === 'PATCH') {
        throw Object.assign(new Error('Der letzte Admin kann nicht entfernt werden.'), {
          status: 422,
          code: 'LAST_ADMIN',
        });
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();

    const roleSelect = screen.getByLabelText(de.admin.members.role) as HTMLSelectElement;
    await user.selectOptions(roleSelect, de.admin.members.roleValues.MEMBER);
    await user.click(screen.getByRole('button', { name: de.admin.members.save }));

    expect(await screen.findByRole('alert')).toHaveTextContent(de.admin.members.errors.lastAdmin);
  });

  it('erlaubt einem Admin, Punkte mit Begründung anzupassen, und aktualisiert den Punktestand ohne Reload', async () => {
    const user = userEvent.setup();
    let member = memberFixture({ pointsCache: 10 });

    mockedApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [member] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === `/admin/members/${member.id}/points/adjust` && options?.method === 'POST') {
        const body = options.body as { amount: number; reason: string };
        member = { ...member, pointsCache: member.pointsCache + body.amount };
        return { id: 'tx-1', amount: body.amount, balanceAfter: member.pointsCache };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.admin.members.adjustPointsButton }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.members.adjustAmountLabel, { exact: false }), '5');
    await user.type(
      within(dialog).getByLabelText(de.admin.members.adjustReasonLabel),
      'Vorab erledigt, keine Aufgabe dafür',
    );
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.adjustSubmit }));

    expect(await screen.findByText(de.admin.members.adjustSuccess)).toBeInTheDocument();
    expect(await screen.findByText('15')).toBeInTheDocument();
  });

  it('lehnt eine Punkteanpassung ohne Begründung ab, ohne die API aufzurufen', async () => {
    const user = userEvent.setup();
    const member = memberFixture();

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [member] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.admin.members.adjustPointsButton }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.members.adjustAmountLabel, { exact: false }), '5');
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.adjustSubmit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(de.admin.members.errors.reasonRequired);
    expect(mockedApi).not.toHaveBeenCalledWith(
      `/admin/members/${member.id}/points/adjust`,
      expect.anything(),
    );
  });

  it('zeigt eine spezifische Meldung, wenn der Server die Anpassung als Validierungsfehler ablehnt', async () => {
    const user = userEvent.setup();
    const member = memberFixture();

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [member] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      if (path === `/admin/members/${member.id}/points/adjust` && options?.method === 'POST') {
        throw Object.assign(new Error('Der Betrag muss eine ganze Zahl ungleich 0 sein.'), {
          status: 422,
          code: 'VALIDATION_FAILED',
          details: { fieldErrors: [{ path: 'amount', message: 'Ganzzahl ungleich 0 erforderlich.' }] },
        });
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.admin.members.adjustPointsButton }));

    // Amount and reason both pass client-side validation, so the mocked
    // VALIDATION_FAILED / fieldErrors response below is what actually drives
    // the displayed message — proving the server-error path independently
    // of the client's own pre-check.
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.members.adjustAmountLabel, { exact: false }), '5');
    await user.type(within(dialog).getByLabelText(de.admin.members.adjustReasonLabel), 'Test');
    await user.click(within(dialog).getByRole('button', { name: de.admin.members.adjustSubmit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(de.admin.members.errors.invalidAmount);
  });

  it('filtert die Mitgliederliste nach Anzeigename oder E-Mail und zeigt einen eigenen Leerzustand', async () => {
    const user = userEvent.setup();
    const anna = memberFixture({ id: 'member-1', displayName: 'Anna', user: { email: 'anna@demo.local', isActive: true } });
    const paul = memberFixture({ id: 'member-2', displayName: 'Paul', user: { email: 'paul@example.org', isActive: true } });

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/members' && (options?.method ?? 'GET') === 'GET') {
        return { items: [anna, paul] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/task-definitions') return { items: [] };
      throw new Error(`unerwarteter Aufruf: ${path} ${options?.method ?? 'GET'}`);
    });

    renderSection();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Paul')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(de.admin.members.filterPlaceholder), 'example.org');

    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.getByText('Paul')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(de.admin.members.filterPlaceholder));
    await user.type(screen.getByPlaceholderText(de.admin.members.filterPlaceholder), 'nichts passt');

    expect(await screen.findByText(de.admin.members.filterEmpty)).toBeInTheDocument();
  });
});
