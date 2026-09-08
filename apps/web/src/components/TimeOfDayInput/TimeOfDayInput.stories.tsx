import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimeOfDayInput } from './TimeOfDayInput';

/**
 * `TimeOfDayInput` is a thin wrapper over a native `<input type="time">` with
 * no conditional rendering of its own, so the only genuinely distinct states
 * are "has a value" and "has none" — the browser owns everything else.
 * Deliberately not one story per clock time: 06:00, 14:30 and 23:59 render the
 * identical control and would only inflate the sidebar.
 */
const meta = {
  title: 'Components/TimeOfDayInput',
  component: TimeOfDayInput,
  args: {
    value: '14:30',
    onChange: () => {},
  },
} satisfies Meta<typeof TimeOfDayInput>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Populated and interactive — `useState` holds the value so the picker actually responds to input. */
export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <TimeOfDayInput {...args} value={value} onChange={setValue} />;
  },
};

/** No time chosen yet — the empty string renders the browser's blank `--:--` placeholder. */
export const Empty: Story = {
  args: { value: '' },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <TimeOfDayInput {...args} value={value} onChange={setValue} />;
  },
};
