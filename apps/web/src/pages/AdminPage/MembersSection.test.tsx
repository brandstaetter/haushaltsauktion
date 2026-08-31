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
});
