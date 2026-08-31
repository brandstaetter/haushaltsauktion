import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { interpolate } from '../../utils/format';
import type { AdminTaskDefinitionDto } from '../../api/types';
import { TaskDefinitionsSection } from './TaskDefinitionsSection';

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

/** Eine Aufgabendefinition, wie `GET /admin/task-definitions` sie liefert. */
function definitionFixture(overrides: Partial<AdminTaskDefinitionDto> = {}): AdminTaskDefinitionDto {
  return {
    id: 'def-1',
    title: 'Bad putzen',
    description: null,
    categoryId: null,
    category: null,
    baseValue: 6,
    estimatedMinutes: null,
    isActive: true,
    buyoutEnabled: true,
    recurrenceType: 'WEEKLY',
    recurrenceInterval: null,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: null,
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: null,
    nextDueAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    eligibility: [],
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
      <TaskDefinitionsSection />
    </QueryClientProvider>,
  );
}

describe('TaskDefinitionsSection', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt eine neu angelegte Aufgabe in der Liste, ohne dass die Seite neu lädt', async () => {
    const user = userEvent.setup();
    let definitions: AdminTaskDefinitionDto[] = [definitionFixture()];

    mockedApi.mockImplementation(
      async (path: string, options?: { method?: string; body?: unknown }) => {
        const method = options?.method ?? 'GET';
        if (path === '/admin/task-definitions' && method === 'GET') {
          return { items: definitions };
        }
        if (path === '/admin/categories') return { items: [] };
        if (path === '/admin/members') return { items: [] };
        if (path === '/admin/task-definitions' && method === 'POST') {
          const body = options?.body as { title: string; baseValue: number };
          const created = definitionFixture({
            id: 'def-2',
            title: body.title,
            baseValue: body.baseValue,
          });
          definitions = [...definitions, created];
          return created;
        }
        throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
      },
    );

    renderSection();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(screen.queryByText('Staubsaugen')).toBeNull();

    await user.click(screen.getByRole('button', { name: de.admin.taskDefinitions.addButton }));

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(de.admin.taskDefinitions.titleField),
      'Staubsaugen',
    );
    await user.click(
      within(dialog).getByRole('button', { name: de.admin.taskDefinitions.create }),
    );

    expect(await screen.findByText('Staubsaugen')).toBeInTheDocument();
  });

  it('zeigt die HAS_OPEN_INSTANCES-Meldung, wenn eine Aufgabe mit offenen Instanzen archiviert werden soll', async () => {
    const user = userEvent.setup();
    const definition = definitionFixture();

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/task-definitions' && method === 'GET') {
        return { items: [definition] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/members') return { items: [] };
      if (path === `/admin/task-definitions/${definition.id}` && method === 'DELETE') {
        throw Object.assign(new Error('Es gibt noch offene Instanzen.'), {
          status: 409,
          code: 'HAS_OPEN_INSTANCES',
          details: { count: 2 },
        });
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: de.admin.taskDefinitions.archive }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      interpolate(de.admin.taskDefinitions.errors.hasOpenInstances, { count: 2 }),
    );
  });
});
