import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { interpolate } from '../../utils/format';
import type {
  AdminTaskDefinitionDetailDto,
  AdminTaskDefinitionDto,
  SessionDto,
} from '../../api/types';
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

/** `GET /auth/me`, as `RecurrenceFields` reads it for the timezone note. */
const sessionFixture: SessionDto = {
  user: { id: 'user-1', email: 'elke@demo.local', displayName: 'Elke' },
  member: {
    id: 'mem-elke',
    displayName: 'Elke',
    avatarUrl: null,
    role: 'ADMIN',
    isActive: true,
    balance: 0,
    maxRandomAssignmentsPerWeek: null,
  },
  household: { id: 'household-1', name: 'Demo Family', timezone: 'Europe/Vienna' },
  role: 'ADMIN',
  csrfToken: 'csrf-token',
};

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TaskDefinitionsSection />
      </QueryClientProvider>
    </MemoryRouter>,
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
        if (path === '/auth/me') return sessionFixture;
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
    // The household's timezone must be visible next to the recurrence
    // time-of-day field — a typed "14:00" is ambiguous without it.
    expect(
      await within(dialog).findByText(
        interpolate(de.components.timezoneNote, { timezone: 'Europe/Vienna' }),
      ),
    ).toBeInTheDocument();
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

  it('zeigt den "Jetzt anbieten"-Button auch für eine automatisch geplante (WEEKLY) Aufgabe', async () => {
    const user = userEvent.setup();
    const definition = definitionFixture(); // default fixture: recurrenceType 'WEEKLY'

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/task-definitions' && method === 'GET') {
        return { items: [definition] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/members') return { items: [] };
      if (path === `/admin/task-definitions/${definition.id}/materialize` && method === 'POST') {
        return { instance: { id: 'inst-new', status: 'AVAILABLE', currentValue: definition.baseValue } };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    const materializeButton = screen.getByRole('button', {
      name: de.admin.taskDefinitions.materializeButton,
    });
    await user.click(materializeButton);

    expect(await screen.findByText(de.admin.taskDefinitions.materializedSuccess)).toBeInTheDocument();
  });

  it('filtert die Liste nach Titel und zeigt einen Hinweis, wenn nichts passt', async () => {
    const user = userEvent.setup();

    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/admin/task-definitions') {
        return { items: [definitionFixture({ title: 'Bad putzen' }), definitionFixture({ id: 'def-2', title: 'Müll hinausbringen' })] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/members') return { items: [] };
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderSection();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    expect(screen.getByText('Müll hinausbringen')).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(de.admin.taskDefinitions.filterPlaceholder),
      'müll',
    );

    expect(screen.queryByText('Bad putzen')).toBeNull();
    expect(screen.getByText('Müll hinausbringen')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(de.admin.taskDefinitions.filterPlaceholder));
    await user.type(
      screen.getByPlaceholderText(de.admin.taskDefinitions.filterPlaceholder),
      'staubsaugen',
    );

    expect(screen.queryByText('Bad putzen')).toBeNull();
    expect(screen.queryByText('Müll hinausbringen')).toBeNull();
    expect(screen.getByText(de.admin.taskDefinitions.filterEmpty)).toBeInTheDocument();
  });

  it('zeigt die laufenden Instanzen mit Zuweisung, wenn eine Aufgabe bearbeitet wird', async () => {
    const user = userEvent.setup();
    const definition = definitionFixture();
    const detail: AdminTaskDefinitionDetailDto = {
      ...definition,
      instances: [
        {
          id: 'inst-1',
          status: 'ASSIGNED',
          currentValue: 9,
          dueAt: null,
          assignments: [
            { id: 'asg-1', kind: 'RANDOM', member: { id: 'mem-1', displayName: 'Anna' } },
          ],
        },
        {
          id: 'inst-2',
          status: 'AVAILABLE',
          currentValue: 6,
          dueAt: null,
          assignments: [],
        },
      ],
      marketValue: { averageVoluntaryTakeoverValue: null, sampleSize: 0 },
    };

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/task-definitions' && method === 'GET') {
        return { items: [definition] };
      }
      if (path === '/admin/categories') return { items: [] };
      if (path === '/admin/members') return { items: [] };
      if (path === '/auth/me') return sessionFixture;
      if (path === `/admin/task-definitions/${definition.id}` && method === 'GET') {
        return detail;
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findByText('Bad putzen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.admin.taskDefinitions.edit }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(de.admin.taskDefinitions.instances.title),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        interpolate(de.admin.taskDefinitions.instances.assignedTo, {
          name: 'Anna',
          kind: de.admin.taskDefinitions.instances.kindLabels.RANDOM,
        }),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(de.admin.taskDefinitions.instances.unassigned),
    ).toBeInTheDocument();
  });
});
