/**
 * Daily completion streak arithmetic (intake "daily-completion-streak-bonus",
 * CLAUDE.md §16, §44).
 *
 * Mirrors `task/value.ts`'s shape: pure, no Prisma, no `Date`, no
 * `Math.random`. Callers pass in the household-local civil day
 * ("YYYY-MM-DD", `dayKey()` from `@haushaltsauktion/shared`) so this module
 * never has to resolve a timezone itself — the caller already did, the same
 * way `voluntaryReward` never resolves `ON_ACCEPT` vs `ON_COMPLETE` itself.
 *
 * **The rules, in one place:**
 *  - A calendar day (household timezone) with >= 1 completion of *any* kind
 *    extends or keeps alive the streak. A day with none breaks it to zero —
 *    but there is no event for "nothing happened", so that half is detected
 *    after the fact by the idle sweep (`app/streak/runStreakSweep.ts`),
 *    using `isStreakStale` below.
 *  - A day's bonus posts only on that day's `VOLUNTARY` completion(s), and at
 *    most once per day: `state.bonusPaidDate` is the guard, distinct from the
 *    `streak:<assignmentId>` idempotency key `completeTask.ts` uses to guard
 *    a *retried* request for the *same* assignment.
 *  - `kind === VOLUNTARY` is tested before any configuration is read, the
 *    same discipline `voluntaryReward` uses for §7/§44: no admin setting can
 *    make a `RANDOM` completion pay.
 *  - A `0` result means **no ledger row** (§4.5's "absence, not a zero-amount
 *    entry"), exactly like `voluntaryReward`'s day-1 case.
 */

import {
  AssignmentKind,
  civilDaysBetween,
  parseCivilDateKey,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

export interface StreakState {
  length: number;
  /** "YYYY-MM-DD", household-local — the last day with >= 1 standing completion. */
  lastActiveDate: string | null;
  /** "YYYY-MM-DD" — the day a `STREAK_BONUS` was last posted, or `null`. */
  bonusPaidDate: string | null;
}

/** The state of a member who has never completed anything, or whose streak just broke. */
export const ZERO_STREAK: StreakState = Object.freeze({
  length: 0,
  lastActiveDate: null,
  bonusPaidDate: null,
});

export interface StreakCompletionInput {
  kind: AssignmentKind;
  /** "YYYY-MM-DD", household-local civil day this completion falls on. */
  today: string;
}

export interface StreakCompletionResult {
  nextState: StreakState;
  /** Amount to post as `STREAK_BONUS`. `0` means: post nothing at all. */
  bonusAmount: number;
}

/** `floor(baseRate * length)`, never negative. The formula and nothing else. */
export function streakBonusFor(cfg: HouseholdConfig, length: number): number {
  if (!cfg.streak.enabled) return 0;
  return Math.max(0, Math.floor(cfg.streak.baseRate * length));
}

/**
 * Applies one completion to a member's streak state.
 *
 * Idempotent in the sense that matters: calling it twice for the same
 * `(state, input)` pair yields the same `nextState` and `bonusAmount` both
 * times (it is a pure reducer) — the caller (`completeTask.ts`) is what
 * guards against actually posting the resulting ledger row twice.
 */
export function applyCompletionToStreak(
  cfg: HouseholdConfig,
  state: StreakState,
  input: StreakCompletionInput,
): StreakCompletionResult {
  // The household-level switch pauses the whole mechanism, not just the
  // payment: state neither advances nor breaks while it is off, so turning it
  // back on later resumes exactly where it left off rather than replaying a
  // burst of untracked days as a sudden jump.
  if (!cfg.streak.enabled) {
    return { nextState: state, bonusAmount: 0 };
  }

  const alreadyActiveToday = state.lastActiveDate === input.today;

  let nextLength: number;
  if (alreadyActiveToday) {
    // A second (or third...) completion the same day neither extends nor
    // resets the streak — the day is already counted.
    nextLength = state.length;
  } else {
    const consecutive =
      state.lastActiveDate !== null &&
      civilDaysBetween(parseCivilDateKey(state.lastActiveDate), parseCivilDateKey(input.today)) === 1;
    // A gap of exactly one day extends the streak; anything else (never
    // active, or a missed day) starts a fresh one at length 1.
    nextLength = consecutive ? state.length + 1 : 1;
  }

  let bonusAmount = 0;
  let bonusPaidDate = state.bonusPaidDate;
  if (input.kind === AssignmentKind.VOLUNTARY && state.bonusPaidDate !== input.today) {
    bonusAmount = streakBonusFor(cfg, nextLength);
    // Day 1 pays 0 by construction — leave bonusPaidDate untouched so it
    // stays a true "no row was posted" absence, matching §4.5.
    if (bonusAmount > 0) bonusPaidDate = input.today;
  }

  return {
    nextState: { length: nextLength, lastActiveDate: input.today, bonusPaidDate },
    bonusAmount,
  };
}

/**
 * Clears a pending bonus-paid marker for exactly `day`, leaving everything
 * else untouched. Used by the clawback path: reversing a `STREAK_BONUS`
 * transaction must let a later completion on the *same* day pay again,
 * without touching a `bonusPaidDate` that belongs to some other (unrelated,
 * more recent) day.
 */
export function clearBonusForDay(state: StreakState, day: string): StreakState {
  if (state.bonusPaidDate !== day) return state;
  return { ...state, bonusPaidDate: null };
}

/**
 * True once a full idle day has passed since `lastActiveDate`, evaluated as
 * of household-local `today` (`isStreakStale('2026-09-01', '2026-09-02')` is
 * `false` — yesterday's activity still covers "so far"; `'2026-09-03'` is
 * `true` — a whole day, 09-02, passed with zero completions).
 */
export function isStreakStale(lastActiveDate: string, today: string): boolean {
  return civilDaysBetween(parseCivilDateKey(lastActiveDate), parseCivilDateKey(today)) > 1;
}
