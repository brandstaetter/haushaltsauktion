import { describe, expect, it } from 'vitest';

import { readableTextColor } from './color';

describe('readableTextColor', () => {
  it('picks black text on a very light background', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#f0e68c')).toBe('#000000');
  });

  it('picks white text on a very dark background', () => {
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#1a1a2e')).toBe('#ffffff');
  });

  it('returns null for a missing or invalid color', () => {
    expect(readableTextColor(null)).toBeNull();
    expect(readableTextColor(undefined)).toBeNull();
    expect(readableTextColor('')).toBeNull();
    expect(readableTextColor('not-a-color')).toBeNull();
  });

  it('accepts hex values without a leading #', () => {
    expect(readableTextColor('ffffff')).toBe('#000000');
  });
});
