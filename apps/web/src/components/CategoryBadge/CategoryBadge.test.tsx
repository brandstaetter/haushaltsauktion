import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryBadge } from './CategoryBadge';

describe('CategoryBadge', () => {
  it('färbt die Badge mit lesbarer Textfarbe bei gültigem colorHex', () => {
    render(<CategoryBadge name="Küche" colorHex="#204060" />);
    const badge = screen.getByText('Küche');

    expect(badge).toHaveStyle({ background: '#204060', color: '#ffffff' });
  });

  it('bleibt unstyled, wenn colorHex ungültig ist, statt eine unlesbare Kombination zu rendern', () => {
    render(<CategoryBadge name="Küche" colorHex="not-a-color" />);
    const badge = screen.getByText('Küche');

    expect(badge).not.toHaveAttribute('style');
  });

  it('bleibt unstyled ohne colorHex', () => {
    render(<CategoryBadge name="Küche" colorHex={null} />);
    const badge = screen.getByText('Küche');

    expect(badge).not.toHaveAttribute('style');
  });
});
