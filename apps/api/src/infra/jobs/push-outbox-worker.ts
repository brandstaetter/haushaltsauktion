/**
 * The Web Push outbox dispatch tick (push-notifications §Architekturvorschlag,
 * Phase 2 — rollback-safety fix).
 *
 * Modeled directly on `startSweepWorker` (`worker.ts`), down to the overlap
 * guard and `handle.unref?.()`: consistency with the worker that already
 * exists matters more than a marginally cleverer scheduler.
 *
 * Unlike `startSweepWorker`/`startTodoistWorker`, this tick does not loop
 * over households itself — `dispatchPushOutbox` claims a global batch and
 * partitions it by household internally (see that file's module doc for
 * why). One call per tick is therefore the whole job.
 */

import { dispatchPushOutbox } from '../../app/notifications/dispatchPushOutbox.js';
import type { Deps } from '../../app/deps.js';

export interface PushOutboxWorker {
  stop(): void;
}

export function startPushOutboxWorker(deps: Deps, intervalSeconds: number): PushOutboxWorker {
  // Nothing to run if the interval is off, or push was never configured for
  // this deployment (no VAPID key pair — see `Deps.push`).
  if (intervalSeconds <= 0 || deps.push === undefined) {
    return { stop: () => undefined };
  }

  let running = false;

  const tick = async (): Promise<void> => {
    // Overlap guard. Queueing ticks behind a slow pass only builds a
    // backlog nobody wants; there is no advisory lock here because a
    // duplicate send from two overlapping passes is an accepted mild UX
    // annoyance, not a correctness violation (see `dispatchPushOutbox.ts`).
    if (running) return;
    running = true;
    try {
      const outcome = await dispatchPushOutbox(deps);
      if (outcome.claimed > 0) {
        deps.logger.debug(outcome, 'push outbox dispatch');
      }
    } catch (error) {
      deps.logger.error({ err: error }, 'push outbox tick failed');
    } finally {
      running = false;
    }
  };

  const handle = setInterval(() => void tick(), intervalSeconds * 1000);
  // Do not hold the process open for the sake of the timer.
  handle.unref?.();

  return { stop: () => clearInterval(handle) };
}
