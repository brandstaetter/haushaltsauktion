/**
 * §2.4 — the legality matrix.
 *
 * The point of these tests is that the table and the matrix in the architecture
 * cannot drift apart: 7 states × 13 events = 91 pairs, 21 legal, 70 illegal,
 * and every one of the 70 must throw.
 */

import { describe, expect, it } from 'vitest';

import { TaskStatus } from '@haushaltsauktion/shared';

import { IllegalTransitionError } from '../../src/domain/errors.js';
import {
  ALL_TASK_EVENTS,
  ALL_TASK_STATUSES,
  TRANSITIONS,
  TaskEvent,
  illegalPairs,
  isLegal,
  isTerminal,
  legalEvents,
  resolve,
  targetOf,
} from '../../src/domain/task/state-machine.js';

describe('the transition table (§2.2)', () => {
  it('covers exactly 7 states and 13 events', () => {
    expect(ALL_TASK_STATUSES).toHaveLength(7);
    expect(ALL_TASK_EVENTS).toHaveLength(13);
  });

  it('declares exactly 21 legal transitions, leaving 70 illegal', () => {
    expect(TRANSITIONS).toHaveLength(21);
    expect(illegalPairs()).toHaveLength(70);
    expect(ALL_TASK_STATUSES.length * ALL_TASK_EVENTS.length).toBe(91);
  });

  it('contains no duplicate (from, event) pair', () => {
    const keys = TRANSITIONS.map((t) => `${t.from}|${t.event}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves each documented transition to its documented target', () => {
    expect(resolve(TaskStatus.DRAFT, TaskEvent.PUBLISH)).toBe(TaskStatus.AVAILABLE);
    expect(resolve(TaskStatus.AVAILABLE, TaskEvent.VOLUNTEER)).toBe(TaskStatus.ASSIGNED);
    expect(resolve(TaskStatus.AVAILABLE, TaskEvent.ASSIGN_RANDOM)).toBe(TaskStatus.ASSIGNED);
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.COMPLETE)).toBe(TaskStatus.COMPLETED);
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.BUYOUT)).toBe(TaskStatus.AVAILABLE);
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.RELEASE)).toBe(TaskStatus.AVAILABLE);
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.REVOKE)).toBe(TaskStatus.AVAILABLE);
    expect(resolve(TaskStatus.PAUSED, TaskEvent.RESUME)).toBe(TaskStatus.AVAILABLE);
    expect(resolve(TaskStatus.COMPLETED, TaskEvent.REOPEN_TO_ASSIGNEE)).toBe(TaskStatus.ASSIGNED);
    expect(resolve(TaskStatus.COMPLETED, TaskEvent.REOPEN_TO_MARKET)).toBe(TaskStatus.AVAILABLE);
  });
});

describe('illegal transitions (§2.4)', () => {
  it('throws IllegalTransitionError for every one of the 70 illegal pairs', () => {
    for (const { from, event } of illegalPairs()) {
      expect(() => resolve(from, event), `${from} + ${event}`).toThrow(IllegalTransitionError);
      expect(isLegal(from, event)).toBe(false);
      expect(targetOf(from, event)).toBeUndefined();
    }
  });

  it('reports what IS possible, not only what failed', () => {
    try {
      resolve(TaskStatus.AVAILABLE, TaskEvent.COMPLETE);
      expect.unreachable('COMPLETE is not legal from AVAILABLE');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalTransitionError);
      const failure = error as IllegalTransitionError;
      expect(failure.code).toBe('ILLEGAL_TRANSITION');
      expect(failure.from).toBe(TaskStatus.AVAILABLE);
      expect(failure.allowedEvents).toContain(TaskEvent.VOLUNTEER);
      expect(failure.allowedEvents).not.toContain(TaskEvent.COMPLETE);
      expect(failure.details).toMatchObject({ from: 'AVAILABLE', event: 'COMPLETE' });
    }
  });
});

describe('terminal states (§2.1)', () => {
  const terminal = [TaskStatus.CANCELLED, TaskStatus.EXPIRED];

  it('accepts no event at all — that is what makes them terminal', () => {
    for (const status of terminal) {
      expect(isTerminal(status), status).toBe(true);
      expect(legalEvents(status)).toEqual([]);
      for (const event of ALL_TASK_EVENTS) {
        expect(() => resolve(status, event), `${status} + ${event}`).toThrow(
          IllegalTransitionError,
        );
      }
    }
  });

  it('treats no other state as terminal', () => {
    for (const status of ALL_TASK_STATUSES) {
      if (!terminal.includes(status as (typeof terminal)[number])) {
        expect(isTerminal(status), status).toBe(false);
      }
    }
  });

  it('never reopens a COMPLETED task through an ordinary event — only an admin\'s explicit rejection can, and only through REOPEN_TO_ASSIGNEE / REOPEN_TO_MARKET', () => {
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.PUBLISH)).toBe(false);
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.RESUME)).toBe(false);
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.VOLUNTEER)).toBe(false);
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.ASSIGN_RANDOM)).toBe(false);
    // The two admin-only exceptions, deliberately narrow.
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.REOPEN_TO_ASSIGNEE)).toBe(true);
    expect(isLegal(TaskStatus.COMPLETED, TaskEvent.REOPEN_TO_MARKET)).toBe(true);
  });
});

describe('the matrix row by row (§2.4)', () => {
  // Transcribed from the architecture's table. If either side changes, this
  // fails — which is the entire point of writing it out twice.
  const matrix: Record<string, string[]> = {
    DRAFT: ['PUBLISH', 'PAUSE', 'CANCEL', 'EXPIRE'],
    AVAILABLE: ['VOLUNTEER', 'ASSIGN_RANDOM', 'PAUSE', 'CANCEL', 'EXPIRE'],
    ASSIGNED: ['COMPLETE', 'BUYOUT', 'RELEASE', 'REVOKE', 'PAUSE', 'CANCEL', 'EXPIRE'],
    PAUSED: ['RESUME', 'CANCEL', 'EXPIRE'],
    COMPLETED: ['REOPEN_TO_ASSIGNEE', 'REOPEN_TO_MARKET'],
    CANCELLED: [],
    EXPIRED: [],
  };

  for (const [from, expected] of Object.entries(matrix)) {
    it(`${from} allows exactly ${expected.length} event(s)`, () => {
      expect([...legalEvents(from as TaskStatus)].sort()).toEqual([...expected].sort());
    });
  }
});

describe('ACCEPT is deliberately not an instance event (OQ-3)', () => {
  it('is absent from the event vocabulary', () => {
    // Acceptance sets TaskAssignment.response; it does not move the instance,
    // which is what keeps the matrix at 91 pairs instead of 98.
    expect(ALL_TASK_EVENTS).not.toContain('ACCEPT');
  });
});
