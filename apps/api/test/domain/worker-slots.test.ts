/**
 * Multi-worker-task slot arithmetic (Phase 1 of
 * .planning/campaigns/multi-worker-tasks.md).
 */

import { describe, expect, it } from 'vitest';

import { WorkerCountMode } from '@haushaltsauktion/shared';

import {
  maxAllowed,
  minRequired,
  slotOutcome,
} from '../../src/domain/task/worker-slots.js';

describe('minRequired', () => {
  it('EXACTLY(n) requires exactly n', () => {
    expect(minRequired(WorkerCountMode.EXACTLY, 1)).toBe(1);
    expect(minRequired(WorkerCountMode.EXACTLY, 3)).toBe(3);
  });

  it('AT_LEAST(n) requires exactly n as the floor', () => {
    expect(minRequired(WorkerCountMode.AT_LEAST, 1)).toBe(1);
    expect(minRequired(WorkerCountMode.AT_LEAST, 4)).toBe(4);
  });

  it('AT_MOST(n) floors at 1 regardless of n — a task is never "done" with zero workers', () => {
    expect(minRequired(WorkerCountMode.AT_MOST, 5)).toBe(1);
    expect(minRequired(WorkerCountMode.AT_MOST, 1)).toBe(1);
  });

  it('EXACTLY(1) degenerates to today\'s single-slot behavior: min = 1', () => {
    expect(minRequired(WorkerCountMode.EXACTLY, 1)).toBe(1);
  });
});

describe('maxAllowed', () => {
  it('EXACTLY(n) allows exactly n', () => {
    expect(maxAllowed(WorkerCountMode.EXACTLY, 1)).toBe(1);
    expect(maxAllowed(WorkerCountMode.EXACTLY, 3)).toBe(3);
  });

  it('AT_LEAST(n) is unbounded — the trait that distinguishes it from EXACTLY', () => {
    expect(maxAllowed(WorkerCountMode.AT_LEAST, 1)).toBe(Infinity);
    expect(maxAllowed(WorkerCountMode.AT_LEAST, 10)).toBe(Infinity);
  });

  it('AT_MOST(n) allows exactly n', () => {
    expect(maxAllowed(WorkerCountMode.AT_MOST, 5)).toBe(5);
    expect(maxAllowed(WorkerCountMode.AT_MOST, 1)).toBe(1);
  });

  it('EXACTLY(1) degenerates to today\'s single-slot behavior: max = 1', () => {
    expect(maxAllowed(WorkerCountMode.EXACTLY, 1)).toBe(1);
  });
});

describe('minRequired/maxAllowed together — EXACTLY(1) is min = max = 1', () => {
  it('reproduces today\'s single-worker guarantee exactly', () => {
    expect(minRequired(WorkerCountMode.EXACTLY, 1)).toBe(1);
    expect(maxAllowed(WorkerCountMode.EXACTLY, 1)).toBe(1);
  });
});

describe('slotOutcome', () => {
  it('JOIN increments the active slot count', () => {
    const result = slotOutcome({ event: 'JOIN', activeSlotCount: 0, min: 1, max: 1 });
    expect(result.nextActiveSlotCount).toBe(1);
  });

  it('LEAVE decrements the active slot count', () => {
    const result = slotOutcome({ event: 'LEAVE', activeSlotCount: 1, min: 1, max: 1 });
    expect(result.nextActiveSlotCount).toBe(0);
  });

  it('isFull is true once a JOIN reaches max (EXACTLY(1) single-slot case)', () => {
    const result = slotOutcome({ event: 'JOIN', activeSlotCount: 0, min: 1, max: 1 });
    expect(result.isFull).toBe(true);
  });

  it('isFull is false while a JOIN stays below max', () => {
    const result = slotOutcome({ event: 'JOIN', activeSlotCount: 0, min: 2, max: 3 });
    expect(result.isFull).toBe(false);
  });

  it('isFull is false for AT_LEAST\'s unbounded max, no matter how many joined', () => {
    const result = slotOutcome({ event: 'JOIN', activeSlotCount: 99, min: 1, max: Infinity });
    expect(result.isFull).toBe(false);
  });

  it('isBelowMin is true once a LEAVE drops below min (EXACTLY(1) single-slot case)', () => {
    const result = slotOutcome({ event: 'LEAVE', activeSlotCount: 1, min: 1, max: 1 });
    expect(result.isBelowMin).toBe(true);
  });

  it('isBelowMin is false while a LEAVE stays at or above min', () => {
    const result = slotOutcome({ event: 'LEAVE', activeSlotCount: 3, min: 2, max: 3 });
    expect(result.isBelowMin).toBe(false);
    expect(result.nextActiveSlotCount).toBe(2);
  });

  it('a JOIN can satisfy min without yet being full (AT_LEAST(2) case)', () => {
    const result = slotOutcome({ event: 'JOIN', activeSlotCount: 1, min: 2, max: Infinity });
    expect(result.isBelowMin).toBe(false);
    expect(result.isFull).toBe(false);
  });

  it('a LEAVE can drop below min while still above zero (AT_LEAST(2), one of two leaves)', () => {
    const result = slotOutcome({ event: 'LEAVE', activeSlotCount: 2, min: 2, max: Infinity });
    expect(result.isBelowMin).toBe(true);
    expect(result.nextActiveSlotCount).toBe(1);
  });
});
