/**
 * The interval sweep (Architektur §7.1, PRD §2).
 *
 * A `setInterval` in the API process, not a separate service. At 1–20 members
 * and a sweep that touches a handful of rows, a queue plus a worker deployment
 * would be pure ceremony (§43) — and the advisory lock (§4.2) already makes
 * concurrent sweeps safe, so nothing breaks if a second process ever does
 * appear.
 *
 * It calls exactly the use-case `POST /admin/assignments/run` calls, which is
 * why the manual button and the background job cannot drift apart.
 */

import { runAssignmentSweep } from '../../app/assignment/runAssignmentSweep.js';
import type { Deps } from '../../app/deps.js';

export interface SweepWorker {
  stop(): void;
}

export function startSweepWorker(deps: Deps, intervalSeconds: number): SweepWorker {
  if (intervalSeconds <= 0) {
    return { stop: () => undefined };
  }

  let running = false;

  const tick = async (): Promise<void> => {
    // Overlap guard. The advisory lock would serialize two runs correctly, but
    // queueing ticks behind a slow sweep only builds a backlog nobody wants.
    if (running) return;
    running = true;
    try {
      const households = await deps.db.household.findMany({ select: { id: true } });
      for (const household of households) {
        try {
          await runAssignmentSweep(deps, { householdId: household.id });
        } catch (error) {
          // One household's failure must not stop the others: a broken config
          // in one family should not freeze assignment for everyone.
          deps.logger.error({ err: error, householdId: household.id }, 'sweep failed');
        }
      }
    } catch (error) {
      deps.logger.error({ err: error }, 'sweep tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalSeconds * 1000);
  // Do not hold the process open for the sake of the timer.
  handle.unref?.();

  return { stop: () => clearInterval(handle) };
}
