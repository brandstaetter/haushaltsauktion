import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeOfDayInput } from './TimeOfDayInput';

describe('TimeOfDayInput', () => {
  it('renders the HH:mm value as a native time input', () => {
    render(<TimeOfDayInput value="14:30" onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('14:30');
    expect(input).toHaveAttribute('type', 'time');
  });

  it('forwards the raw HH:mm string the backend already expects', () => {
    const onChange = vi.fn();
    render(<TimeOfDayInput value="06:00" onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('06:00'), { target: { value: '18:45' } });
    expect(onChange).toHaveBeenCalledWith('18:45');
  });
});
