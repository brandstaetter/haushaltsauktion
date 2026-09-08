import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { CategoryDto } from '../../api/types';
import { CategoriesSection } from './CategoriesSection';

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
  makeCategory({ id: 'cat-cellar', name: 'Keller', colorHex: '#6b7280', sortOrder: 4 }),
];

/**
 * Types into the category filter input to narrow the list.
 * Uses the placeholder text from `de.admin.categories.filterPlaceholder` to locate the input.
 */
async function filterCategories(canvasElement: HTMLElement, filterText: string): Promise<void> {
  const canvas = within(canvasElement);
  // The filter input uses a placeholder attribute; find it and type.
  // Placeholder text: 'Kategorien filtern'
  const filterInput = await canvas.findByPlaceholderText('Kategorien filtern');
  await userEvent.type(filterInput, filterText);
}

const meta = {
  title: 'Pages/Admin/CategoriesSection',
  component: CategoriesSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CategoriesSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Populated list with multiple categories in different colors — the main content view. */
export const Populated: Story = {
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

/** No categories yet — empty state with guidance to add the first one. */
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

/** Data fetch still in flight — indefinite delay. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () => new Promise(() => {})),
      ],
    },
  },
};

/** Server-side error (500) — retry affordance shown. */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ error: { message: 'Fehler beim Laden der Kategorien' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** iPhone 13 viewport (390×844) — mobile-optimized layout with touch-friendly controls. */
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

/**
 * Filter applied ("Küche") — narrows the populated list to one match while
 * the other categories remain in the DOM but are hidden. Drag-and-drop is
 * disabled in this view to avoid confusion with filtered sort indices.
 */
export const FilterActive: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({ items: populatedCategories }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await filterCategories(canvasElement, 'Küche');
  },
};

/** Filter applied with no matches — the empty-filter state. */
export const FilterEmpty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/categories', () =>
          HttpResponse.json({
            items: [
              makeCategory({ id: 'cat-1', name: 'Küche', colorHex: '#f59e0b', sortOrder: 0 }),
              makeCategory({ id: 'cat-2', name: 'Bad', colorHex: '#3b82f6', sortOrder: 1 }),
            ],
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await filterCategories(canvasElement, 'Nonexistent');
  },
};
