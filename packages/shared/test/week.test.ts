/**
 * ISO week boundaries and timezone arithmetic (§5.6, OQ-6).
 *
 * "Du hast noch einen Freikauf diese Woche" is only comprehensible if the week
 * visibly resets, so the boundary has to be an ISO calendar week in the
 * household timezone — and it has to be the *same* boundary on client and
 * server, which is why this lives in the shared package.
 */

import { describe, expect, it } from 'vitest';

import {
  addCivilDays,
  civilDateIn,
  civilToInstant,
  daysBetween,
  isSameWeek,
  isoWeekOf,
  isoWeekday,
  parseTimeOfDay,
  timeZoneOffsetMs,
  weekKey,
} from '../src/time/week.js';

const BERLIN = 'Europe/Berlin';
const UTC = 'UTC';

describe('civil date in a timezone', () => {
  it('rolls to the next day for a late-evening UTC instant in Berlin', () => {
    // 2026-08-30T23:30Z is 2026-08-31T01:30 in Berlin (CEST, UTC+2).
    const instant = new Date('2026-08-30T23:30:00Z');
    expect(civilDateIn(instant, BERLIN)).toEqual({ year: 2026, month: 8, day: 31 });
    expect(civilDateIn(instant, UTC)).toEqual({ year: 2026, month: 8, day: 30 });
  });
});

describe('ISO weekday and week number', () => {
  it('numbers Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday({ year: 2026, month: 8, day: 31 })).toBe(1); // Monday
    expect(isoWeekday({ year: 2026, month: 9, day: 6 })).toBe(7); // Sunday
  });

  it('handles the year-boundary cases ISO weeks exist for', () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeekOf({ year: 2027, month: 1, day: 1 })).toEqual({ weekYear: 2026, week: 53 });
    // 2025-12-29 is a Monday and starts ISO week 1 of 2026.
    expect(isoWeekOf({ year: 2025, month: 12, day: 29 })).toEqual({ weekYear: 2026, week: 1 });
    expect(isoWeekOf({ year: 2026, month: 1, day: 4 })).toEqual({ weekYear: 2026, week: 1 });
    expect(isoWeekOf({ year: 2026, month: 1, day: 5 })).toEqual({ weekYear: 2026, week: 2 });
  });
});

describe('weekKey', () => {
  it('formats a stable, sortable key', () => {
    expect(weekKey(new Date('2026-08-30T12:00:00Z'), BERLIN)).toBe('2026-W35');
    expect(weekKey(new Date('2026-08-31T12:00:00Z'), BERLIN)).toBe('2026-W36');
  });

  it('resets at Monday 00:00 in the household timezone, not in UTC', () => {
    // 2026-08-30 is a Sunday. 22:30 UTC is already Monday 00:30 in Berlin,
    // so the Berlin week has ticked over while the UTC week has not.
    const instant = new Date('2026-08-30T22:30:00Z');
    expect(weekKey(instant, BERLIN)).toBe('2026-W36');
    expect(weekKey(instant, UTC)).toBe('2026-W35');
  });

  it('groups every day of one ISO week under the same key', () => {
    const monday = new Date('2026-08-31T08:00:00Z');
    const sunday = new Date('2026-09-06T20:00:00Z');
    expect(isSameWeek(monday, sunday, BERLIN)).toBe(true);
    expect(isSameWeek(sunday, new Date('2026-09-07T08:00:00Z'), BERLIN)).toBe(false);
  });

  it('pads a single-digit week number', () => {
    expect(weekKey(new Date('2026-01-08T12:00:00Z'), BERLIN)).toBe('2026-W02');
  });
});

describe('timezone offsets and civil-to-instant conversion', () => {
  it('reports CET in winter and CEST in summer', () => {
    expect(timeZoneOffsetMs(new Date('2026-01-15T12:00:00Z'), BERLIN)).toBe(3_600_000);
    expect(timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), BERLIN)).toBe(7_200_000);
    expect(timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), UTC)).toBe(0);
  });

  it('round-trips a wall-clock time through an absolute instant', () => {
    const instant = civilToInstant({ year: 2026, month: 7, day: 15 }, { hour: 6, minute: 0 }, BERLIN);
    expect(instant.toISOString()).toBe('2026-07-15T04:00:00.000Z');
    expect(civilDateIn(instant, BERLIN)).toEqual({ year: 2026, month: 7, day: 15 });
  });

  it('keeps 06:00 local across the spring DST transition', () => {
    // Germany springs forward on the last Sunday in March (2026-03-29).
    const before = civilToInstant({ year: 2026, month: 3, day: 28 }, { hour: 6, minute: 0 }, BERLIN);
    const after = civilToInstant({ year: 2026, month: 3, day: 30 }, { hour: 6, minute: 0 }, BERLIN);
    expect(before.toISOString()).toBe('2026-03-28T05:00:00.000Z');
    expect(after.toISOString()).toBe('2026-03-30T04:00:00.000Z');
  });
});

describe('civil-day arithmetic', () => {
  it('rolls across month and year boundaries', () => {
    expect(addCivilDays({ year: 2026, month: 8, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
    expect(addCivilDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addCivilDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it('counts whole days between instants', () => {
    expect(daysBetween(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-29T00:00:00Z'))).toBe(28);
  });
});

describe('parseTimeOfDay', () => {
  it('accepts HH:mm and rejects anything else', () => {
    expect(parseTimeOfDay('06:00')).toEqual({ hour: 6, minute: 0 });
    expect(parseTimeOfDay('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('6:00')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay(null)).toBeNull();
  });
});
