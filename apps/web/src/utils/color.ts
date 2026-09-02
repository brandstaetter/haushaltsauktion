/**
 * Picks black or white as the readable text color for a given background,
 * per the WCAG relative-luminance formula. Returns null for invalid input
 * so callers can fall back to their default (unstyled) presentation.
 */
export function readableTextColor(backgroundHex: string | null | undefined): string | null {
  const rgb = parseHexColor(backgroundHex);
  if (!rgb) return null;

  const luminance = relativeLuminance(rgb);
  const contrastWithBlack = contrastRatio(luminance, 0);
  const contrastWithWhite = contrastRatio(luminance, 1);

  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff';
}

function parseHexColor(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
