import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DurationInput } from './DurationInput';

const meta = {
  title: 'Components/DurationInput',
  component: DurationInput,
  args: {
    valueMinutes: 720,
    placeholder: 'Enter duration',
    onChange: () => {},
  },
} satisfies Meta<typeof DurationInput>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Controlled duration input showing 12 hours (720 minutes) — the unit selector initializes to the coarsest exact fit. */
export const Default: Story = {
  args: {},
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return <DurationInput {...args} valueMinutes={value} onChange={setValue} />;
  },
};

/** Empty/null duration — displays blank and initializes unit to minutes. Typing a value emits raw minutes. */
export const Empty: Story = {
  args: { valueMinutes: null },
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return <DurationInput {...args} valueMinutes={value} onChange={setValue} />;
  },
};

/** Zero minutes — initializes unit to minutes, displays as 0. */
export const ZeroValue: Story = {
  args: { valueMinutes: 0 },
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return <DurationInput {...args} valueMinutes={value} onChange={setValue} />;
  },
};

/** Minutes unit (non-hour value): 90 minutes shows as "90" with "Minuten" selected, cannot coarsen further. */
export const MinutesUnit: Story = {
  args: { valueMinutes: 90 },
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return <DurationInput {...args} valueMinutes={value} onChange={setValue} />;
  },
};

/** Days unit: 2880 minutes (2 days) displays as "2" with "Tage" selected. */
export const DaysUnit: Story = {
  args: { valueMinutes: 2880 },
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return <DurationInput {...args} valueMinutes={value} onChange={setValue} />;
  },
};

/** Fractional hour value: 90 minutes (1.5 hours) — switches to hours unit to demonstrate decimal input. */
export const FractionalHour: Story = {
  args: { valueMinutes: 90 },
  render: function Render(args) {
    const [value, setValue] = useState(args.valueMinutes);
    return (
      <DurationInput
        {...args}
        valueMinutes={value}
        onChange={setValue}
      />
    );
  },
};
