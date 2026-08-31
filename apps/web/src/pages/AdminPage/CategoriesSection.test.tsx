import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { interpolate } from '../../utils/format';
import type { CategoryDto } from '../../api/types';
import { CategoriesSection } from './CategoriesSection';

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
});
