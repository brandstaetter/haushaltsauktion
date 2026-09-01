import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { bestUnitFor, DurationInput } from './DurationInput';

describe('bestUnitFor', () => {
  it('picks days for a value evenly divisible by a day', () => {
    expect(bestUnitFor(2880)).toBe('DAYS');
  });

  it('picks hours for a value evenly divisible by an hour but not a day', () => {
    expect(bestUnitFor(720)).toBe('HOURS');
  });

  it('falls back to minutes for a value that fits no coarser unit', () => {
    expect(bestUnitFor(90)).toBe('MINUTES');
  });

  it('defaults empty and zero values to minutes', () => {
    expect(bestUnitFor(null)).toBe('MINUTES');
    expect(bestUnitFor(0)).toBe('MINUTES');
  });
});

describe('DurationInput', () => {
  it('opens showing the coarsest unit that fits, not raw minutes', () => {
    render(<DurationInput valueMinutes={720} onChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveValue(12);
    expect(screen.getByRole('combobox')).toHaveValue('HOURS');
  });

  it('emits raw minutes when the number changes in a non-minutes unit', () => {
    const onChange = vi.fn();
    render(<DurationInput valueMinutes={720} onChange={onChange} />);

    // 3 hours in the currently-selected unit.
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });

    expect(onChange).toHaveBeenLastCalledWith(180);
  });

  it('switching the unit redisplays the value without calling onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DurationInput valueMinutes={90} onChange={onChange} />);

    // 90 has no coarser exact unit, so it opens as 90 Minuten.
    expect(screen.getByRole('spinbutton')).toHaveValue(90);

    await user.selectOptions(screen.getByRole('combobox'), de.components.duration.hours);

    expect(screen.getByRole('spinbutton')).toHaveValue(1.5);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits null when the field is cleared, for nullable fields like dueOffsetMinutes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DurationInput valueMinutes={60} onChange={onChange} placeholder="∞" />);

    await user.clear(screen.getByRole('spinbutton'));

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
