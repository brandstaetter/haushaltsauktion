/**
 * §18 / §1.4 — recurrence, and §5.8's derived timing.
 *
 * All dates are computed in the household timezone, which is why the DST cases
 * are here: a chore due at 06:00 must stay at 06:00 local across the March and
 * October transitions rather than drifting by an hour.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '@haushaltsauktion/shared';

import {
  dueAtFor,
  expiryDeadline,
  nextOccurrence,
  offerExpiresAt,
  type RecurrenceRule,
} from '../../src/domain/recurrence/next-occurrence.js';

const BERLIN = 'Europe/Berlin';

const rule = (over: Partial<RecurrenceRule>): RecurrenceRule => ({
  type: 'ONCE',
  interval: null,
  weekdays: [],
  dayOfMonth: null,
  timeOfDay: '06:00',
  dueOffsetMinutes: null,
  ...over,
});

// 2026-08-30 is a Sunday.
const SUNDAY = new Date('2026-08-30T12:00:00Z');

describe('nextOccurrence (§1.4)', () => {
  it('never recurs for ONCE or MANUAL', () => {
    expect(nextOccurrence(rule({ type: 'ONCE' }), SUNDAY, BERLIN)).toBeNull();
    expect(nextOccurrence(rule({ type: 'MANUAL' }), SUNDAY, BERLIN)).toBeNull();
  });

  it('DAILY moves to the next calendar day at the configured time', () => {
    const next = nextOccurrence(rule({ type: 'DAILY' }), SUNDAY, BERLIN);
    // 06:00 Berlin in summer (CEST) is 04:00 UTC.
    expect(next?.toISOString()).toBe('2026-08-31T04:00:00.000Z');
  });

  it('EVERY_N_DAYS steps by the interval', () => {
    const next = nextOccurrence(rule({ type: 'EVERY_N_DAYS', interval: 3 }), SUNDAY, BERLIN);
    expect(next?.toISOString()).toBe('2026-09-02T04:00:00.000Z');
  });

  it('WEEKDAYS picks the next listed weekday — §18 "Müll: Montag und Donnerstag"', () => {
    const muell = rule({ type: 'WEEKDAYS', weekdays: [1, 4] });
    const monday = nextOccurrence(muell, SUNDAY, BERLIN);
    expect(monday?.toISOString()).toBe('2026-08-31T04:00:00.000Z'); // Monday
    const thursday = nextOccurrence(muell, monday as Date, BERLIN);
    expect(thursday?.toISOString()).toBe('2026-09-03T04:00:00.000Z'); // Thursday
    const nextMonday = nextOccurrence(muell, thursday as Date, BERLIN);
    expect(nextMonday?.toISOString()).toBe('2026-09-07T04:00:00.000Z');
  });

  it('WEEKLY lands on the anchor weekday and then steps by seven days', () => {
    const saturday = rule({ type: 'WEEKLY', weekdays: [6] });
    const first = nextOccurrence(saturday, SUNDAY, BERLIN);
    expect(first?.toISOString()).toBe('2026-09-05T04:00:00.000Z'); // Saturday
    const second = nextOccurrence(saturday, first as Date, BERLIN);
    expect(second?.toISOString()).toBe('2026-09-12T04:00:00.000Z');
  });

  it('MONTHLY uses the configured day of the month', () => {
    const monthly = rule({ type: 'MONTHLY', dayOfMonth: 1 });
    const first = nextOccurrence(monthly, SUNDAY, BERLIN);
    expect(first?.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    const second = nextOccurrence(monthly, first as Date, BERLIN);
    expect(second?.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('caps the day of month at 28 so no month is ever skipped', () => {
    const next = nextOccurrence(
      rule({ type: 'MONTHLY', dayOfMonth: 28 }),
      new Date('2027-01-15T12:00:00Z'),
      BERLIN,
    );
    // February exists for every day up to 28 in every year.
    expect(next?.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('returns null for WEEKDAYS with no weekdays configured', () => {
    expect(nextOccurrence(rule({ type: 'WEEKDAYS', weekdays: [] }), SUNDAY, BERLIN)).toBeNull();
  });

  it('holds the local wall-clock time across both DST transitions', () => {
    const daily = rule({ type: 'DAILY' });
    // Spring forward: 2026-03-29. 06:00 local is 05:00Z before, 04:00Z after.
    const beforeSpring = nextOccurrence(daily, new Date('2026-03-27T12:00:00Z'), BERLIN);
    const afterSpring = nextOccurrence(daily, new Date('2026-03-29T12:00:00Z'), BERLIN);
    expect(beforeSpring?.toISOString()).toBe('2026-03-28T05:00:00.000Z');
    expect(afterSpring?.toISOString()).toBe('2026-03-30T04:00:00.000Z');

    // Fall back: 2026-10-25.
    const afterAutumn = nextOccurrence(daily, new Date('2026-10-25T12:00:00Z'), BERLIN);
    expect(afterAutumn?.toISOString()).toBe('2026-10-26T05:00:00.000Z');
  });

  it('anchors on the scheduled occurrence, so a missed cycle does not shift the series', () => {
    const weekly = rule({ type: 'WEEKLY', weekdays: [6] });
    const scheduled = new Date('2026-09-05T04:00:00Z');
    // Even if it was completed late, the next occurrence follows the schedule.
    expect(nextOccurrence(weekly, scheduled, BERLIN)?.toISOString()).toBe(
      '2026-09-12T04:00:00.000Z',
    );
  });

  it('defaults to 06:00 local when no time of day is set', () => {
    const next = nextOccurrence(rule({ type: 'DAILY', timeOfDay: null }), SUNDAY, BERLIN);
    expect(next?.toISOString()).toBe('2026-08-31T04:00:00.000Z');
  });
});

describe('dueAtFor (§3.2)', () => {
  it('offsets the occurrence start, or returns null', () => {
    const start = new Date('2026-08-31T04:00:00Z');
    expect(dueAtFor(rule({ dueOffsetMinutes: 720 }), start)?.toISOString()).toBe(
      '2026-08-31T16:00:00.000Z',
    );
    expect(dueAtFor(rule({ dueOffsetMinutes: null }), start)).toBeNull();
  });
});

describe('offerExpiresAt (§5.8, OQ-4)', () => {
  const publishedAt = new Date('2026-08-30T12:00:00Z');
  const cfg = DEFAULT_CONFIG.assignment;

  it('uses the offer duration when there is no due date', () => {
    expect(
      offerExpiresAt({
        publishedAt,
        dueAt: null,
        offerDurationMinutes: cfg.offerDurationMinutes,
        leadMinutesBeforeDue: cfg.leadMinutesBeforeDue,
      }).toISOString(),
    ).toBe('2026-08-30T13:00:00.000Z');
  });

  it('clamps to the due date when that comes first', () => {
    expect(
      offerExpiresAt({
        publishedAt,
        dueAt: new Date('2026-08-30T12:30:00Z'),
        offerDurationMinutes: 60,
        leadMinutesBeforeDue: 0,
      }).toISOString(),
    ).toBe('2026-08-30T12:30:00.000Z');
  });

  it('brings the draw forward by leadMinutesBeforeDue', () => {
    expect(
      offerExpiresAt({
        publishedAt,
        dueAt: new Date('2026-08-30T12:45:00Z'),
        offerDurationMinutes: 60,
        leadMinutesBeforeDue: 30,
      }).toISOString(),
    ).toBe('2026-08-30T12:15:00.000Z');
  });

  it('never resolves to a moment before publication', () => {
    // A task published after its own due date is offered for an instant rather
    // than being retroactively expired.
    expect(
      offerExpiresAt({
        publishedAt,
        dueAt: new Date('2026-08-30T09:00:00Z'),
        offerDurationMinutes: 60,
        leadMinutesBeforeDue: 0,
      }).getTime(),
    ).toBe(publishedAt.getTime());
  });
});

describe('expiryDeadline (§5.8, OQ-4)', () => {
  it('is the due date when there is one', () => {
    const dueAt = new Date('2026-08-31T16:00:00Z');
    expect(
      expiryDeadline(rule({ type: 'DAILY' }), { scheduledFor: SUNDAY, dueAt }, BERLIN),
    ).toEqual(dueAt);
  });

  it('falls back to the next occurrence for a recurring task with no due date', () => {
    expect(
      expiryDeadline(
        rule({ type: 'DAILY' }),
        { scheduledFor: SUNDAY, dueAt: null },
        BERLIN,
      )?.toISOString(),
    ).toBe('2026-08-31T04:00:00.000Z');
  });

  it('never expires an ad-hoc task with no due date — intended (OQ-4)', () => {
    expect(
      expiryDeadline(rule({ type: 'MANUAL' }), { scheduledFor: SUNDAY, dueAt: null }, BERLIN),
    ).toBeNull();
    expect(
      expiryDeadline(rule({ type: 'ONCE' }), { scheduledFor: SUNDAY, dueAt: null }, BERLIN),
    ).toBeNull();
  });
});
