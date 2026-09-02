import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { interpolate } from '../../utils/format';
import type { CategoryDto } from '../../api/types';
import { CategoriesSection, computeReorder } from './CategoriesSection';

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

/** Eine Kategorie, wie `GET /admin/categories` sie liefert. */
function categoryFixture(overrides: Partial<CategoryDto> = {}): CategoryDto {
  return {
    id: 'cat-1',
    name: 'Bad',
    colorHex: '#ff0000',
    sortOrder: 0,
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
      <CategoriesSection />
    </QueryClientProvider>,
  );
}

describe('CategoriesSection', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt eine neu angelegte Kategorie in der Liste, ohne dass die Seite neu lädt', async () => {
    const user = userEvent.setup();
    let categories: CategoryDto[] = [categoryFixture()];

    mockedApi.mockImplementation(
      async (path: string, options?: { method?: string; body?: unknown }) => {
        const method = options?.method ?? 'GET';
        if (path === '/admin/categories' && method === 'GET') {
          return { items: categories };
        }
        if (path === '/admin/categories' && method === 'POST') {
          const body = options?.body as { name: string; colorHex: string | null; sortOrder: number };
          const created = categoryFixture({ id: 'cat-2', ...body });
          categories = [...categories, created];
          return created;
        }
        throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
      },
    );

    renderSection();

    expect(await screen.findByDisplayValue('Bad')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Küche')).toBeNull();

    await user.click(screen.getByRole('button', { name: de.admin.categories.addButton }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(de.admin.categories.name), 'Küche');
    await user.click(within(dialog).getByRole('button', { name: de.admin.categories.create }));

    expect(await screen.findByDisplayValue('Küche')).toBeInTheDocument();
  });

  it('zeigt die CATEGORY_IN_USE-Meldung, wenn eine noch verwendete Kategorie gelöscht werden soll', async () => {
    const user = userEvent.setup();
    const category = categoryFixture();

    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/categories' && method === 'GET') {
        return { items: [category] };
      }
      if (path === `/admin/categories/${category.id}` && method === 'DELETE') {
        throw Object.assign(new Error('Kategorie wird noch verwendet.'), {
          status: 409,
          code: 'CATEGORY_IN_USE',
          details: { count: 3 },
        });
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findByDisplayValue('Bad')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: de.admin.categories.delete }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      interpolate(de.admin.categories.errors.inUse, { count: 3 }),
    );
  });

  it('zeigt für jede Kategorie einen Ziehgriff zum Sortieren an, aber kein Reihenfolge-Feld mehr', async () => {
    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/categories' && method === 'GET') {
        return { items: [categoryFixture({ id: 'cat-1', name: 'Bad' }), categoryFixture({ id: 'cat-2', name: 'Küche' })] };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findAllByLabelText(de.admin.categories.dragHandle)).toHaveLength(2);
    expect(screen.queryByLabelText('Reihenfolge')).toBeNull();
  });

  it('filtert die Kategorienliste nach Namen und zeigt einen eigenen Leerzustand bei keinem Treffer', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/categories' && method === 'GET') {
        return {
          items: [categoryFixture({ id: 'cat-1', name: 'Bad' }), categoryFixture({ id: 'cat-2', name: 'Küche' })],
        };
      }
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    expect(await screen.findByDisplayValue('Bad')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Küche')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(de.admin.categories.filterPlaceholder), 'küch');

    expect(screen.queryByDisplayValue('Bad')).toBeNull();
    expect(screen.getByDisplayValue('Küche')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(de.admin.categories.filterPlaceholder));
    await user.type(screen.getByPlaceholderText(de.admin.categories.filterPlaceholder), 'nichts passt');

    expect(await screen.findByText(de.admin.categories.filterEmpty)).toBeInTheDocument();
  });

  it('zeigt den "Hinzufügen"-Button als floating action button mit dem addButton-Label', async () => {
    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (path === '/admin/categories' && method === 'GET') return { items: [categoryFixture()] };
      throw new Error(`unerwarteter Aufruf: ${path} ${method}`);
    });

    renderSection();

    const fab = await screen.findByRole('button', { name: de.admin.categories.addButton });
    expect(fab.tagName).toBe('BUTTON');
    expect(fab).toHaveAttribute('aria-label', de.admin.categories.addButton);
  });
});

describe('computeReorder', () => {
  const categories: CategoryDto[] = [
    { id: 'a', name: 'A', colorHex: null, sortOrder: 0 },
    { id: 'b', name: 'B', colorHex: null, sortOrder: 1 },
    { id: 'c', name: 'C', colorHex: null, sortOrder: 2 },
  ];

  it('verschiebt die aktive Kategorie an die Position der Zielkategorie und weist fortlaufende sortOrder-Werte zu', () => {
    const { full, changed } = computeReorder(categories, 'c', 'a');

    expect(full.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(full.map((c) => c.sortOrder)).toEqual([0, 1, 2]);
    // 'c' rückt von sortOrder 2 auf 0, 'a' von 0 auf 1, 'b' von 1 auf 2 —
    // alle drei haben sich verschoben.
    expect(changed.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('liefert eine leere changed-Liste, wenn active und over identisch sind oder unbekannt', () => {
    expect(computeReorder(categories, 'a', 'a').changed).toEqual([]);
    expect(computeReorder(categories, 'unknown', 'a').changed).toEqual([]);
  });

  it('meldet nur die Kategorien als geändert, deren sortOrder sich tatsächlich verschiebt', () => {
    // Ein Tausch zweier Nachbarn lässt jede andere Kategorie unberührt — nur
    // die beiden getauschten haben eine neue sortOrder.
    const { full, changed } = computeReorder(categories, 'b', 'c');

    expect(full.map((c) => c.id)).toEqual(['a', 'c', 'b']);
    expect(changed.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
});
