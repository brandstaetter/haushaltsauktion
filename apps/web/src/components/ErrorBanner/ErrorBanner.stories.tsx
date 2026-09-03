import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorBanner } from './ErrorBanner';

const meta = {
  title: 'Components/ErrorBanner',
  component: ErrorBanner,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ErrorBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Diese Kategorie wird noch von 3 Aufgaben verwendet.' },
};

export const LongMessage: Story = {
  args: {
    children:
      'Diese Aufgabe hat noch 2 offene Instanzen, die zunächst erledigt oder abgebrochen werden müssen, bevor sie archiviert werden kann.',
  },
};
