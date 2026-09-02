/**
 * The streak idle-day sweep (intake "daily-completion-streak-bonus").
 *
 * There is no task event for "a day ended with zero completions" — a
 * completion *extends* the streak, but nothing ever fires when a day simply
 * passes without one. This is the only place that side of the rule is
 * enforced, on a schedule rather than an event, in the household's own
 * timezone (mirroring how `weekKey()` resolves the household-local week
 * boundary in `packages/shared/src/time/week.ts`).
 *
 * Deliberately much simpler than `runAssignmentSweep.ts`: there is no
 * cross-row aggregate to protect (no weekly cap, no fairness counter), so
 * there is nothing here that needs the level-0 advisory lock — the per-member
 * row lock (`lockMember`, level 3) is the whole story. A day is "stale"
 * per `isStreakStale` exactly when a *full* idle day has elapsed; a member
 * who was active yesterday (or today) is left alone, so the sweep can run as
 * often as it likes without ever breaking a streak early.
 */

import { dayKey } from '@haushaltsauktion/shared';

import { isStreakStale } from '../../domain/streak/streak.js';
import type { Deps } from '../deps.js';
import { lockMember, withTransaction } from '../tx.js';

export interface StreakSweepInput {
  householdId: string;
}

export interface StreakSweepReport {
  checked: number;
  broken: number;
}

export async function runStreakSweep(
  deps: Deps,
  input: StreakSweepInput,
): Promise<StreakSweepReport> {
  const now = deps.clock.now();
  const report: StreakSweepReport = { checked: 0, broken: 0 };

  const household = await deps.db.household.findUnique({
    where: { id: input.householdId },
    select: { timezone: true },
  });
  if (household === null) return report;
  const today = dayKey(now, household.timezone);

  // An unlocked scan for *candidates* only — never the decision itself. Every
  // actual break is re-checked under the member's own row lock below, so a
  // completion racing in between cannot be lost.
  const candidates = await deps.db.householdMember.findMany({
    where: { householdId: input.householdId, streakLength: { gt: 0 } },
    select: { id: true },
  });

  for (const candidate of candidates) {
    report.checked += 1;
    await withTransaction(deps, async (tx) => {
      const locked = await lockMember(tx, input.householdId, candidate.id);
      if (locked === null || locked.streakLastActiveDate === null) return;
      if (!isStreakStale(locked.streakLastActiveDate, today)) return;

      await tx.householdMember.updateMany({
        where: { id: candidate.id, householdId: input.householdId },
        data: { streakLength: 0, streakLastActiveDate: null, streakBonusPaidDate: null },
      });
      report.broken += 1;
    });
  }

  return report;
}
