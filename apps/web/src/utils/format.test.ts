import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatDate,
  formatNumber,
  formatRelativeTime,
  formatShortDate,
  formatTime,
  interpolate,
  signedNumber,
} from './format';

/**
 * `formatShortDate` und `formatRelativeTime` lesen die Uhr, deshalb steht sie
 * in diesen Tests still. Alle anderen Fälle bleiben absichtlich
 * zeitzonenunabhängig: die ISO-Strings entstehen aus lokalen `Date`-Objekten,
 * damit derselbe Test in jeder Zeitzone dieselbe Uhrzeit erwartet.
 */
function localIso(
  y: number,
  m: number,
  d: number,
  h = 12,
  min = 0,
): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('formatNumber', () => {
  it('gruppiert Tausender nach deutscher Konvention', () => {
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('lässt kleine Zahlen unverändert', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
  });

  it('behält das Vorzeichen negativer Zahlen', () => {
    expect(formatNumber(-42)).toBe('-42');
  });
});

describe('signedNumber', () => {
  it('setzt bei Gewinnen ein Plus davor', () => {
    expect(signedNumber(6)).toBe('+6');
    expect(signedNumber(1234)).toBe('+1.234');
  });

  it('setzt bei Abzügen ein typografisches Minus davor', () => {
    // U+2212, nicht der ASCII-Bindestrich — im Ledger steht der echte Minus.
    expect(signedNumber(-6)).toBe('−6');
    expect(signedNumber(-1234)).toBe('−1.234');
  });

  it('zeigt die Null ohne Vorzeichen — eine zugeloste Aufgabe bringt 0 (§7)', () => {
    expect(signedNumber(0)).toBe('0');
  });
});

describe('interpolate', () => {
  it('ersetzt Platzhalter durch Werte', () => {
    expect(interpolate('Für {cost} Punkte freikaufen', { cost: 6 })).toBe(
      'Für 6 Punkte freikaufen',
    );
  });

  it('ersetzt jeden Platzhalter, auch mehrfach vorkommende', () => {
    expect(interpolate('{a} und {b} und {a}', { a: 'x', b: 'y' })).toBe('x und y und x');
  });

  it('ersetzt unbekannte Platzhalter durch den leeren String', () => {
    expect(interpolate('Hallo {name}', {})).toBe('Hallo ');
  });

  it('lässt Text ohne Platzhalter unangetastet', () => {
    expect(interpolate('Keine Platzhalter', { a: 1 })).toBe('Keine Platzhalter');
  });
});

describe('formatTime', () => {
  it('formatiert zweistellig im 24-Stunden-Format', () => {
    expect(formatTime(localIso(2026, 8, 29, 14, 5))).toBe('14:05');
    expect(formatTime(localIso(2026, 8, 29, 9, 0))).toBe('09:00');
  });
});

describe('formatDate', () => {
  it('nennt Wochentag, Tag und Monat auf Deutsch', () => {
    const formatted = formatDate(localIso(2026, 8, 29));
    expect(formatted).toContain('Samstag');
    expect(formatted).toContain('29');
    expect(formatted).toContain('Aug');
  });
});

describe('formatShortDate', () => {
  it('sagt „heute“ statt eines Datums', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0));
    expect(formatShortDate(localIso(2026, 8, 29, 18, 30))).toBe('heute');
  });

  it('sagt „morgen“ für den Folgetag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0));
    expect(formatShortDate(localIso(2026, 8, 30, 8, 0))).toBe('morgen');
  });

  it('nennt für weiter entfernte Tage Wochentag und Datum', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0));
    const formatted = formatShortDate(localIso(2026, 9, 2, 8, 0));
    expect(formatted).not.toBe('heute');
    expect(formatted).not.toBe('morgen');
    expect(formatted).toContain('2');
    expect(formatted).toContain('Sep');
  });

  it('erkennt den Monatswechsel — gleicher Tag, anderer Monat ist nicht heute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 10, 0));
    expect(formatShortDate(localIso(2026, 9, 29, 10, 0))).not.toBe('heute');
  });
});

describe('formatRelativeTime', () => {
  it('rechnet innerhalb einer Stunde in Minuten', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0));
    const formatted = formatRelativeTime(localIso(2026, 8, 29, 11, 30));
    expect(formatted).toContain('30');
    expect(formatted).toMatch(/Minute/);
  });

  it('rechnet unter einem Tag in Stunden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0));
    const formatted = formatRelativeTime(localIso(2026, 8, 29, 7, 0));
    expect(formatted).toContain('5');
    expect(formatted).toMatch(/Stunde/);
  });

  it('rechnet darüber hinaus in Tagen und blickt auch nach vorn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 29, 12, 0));
    expect(formatRelativeTime(localIso(2026, 9, 1, 12, 0))).toMatch(/Tag/);
    expect(formatRelativeTime(localIso(2026, 8, 26, 12, 0))).toMatch(/Tag/);
  });
});
