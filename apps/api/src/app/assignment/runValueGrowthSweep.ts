/**
 * The value-growth sweep — intake "time-based-value-growth".
 *
 * While an instance sits `AVAILABLE`, its value climbs with the clock. This is
 * the mechanism that replaces repeated conscription: once
 * `assignment.maxRandomAssignmentsPerInstance` is spent, a rising price is the
 * only thing left that gets an unloved chore done.
 *
 * **Materialised, not derived.** The new value is written to
 * `TaskInstance.currentValue` rather than computed at read time, because that
 * column is what every other rule already reads — buyout cost
 * (`CURRENT_TASK_VALUE`), the voluntary reward, the DTOs, the ledger. Deriving
 * it would mean teaching all of them the same arithmetic and leaving a stale
 * number in the database for anyone who looked directly. The price is that the
 * value is only as fresh as the last sweep tick, which at an hourly growth
 * rate is not a price at all.
 *
 * Runs as the first phase of `runAssignmentSweep`, before the random draw, so
 * a task conscripted in this same tick is conscripted at its grown value.
 *
 * One instance per transaction under the same level-0 advisory lock as the
 * rest of the sweep (§4.2) — the growth write and the random draw must not
 * interleave on one instance.
 */

import { grownValue, growthNotificationBand } from '../../domain/task/value.js';
import { loadCurrentConfig } from '../config/load.js';
import type { Deps } from '../deps.js';
import { acquireSweepLock, lockInstance, withTransaction } from '../tx.js';

export interface ValueGrowthReport {
  /** Instances whose `currentValue` actually rose this run. */
  grown: number;
  /** Total points added across all of them — what the household "spent" on patience. */
  pointsAdded: number;
  /** Instances that reached `valueIncrease.maximumValue` and stopped growing. */
  capped: number;
  /** `AVAILABLE` instances that had no anchor yet and got one (no value change). */
  seeded: number;
  /**
   * §24: growth steps that crossed a notification band and told the household.
   * Far smaller than `grown` by design — see `valueGrowth.notifyAfterPoints`.
   */
  notified: number;
}

export function emptyValueGrowthReport(): ValueGrowthReport {
  return { grown: 0, pointsAdded: 0, capped: 0, seeded: 0, notified: 0 };
}

export async function runValueGrowthSweep(
  deps: Deps,
  input: { householdId: string; now: Date; dryRun?: boolean | undefined },
): Promise<ValueGrowthReport> {
  const report = emptyValueGrowthReport();

  // Cheap pre-filter: only AVAILABLE rows can grow, and a NULL anchor means
  // either "never seen" (seed it) or "finished growing at the cap" — the
  // difference is decided inside the transaction, where the config is known.
  const candidates = await deps.db.taskInstance.findMany({
    where: { householdId: input.householdId, status: 'AVAILABLE' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (candidates.length === 0) return report;

  for (const candidate of candidates) {
    const outcome = await withTransaction(deps, async (tx) => {
      await acquireSweepLock(tx, input.householdId);
      const instance = await lockInstance(tx, input.householdId, candidate.id);
      // Re-checked under the lock: the random draw or a volunteer may have
      // taken this instance off the market since the query above.
      if (instance === null || instance.status !== 'AVAILABLE') return null;

      const { config } = await loadCurrentConfig(tx, input.householdId);
      if (!config.valueGrowth.enabled) return null;

      // No anchor yet: an instance that entered AVAILABLE before this feature
      // existed, or one whose growth already finished at the cap. Seeding at
      // `now` is what makes the migration need no backfill — nobody is
      // retroactively paid for time the household never promised.
      if (instance.valueGrowthAt === null) {
        const cap = config.valueIncrease.maximumValue;
        // Already at the ceiling: leave the anchor NULL so this instance stays
        // out of the sweep entirely rather than being re-seeded every tick.
        if (cap !== null && instance.currentValue >= cap) return null;
        if (input.dryRun !== true) {
          // `updateMany` rather than `update`: Architektur §3.2 requires
          // householdId as a predicate on every household-scoped query, which
          // Prisma's `update` cannot express (it takes a unique where).
          await tx.taskInstance.updateMany({
            where: { id: instance.id, householdId: input.householdId },
            // No `version` bump: seeding an anchor changes nothing a client
            // can see, so it must not invalidate anyone's ETag.
            data: { valueGrowthAt: input.now },
          });
        }
        return { seeded: true as const };
      }

      const step = grownValue(config, {
        currentValue: instance.currentValue,
        anchor: instance.valueGrowthAt,
        now: input.now,
      });
      if (step.steps === 0) return null;

      const added = step.value - instance.currentValue;
      // §24 "Wert einer Aufgabe ist gestiegen". Deliberately NOT one message
      // per step: at the default rate that would be an hourly ping per open
      // chore for every member. `growthNotificationBand` fires only when the
      // value crosses `baseValue + n * notifyAfterPoints`.
      const band = growthNotificationBand(config, {
        baseValue: instance.baseValue,
        before: instance.currentValue,
        after: step.value,
      });

      if (input.dryRun !== true) {
        await tx.taskInstance.updateMany({
          // §3.2 householdId predicate, plus the usual compare-and-set guard.
          // Redundant under the FOR UPDATE row lock taken above, but it keeps
          // this write shaped like every other instance write in the codebase.
          where: { id: instance.id, householdId: input.householdId, version: instance.version },
          data: {
            currentValue: step.value,
            // `capped` retires the instance from the sweep for the rest of
            // this AVAILABLE spell; the next entry into AVAILABLE sets a fresh
            // anchor anyway.
            valueGrowthAt: step.capped ? null : step.anchor,
            // §4.3 — every value change bumps the compare-and-set token, so a
            // client holding a stale card cannot act on the old price.
            ...(added > 0 ? { version: { increment: 1 } } : {}),
          },
        });

        if (band !== null) {
          // Everyone active: unlike a buyout there is no actor to exclude —
          // nobody caused this, the clock did.
          const recipients = await tx.householdMember.findMany({
            where: { householdId: input.householdId, isActive: true },
            select: { id: true },
          });
          await deps.notifier.emit(
            tx,
            recipients.map((m) => ({
              householdId: input.householdId,
              memberId: m.id,
              type: 'TASK_VALUE_INCREASED',
              // `from` is the value the member was last told about (the band
              // below), not `instance.currentValue` — otherwise the message
              // would read "+1" and hide the climb it is reporting.
              payload: {
                taskInstanceId: instance.id,
                from: Math.max(instance.baseValue, band - config.valueGrowth.notifyAfterPoints),
                to: step.value,
              },
              taskInstanceId: instance.id,
            })),
          );
        }
      }

      return { added, capped: step.capped, notified: band !== null };
    });

    if (outcome === null) continue;
    if ('seeded' in outcome) {
      report.seeded += 1;
      continue;
    }
    if (outcome.added > 0) {
      report.grown += 1;
      report.pointsAdded += outcome.added;
    }
    if (outcome.capped) report.capped += 1;
    if (outcome.notified) report.notified += 1;
  }

  return report;
}
