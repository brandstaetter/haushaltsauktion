import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { CategoryDto } from '../../api/types';
import { AdminCategoriesPage } from './AdminCategoriesPage';
import { Layout } from '../../components/Layout/Layout';

function makeCategory(overrides: Partial<CategoryDto> = {}): CategoryDto {
  return {
    id: 'cat-1',
    name: 'Bad',
    colorHex: '#3b82f6',
    sortOrder: 0,
    ...overrides,
  };
}

const populatedCategories: CategoryDto[] = [
  makeCategory({ id: 'cat-kitchen', name: 'Küche', colorHex: '#f59e0b', sortOrder: 0 }),
  makeCategory({ id: 'cat-bathroom', name: 'Bad', colorHex: '#3b82f6', sortOrder: 1 }),
  makeCategory({ id: 'cat-living', name: 'Wohnzimmer', colorHex: '#8b5cf6', sortOrder: 2 }),
  makeCategory({ id: 'cat-garden', name: 'Garten', colorHex: '#10b981', sortOrder: 3 }),
];

/**
 * Full-page admin route story: renders the real page against MSW default
 * handlers, wrapped in the real `Layout` so the admin header and navigation
 * chrome show up exactly as the app renders it. The route path
 * `/verwaltung/kategorien` matches against the global `MemoryRouter`
 * decorator's `initialEntries`, so the admin tab bar highlights correctly.
 */
const meta = {
  title: 'Pages/Admin/AdminCategoriesPage',
  component: AdminCategoriesPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: {
      initialEntries: ['/verwaltung/kategorien'],
    },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/kategorien" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminCategoriesPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Populated categories list with the admin page chrome and navigation. */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: populatedCategories }),
        ),
      ],
    },
  },
};

/** No categories yet — empty state within the admin page layout. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: [] }),
        ),
      ],
    },
  },
};

/** iPhone 13 viewport (390×844) — mobile-optimized admin page view. */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: populatedCategories }),
        ),
      ],
    },
  },
};
