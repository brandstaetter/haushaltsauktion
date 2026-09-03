import type { Meta, StoryObj } from '@storybook/react-vite';
import { CategoryBadge } from './CategoryBadge';

const meta = {
  title: 'Components/CategoryBadge',
  component: CategoryBadge,
  args: {
    name: 'Küche',
    colorHex: '#204060',
  },
} satisfies Meta<typeof CategoryBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Colored: Story = {};

export const LightBackground: Story = {
  args: { name: 'Bad', colorHex: '#f5e6a8' },
};

/** No `colorHex` set on the category — renders unstyled rather than guessing a color. */
export const NoColor: Story = {
  args: { name: 'Sonstiges', colorHex: null },
};

/** An invalid hex value is treated the same as "no color" instead of an unreadable combination. */
export const InvalidColor: Story = {
  args: { name: 'Garten', colorHex: 'not-a-color' },
};
