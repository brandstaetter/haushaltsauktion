/**
 * Daily completion streak (intake "daily-completion-streak-bonus").
 *
 * Mirrors `economy.test.ts`'s style: pure domain functions, exercised against
 * the real `TestLedger` so a test that gets the right numbers by writing an
 * illegal ledger row still fails `verifyLedgerIntegrity`.
 */

import { describe, expect, it } from 'vitest';

import {
  AssignmentKind,
  DEFAULT_CONFIG,
  PointTransactionType,
  cloneDefaultConfig,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import {
  applyCompletionToStreak,
  clearBonusForDay,
  isStreakStale,
  streakBonusFor,
  ZERO_STREAK,
  type StreakState,
} from '../../src/domain/streak/streak.js';
import { TestLedger } from './_ledger.js';

const cfg = DEFAULT_CONFIG;
const ANNA = 'member-anna';

const patch = (mutate: (c: HouseholdConfig) => void): HouseholdConfig => {
  const next = cloneDefaultConfig();
  mutate(next);
  return next;
};

const DAY = (n: number): string => `2026-09-${String(n).padStart(2, '0')}`;

describe('streakBonusFor — floor(baseRate * length)', () => {
  it('matches the expected payout sequence across lengths 1..6 (0.5 default rate)', () => {
    const payouts = [1, 2, 3, 4, 5, 6].map((length) => streakBonusFor(cfg, length));
    expect(payouts).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('is 0 while the mechanism is disabled, whatever the length', () => {
    const disabled = patch((c) => (c.streak.enabled = false));
    expect(streakBonusFor(disabled, 10)).toBe(0);
  });

  it('never goes negative even for a hostile rate', () => {
    // Rate is validated `>= 0` at the config-schema layer; this is a defensive
    // floor at the arithmetic layer regardless.
    expect(streakBonusFor(patch((c) => (c.streak.baseRate = 0)), 10)).toBe(0);
  });
});

describe('applyCompletionToStreak — day 1 through day 6, all VOLUNTARY', () => {
  it('extends the streak one day at a time and pays exactly the formula', () => {
    let state: StreakState = ZERO_STREAK;
    const payouts: number[] = [];
    for (let day = 1; day <= 6; day += 1) {
      const outcome = applyCompletionToStreak(cfg, state, {
        kind: AssignmentKind.VOLUNTARY,
        today: DAY(day),
      });
      state = outcome.nextState;
      payouts.push(outcome.bonusAmount);
      expect(state.length).toBe(day);
    }
    // §35-style acceptance criterion: 0, 1, 1, 2, 2, 3.
    expect(payouts).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('posts NO ledger row on day 1 (§4.5 — absence, not a zero-amount entry)', () => {
    const ledger = new TestLedger();
    const outcome = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    });
    expect(outcome.bonusAmount).toBe(0);
    if (outcome.bonusAmount > 0) {
      ledger.post({
        memberId: ANNA,
        amount: outcome.bonusAmount,
        type: PointTransactionType.STREAK_BONUS,
        taskAssignmentId: 'a1',
        assignmentKind: AssignmentKind.VOLUNTARY,
      });
    }
    expect(ledger.count()).toBe(0);
  });

  it('posts a real, ledger-verified row from day 2 onward', () => {
    const ledger = new TestLedger();
    let state: StreakState = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    }).nextState;

    const outcome = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(2),
    });
    state = outcome.nextState;
    expect(outcome.bonusAmount).toBe(1); // floor(0.5 * 2)

    ledger.post({
      memberId: ANNA,
      amount: outcome.bonusAmount,
      type: PointTransactionType.STREAK_BONUS,
      taskAssignmentId: 'a2',
      assignmentKind: AssignmentKind.VOLUNTARY,
    });
    expect(ledger.balanceOf(ANNA)).toBe(1);
    expect(ledger.verify([ANNA]).ok).toBe(true);
  });

  it('refuses to post a streak bonus against a RANDOM assignment even if asked directly (§44)', () => {
    const ledger = new TestLedger();
    expect(() =>
      ledger.post({
        memberId: ANNA,
        amount: 3,
        type: PointTransactionType.STREAK_BONUS,
        taskAssignmentId: 'a1',
        assignmentKind: AssignmentKind.RANDOM,
      }),
    ).toThrow();
    expect(ledger.count()).toBe(0);
  });
});

describe('a random-only day', () => {
  it('extends the streak without ever posting a transaction (§7/§44)', () => {
    let state: StreakState = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    }).nextState;
    state = applyCompletionToStreak(cfg, state, { kind: AssignmentKind.VOLUNTARY, today: DAY(2) })
      .nextState;
    expect(state.length).toBe(2);

    const randomDay = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.RANDOM,
      today: DAY(3),
    });
    expect(randomDay.bonusAmount).toBe(0);
    expect(randomDay.nextState.length).toBe(3); // kept alive
    expect(randomDay.nextState.lastActiveDate).toBe(DAY(3));
    expect(randomDay.nextState.bonusPaidDate).toBe(state.bonusPaidDate); // unchanged

    // ...and a VOLUNTARY completion the very next day resumes paying, at the
    // length the random day already advanced it to.
    const nextDay = applyCompletionToStreak(cfg, randomDay.nextState, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(4),
    });
    expect(nextDay.bonusAmount).toBe(2); // floor(0.5 * 4)
  });

  it('cannot be switched on by any combination of configuration (§5.4)', () => {
    for (const enabled of [true, false]) {
      for (const baseRate of [0, 0.5, 1, 5]) {
        const hostile = patch((c) => {
          c.streak.enabled = enabled;
          c.streak.baseRate = baseRate;
        });
        const outcome = applyCompletionToStreak(hostile, { length: 4, lastActiveDate: DAY(3), bonusPaidDate: null }, {
          kind: AssignmentKind.RANDOM,
          today: DAY(4),
        });
        expect(outcome.bonusAmount).toBe(0);
      }
    }
  });
});

describe('at most one payment per household-local day', () => {
  it('a second VOLUNTARY completion the same day pays nothing more', () => {
    let state: StreakState = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    }).nextState;
    const first = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(2),
    });
    state = first.nextState;
    expect(first.bonusAmount).toBe(1);

    const second = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(2),
    });
    expect(second.bonusAmount).toBe(0); // already paid for DAY(2)
    expect(second.nextState.length).toBe(state.length); // day already counted
  });

  it('a RANDOM completion first, then a VOLUNTARY one, still pays once that day', () => {
    let state: StreakState = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    }).nextState;
    state = applyCompletionToStreak(cfg, state, { kind: AssignmentKind.VOLUNTARY, today: DAY(2) })
      .nextState; // length 2

    const randomFirst = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.RANDOM,
      today: DAY(3),
    });
    expect(randomFirst.bonusAmount).toBe(0);
    expect(randomFirst.nextState.length).toBe(3);

    const voluntarySecond = applyCompletionToStreak(cfg, randomFirst.nextState, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(3),
    });
    expect(voluntarySecond.bonusAmount).toBe(1); // floor(0.5 * 3)
    expect(voluntarySecond.nextState.length).toBe(3); // unchanged — same day

    // A third completion that same day pays nothing further.
    const third = applyCompletionToStreak(cfg, voluntarySecond.nextState, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(3),
    });
    expect(third.bonusAmount).toBe(0);
  });
});

describe('a missed day breaks the streak (once detected)', () => {
  it('restarts at length 1 when the gap is more than one day', () => {
    let state: StreakState = applyCompletionToStreak(cfg, ZERO_STREAK, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(1),
    }).nextState;
    state = applyCompletionToStreak(cfg, state, { kind: AssignmentKind.VOLUNTARY, today: DAY(2) })
      .nextState;
    expect(state.length).toBe(2);

    // DAY(3) never happened — the next completion is DAY(5).
    const outcome = applyCompletionToStreak(cfg, state, {
      kind: AssignmentKind.VOLUNTARY,
      today: DAY(5),
    });
    expect(outcome.nextState.length).toBe(1);
    expect(outcome.bonusAmount).toBe(0); // day 1 of the new streak
  });
});

describe('clearBonusForDay', () => {
  it('clears only when the marker matches the given day', () => {
    const state: StreakState = { length: 4, lastActiveDate: DAY(4), bonusPaidDate: DAY(4) };
    expect(clearBonusForDay(state, DAY(4))).toEqual({ ...state, bonusPaidDate: null });
    // A marker for a different (unrelated, more recent) day is left alone —
    // a stale rejection must not unlock a day it has nothing to do with.
    expect(clearBonusForDay(state, DAY(3))).toEqual(state);
  });

  it('is a no-op once already null', () => {
    const state: StreakState = { length: 4, lastActiveDate: DAY(4), bonusPaidDate: null };
    expect(clearBonusForDay(state, DAY(4))).toEqual(state);
  });
});

describe('isStreakStale — the idle-sweep predicate', () => {
  it('is false the same day and the day right after', () => {
    expect(isStreakStale(DAY(1), DAY(1))).toBe(false);
    expect(isStreakStale(DAY(1), DAY(2))).toBe(false);
  });

  it('is true once a full idle day has passed', () => {
    expect(isStreakStale(DAY(1), DAY(3))).toBe(true);
    expect(isStreakStale(DAY(1), DAY(10))).toBe(true);
  });
});
