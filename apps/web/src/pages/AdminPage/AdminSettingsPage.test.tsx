import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cloneDefaultConfig } from '@haushaltsauktion/shared';
import { de } from '../../strings/de';
import type { AdminConfigDto } from '../../api/types';
import { AdminSettingsPage } from './AdminSettingsPage';

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/verwaltung/einstellungen']}>
        <AdminSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminSettingsPage', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt nach dem Speichern die neue Version und den gespeicherten Todoist-Status, ohne dass die Seite neu geladen wird', async () => {
    const user = userEvent.setup();

    let current: AdminConfigDto = {
      version: 1,
      values: cloneDefaultConfig(),
      defaults: cloneDefaultConfig(),
      updatedAt: null,
      updatedBy: null,
    };

    mockedApi.mockImplementation(
      async (path: string, options?: { method?: string; body?: unknown }) => {
        const method = options?.method ?? 'GET';
        if (path === '/admin/config' && method === 'GET') {
          return current;
        }
        if (path === '/admin/config' && method === 'PUT') {
          const body = options?.body as {
            expectedVersion: number;
            values: AdminConfigDto['values'];
          };
          expect(body.expectedVersion).toBe(current.version);
          current = {
            ...current,
            version: current.version + 1,
            values: body.values,
            updatedBy: { id: 'admin-1', displayName: 'Elke' },
          };
          return { version: current.version, values: current.values, changeSummary: [] };
        }
        throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
      },
    );

    renderPage();

    expect(await screen.findByText(new RegExp(`^${de.admin.version} 1$`))).toBeInTheDocument();
    const checkbox = screen.getByLabelText(de.admin.fields.todoistEnabled) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: de.admin.save }));

    // The invalidated `adminConfigQueryKey` refetches automatically, so the
    // header version and checkbox reflect the post-save server response
    // without any remount — no page reload or navigation happens here.
    expect(await screen.findByText(new RegExp(`^${de.admin.version} 2 ·`))).toBeInTheDocument();
    expect((screen.getByLabelText(de.admin.fields.todoistEnabled) as HTMLInputElement).checked).toBe(
      true,
    );

    // A second save right after must not hit CONFIG_VERSION_CONFLICT: the
    // draft's expectedVersion has to be the freshly-refetched version 2, not
    // the stale version 1 the page originally mounted with.
    await user.click(screen.getByRole('button', { name: de.admin.save }));
    expect(await screen.findByText(new RegExp(`^${de.admin.version} 3 ·`))).toBeInTheDocument();
    expect(screen.queryByText(de.admin.saveFailed)).toBeNull();
  });
});
