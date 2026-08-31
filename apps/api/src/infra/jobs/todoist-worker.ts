/**
 * The Todoist worker (Architektur Todoist §8).
 *
 * Modelled deliberately on `startSweepWorker` in `worker.ts`, down to the
 * overlap guard and `handle.unref?.()`: consistency with the worker that already
 * exists matters more than a marginally cleverer scheduler, and a reader who
 * understands one understands both.
 *
 * **`intervalSeconds = 0` is also the single-reconciler guard.** Notification
 * idempotency relies on there being exactly one reconciler process: the check
 * that a member has not already been told reads outside a row lock, so two
 * concurrent workers could both decide to notify — and, through a stale read
 * spanning another process's completed dispatch, could even produce a duplicate
 * Todoist task, because the live-key index only guards the in-flight interval.
 * Any deployment running more than one API instance must therefore set
 * `TODOIST_INTERVAL_SECONDS=0` on all but one. Before scaling out, add a
 * per-household advisory lock mirroring `acquireSweepLock`.
 *
 * Note `0` disables the *worker*, not all Todoist traffic: a member
 * disconnecting on that instance still gets a best-effort close flush.
 */

import { dispatchOutbox } from '../../app/integrations/dispatchOutbox.js';
import { runReconciliation } from '../../app/integrations/runReconciliation.js';
import type { Deps } from '../../app/deps.js';

export interface TodoistWorker {
  stop(): void;
}

export function startTodoistWorker(deps: Deps, intervalSeconds: number): TodoistWorker {
  // Nothing to run if the interval is off, or if the integration was never
  // composed (no encryption key configured — see `Deps.secrets`).
  if (intervalSeconds <= 0 || deps.todoist === undefined || deps.secrets === undefined) {
    return { stop: () => undefined };
  }

  let running = false;

  const tick = async (): Promise<void> => {
    // Overlap guard. Queueing ticks behind a slow pass only builds a backlog,
    // and — unlike the sweep, which is additionally serialised by an advisory
    // lock — this guard is what keeps a single reconciler single.
    if (running) return;
    running = true;
    try {
      const households = await deps.db.household.findMany({ select: { id: true } });
      for (const household of households) {
        try {
          // Per household, never a global poll: every integration query must
          // carry householdId as its first predicate (§36), and the raw-SQL
          // claim query gets no lint coverage for that, so the discipline lives
          // in the call shape.
          //
          // Reconcile *then* dispatch, in that order: reconciliation is what
          // creates the rows this pass will send, so running it first means a
          // newly-owned chore reaches Todoist in one interval rather than two.
          const planned = await runReconciliation(deps, { householdId: household.id });
          if (planned.enqueued > 0 || planned.capNotifications > 0) {
            deps.logger.debug({ householdId: household.id, ...planned }, 'todoist reconcile');
          }
          const outcome = await dispatchOutbox(deps, { householdId: household.id });
          if (outcome.claimed > 0) {
            deps.logger.debug({ householdId: household.id, ...outcome }, 'todoist dispatch');
          }
        } catch (error) {
          // One household's failure must not stop the others — a broken
          // credential in one family cannot be allowed to freeze delivery for
          // everyone else.
          deps.logger.error(
            { err: error, householdId: household.id },
            'todoist dispatch failed',
          );
        }
      }
    } catch (error) {
      deps.logger.error({ err: error }, 'todoist tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalSeconds * 1000);
  // Do not hold the process open for the sake of the timer.
  handle.unref?.();

  return { stop: () => clearInterval(handle) };
}
