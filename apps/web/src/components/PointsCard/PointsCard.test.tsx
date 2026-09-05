import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PointsCard } from './PointsCard';

describe('PointsCard', () => {
  it('zeigt das Label und den Punktestand', () => {
    render(<PointsCard balance={42} />);
    expect(screen.getByText('Dein Punktestand')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('zeigt keine Basiswert-Zeile (ValueChip mit showBase=false)', () => {
    render(<PointsCard balance={42} />);
    expect(screen.queryByText(/Basiswert/)).not.toBeInTheDocument();
  });
});
