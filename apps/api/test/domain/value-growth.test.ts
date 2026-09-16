/**
 * Intake "time-based-value-growth" + "single-random-assignment".
 *
 * The pure half: what an instance is worth after sitting on the market, and
 * that the clock cannot run the value backwards, lose time, or sail past the
 * configured ceiling.
 */

import { describe, expect, it } from 'vitest';

import { cloneDefaultConfig, DEFAULT_CONFIG, type HouseholdConfig } from '@haushaltsauktion/shared';

import { grownValue } from '../../src/domain/task/value.js';

const patch = (mutate: (c: HouseholdConfig) => void): HouseholdConfig => {
  const c = cloneDefaultConfig();
  mutate(c);
  return c;
};

const T0 = new Date('2026-09-16T08:00:00.000Z');
const hoursLater = (h: number): Date => new Date(T0.getTime() + h * 3_600_000);

describe('defaults', () => {
  it('ships enabled at +1 point per hour', () => {
    expect(DEFAULT_CONFIG.valueGrowth).toEqual({
      enabled: true,
      pointsPerInterval: 1,
      intervalMinutes: 60,
    });
  });

  it('conscripts an instance exactly once by default', () => {
    expect(DEFAULT_CONFIG.assignment.maxRandomAssignmentsPerInstance).toBe(1);
  });
});

describe('growth over time', () => {
  const cfg = DEFAULT_CONFIG;

  it('credits nothing before the first whole interval has passed', () => {
    for (const minutes of [0, 1, 30, 59]) {
      const step = grownValue(cfg, {
        currentValue: 4,
        anchor: T0,
        now: new Date(T0.getTime() + minutes * 60_000),
      });
      expect(step).toEqual({ value: 4, steps: 0, anchor: T0, capped: false });
    }
  });

  it('credits one point per elapsed hour', () => {
    expect(grownValue(cfg, { currentValue: 4, anchor: T0, now: hoursLater(1) }).value).toBe(5);
    expect(grownValue(cfg, { currentValue: 4, anchor: T0, now: hoursLater(8) }).value).toBe(12);
  });

  it('carries the unfinished remainder instead of resetting the clock to now', () => {
    // 90 minutes in: one point owed, and the extra 30 minutes must survive —
    // otherwise an off-beat sweep makes growth permanently slower than
    // configured.
    const step = grownValue(cfg, {
      currentValue: 4,
      anchor: T0,
      now: new Date(T0.getTime() + 90 * 60_000),
    });
    expect(step.value).toBe(5);
    expect(step.steps).toBe(1);
    expect(step.anchor).toEqual(hoursLater(1));

    // 30 minutes later the second hour completes, on the original beat.
    const next = grownValue(cfg, {
      currentValue: step.value,
      anchor: step.anchor,
      now: hoursLater(2),
    });
    expect(next.value).toBe(6);
  });

  it('credits every missed interval after a sweep outage', () => {
    const step = grownValue(cfg, { currentValue: 4, anchor: T0, now: hoursLater(50) });
    expect(step.value).toBe(54);
    expect(step.steps).toBe(50);
  });

  it('never runs backwards when the anchor is in the future', () => {
    const step = grownValue(cfg, { currentValue: 7, anchor: hoursLater(5), now: T0 });
    expect(step).toEqual({ value: 7, steps: 0, anchor: hoursLater(5), capped: false });
  });

  it('is inert when disabled', () => {
    const off = patch((c) => {
      c.valueGrowth.enabled = false;
    });
    expect(grownValue(off, { currentValue: 4, anchor: T0, now: hoursLater(99) })).toEqual({
      value: 4,
      steps: 0,
      anchor: T0,
      capped: false,
    });
  });

  it('honours a custom rate and interval', () => {
    const fast = patch((c) => {
      c.valueGrowth.pointsPerInterval = 3;
      c.valueGrowth.intervalMinutes = 30;
    });
    // 2 hours = 4 half-hour intervals = +12
    expect(grownValue(fast, { currentValue: 4, anchor: T0, now: hoursLater(2) }).value).toBe(16);
  });
});

describe('the shared ceiling (valueIncrease.maximumValue)', () => {
  const capped = patch((c) => {
    c.valueIncrease.maximumValue = 10;
  });

  it('stops exactly at the cap rather than overshooting', () => {
    const step = grownValue(capped, { currentValue: 4, anchor: T0, now: hoursLater(20) });
    expect(step.value).toBe(10);
    expect(step.capped).toBe(true);
  });

  it('credits nothing once already at the cap, but still consumes the time', () => {
    const step = grownValue(capped, { currentValue: 10, anchor: T0, now: hoursLater(3) });
    expect(step.value).toBe(10);
    expect(step.capped).toBe(true);
    // The anchor still advances so the caller can retire the instance from the
    // growth query instead of re-examining it every interval forever.
    expect(step.anchor).toEqual(hoursLater(3));
  });

  it('does not flag capped while still below the ceiling', () => {
    const step = grownValue(capped, { currentValue: 4, anchor: T0, now: hoursLater(2) });
    expect(step.value).toBe(6);
    expect(step.capped).toBe(false);
  });

  it('grows without limit when no cap is configured', () => {
    expect(DEFAULT_CONFIG.valueIncrease.maximumValue).toBeNull();
    const step = grownValue(DEFAULT_CONFIG, { currentValue: 4, anchor: T0, now: hoursLater(500) });
    expect(step.value).toBe(504);
    expect(step.capped).toBe(false);
  });
});
