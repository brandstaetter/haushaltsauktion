import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cloneDefaultConfig, toPublicConfig } from '@haushaltsauktion/shared';
import { de } from '../../strings/de';
import type { MemberDto } from '@haushaltsauktion/shared';
import type { PublicConfigDto, SessionDto } from '../../api/types';
import { AccountPage } from './AccountPage';

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

const member: MemberDto = {
  id: 'member-1',
  displayName: 'Anna',
  avatarUrl: null,
  role: 'MEMBER',
  isActive: true,
  balance: 12,
  maxRandomAssignmentsPerWeek: null,
};

const session: SessionDto = {
  user: { id: 'user-1', email: 'anna@demo.local', displayName: 'Anna' },
  member,
  household: { id: 'household-1', name: 'Demo Family', timezone: 'Europe/Vienna' },
  role: 'MEMBER',
  csrfToken: 'csrf-token',
};

/** Builds the real `{ version, values }` envelope GET /config/public returns. */
function publicConfigFixture(todoistEnabled: boolean): PublicConfigDto {
  const values = toPublicConfig({
    ...cloneDefaultConfig(),
    integrations: { todoist: { enabled: todoistEnabled, priority: null } },
  });
  return { version: 1, values };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/ich']}>
        <AccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AccountPage', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt den Todoist-Bereich, wenn der Haushalt die Integration aktiviert hat', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return session;
      if (path === '/members/me') return member;
      if (path === '/config/public') return publicConfigFixture(true);
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderPage();

    expect(await screen.findByText(de.todoist.title)).toBeInTheDocument();
  });

  it('zeigt keinen Todoist-Bereich, wenn der Haushalt die Integration nicht aktiviert hat', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return session;
      if (path === '/members/me') return member;
      if (path === '/config/public') return publicConfigFixture(false);
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderPage();

    expect(await screen.findByText(member.displayName)).toBeInTheDocument();
    expect(screen.queryByText(de.todoist.title)).toBeNull();
  });
});
