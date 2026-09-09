import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecurrenceType } from '@haushaltsauktion/shared';
import { TurnusComponent, type TurnusDraft } from './TurnusComponent';

function emptyTurnus(overrides: Partial<TurnusDraft> = {}): TurnusDraft {
  return {
    type: RecurrenceType.WEEKLY,
    interval: null,
    weekdays: [],
    dayOfMonth: null,
    timeOfDay: '',
    dueOffsetMinutes: null,
    ...overrides,
  };
}

const meta = {
  title: 'Pages/Admin/TurnusComponent',
  component: TurnusComponent,
  parameters: { layout: 'padded' },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <TurnusComponent
        value={value}
        onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
      />
    );
  },
} satisfies Meta<typeof TurnusComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

/** WEEKLY — shows the weekday checkboxes plus time-of-day and due-offset fields. */
export const Weekly: Story = {
  args: {
    value: emptyTurnus({ type: RecurrenceType.WEEKLY, weekdays: [6], timeOfDay: '14:00', dueOffsetMinutes: 120 }),
    onChange: () => {},
  },
};

/** EVERY_N_DAYS — the interval-in-days field replaces the weekday picker. */
export const EveryNDays: Story = {
  args: {
    value: emptyTurnus({ type: RecurrenceType.EVERY_N_DAYS, interval: 3, timeOfDay: '10:00' }),
    onChange: () => {},
  },
};

/** MONTHLY — a single day-of-month field instead of weekdays or an interval. */
export const Monthly: Story = {
  args: {
    value: emptyTurnus({ type: RecurrenceType.MONTHLY, dayOfMonth: 15, timeOfDay: '09:00', dueOffsetMinutes: 180 }),
    onChange: () => {},
  },
};

/** MANUAL — no automatic scheduling, so time-of-day and due-offset are hidden entirely. */
export const Manual: Story = {
  args: {
    value: emptyTurnus({ type: RecurrenceType.MANUAL }),
    onChange: () => {},
  },
};
