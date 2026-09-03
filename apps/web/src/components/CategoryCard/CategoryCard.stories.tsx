import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CategoryDto } from '../../api/types';
import { CategoryCard, draftFromCategory } from './CategoryCard';

function makeCategory(overrides: Partial<CategoryDto> = {}): CategoryDto {
  return {
    id: 'cat-bad',
    name: 'Bad',
    colorHex: '#5b8def',
    sortOrder: 0,
    ...overrides,
  };
}

const meta = {
  title: 'Components/CategoryCard',
  component: CategoryCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 520 }}>
        <Story />
      </ul>
    ),
  ],
  args: {
    error: null,
    saving: false,
    deleting: false,
    dragDisabled: false,
    onChange: () => {},
    onSave: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof CategoryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Freshly loaded — matches the saved category, so "Speichern" is disabled. */
export const Default: Story = {
  args: {
    category: makeCategory(),
    draft: draftFromCategory(makeCategory()),
  },
};

/** Name edited but not yet saved — "Speichern" becomes enabled. */
export const Dirty: Story = {
  args: {
    category: makeCategory(),
    draft: { name: 'Badezimmer', colorHex: '#5b8def' },
  },
};

export const Saving: Story = {
  args: {
    category: makeCategory(),
    draft: { name: 'Badezimmer', colorHex: '#5b8def' },
    saving: true,
  },
};

export const Deleting: Story = {
  args: {
    category: makeCategory(),
    draft: draftFromCategory(makeCategory()),
    deleting: true,
  },
};

/** A rejected save/delete (e.g. `CATEGORY_IN_USE`) surfaces inline. */
export const WithError: Story = {
  args: {
    category: makeCategory(),
    draft: draftFromCategory(makeCategory()),
    error: 'Diese Kategorie wird noch von 3 Aufgaben verwendet.',
  },
};

/** While a name filter narrows the list, the drag handle is disabled. */
export const DragDisabled: Story = {
  args: {
    category: makeCategory(),
    draft: draftFromCategory(makeCategory()),
    dragDisabled: true,
  },
};

/** No color set on the underlying category — falls back to a neutral gray. */
export const NoColor: Story = {
  args: {
    category: makeCategory({ colorHex: null }),
    draft: draftFromCategory(makeCategory({ colorHex: null })),
  },
};
