import type { Meta, StoryObj } from '@storybook/react-vite';
import { PointsCard } from './PointsCard';

const meta = {
  title: 'Components/PointsCard',
  component: PointsCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PointsCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { balance: 42 },
};

/** Freikäufe ohne genug Punkte, oder Punktverfall unter 0 — der Chip zeigt den Minusbetrag genauso zentriert an. */
export const Negative: Story = {
  args: { balance: -6 },
};

export const Zero: Story = {
  args: { balance: 0 },
};
