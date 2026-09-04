/**
 * Multi-worker-task slot arithmetic (Phase 1 of
 * .planning/campaigns/multi-worker-tasks.md).
 *
 * How many `ACTIVE` `TaskAssignment` rows a `TaskInstance` needs before it
 * counts as staffed (`minRequired`) and may hold at once (`maxAllowed`) under
 * its `workerCountMode`, plus whether a single join/leave event crosses
 * either threshold (`slotOutcome`).
 *
 * Phase 1 lands this module unused: no use-case imports it yet. Phase 2 wires
 * it into volunteerForTask.ts / executeBuyout.ts / completeTask.ts /
 * runAssignmentSweep.ts to decide when to fire a state-machine.ts transition
 * — this module never fires one itself, and knows nothing about TaskStatus.
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import { WorkerCountMode } from '@haushaltsauktion/shared';

/**
 * The floor of `ACTIVE` assignments a TaskInstance needs before it counts as
 * fully staffed. `AT_MOST` still floors at 1 — mirrors today's single-worker
 * guarantee that a task is never "done" with zero workers, even though its
 * ceiling under `AT_MOST` may be higher.
 */
export function minRequired(mode: WorkerCountMode, n: number): number {
  switch (mode) {
    case WorkerCountMode.EXACTLY:
      return n;
    case WorkerCountMode.AT_LEAST:
      return n;
    case WorkerCountMode.AT_MOST:
      return 1;
  }
}

/**
 * The ceiling of `ACTIVE` assignments a TaskInstance may hold at once.
 * `AT_LEAST` is unbounded — that is what distinguishes open-ended recruiting
 * from `EXACTLY`'s fixed headcount.
 */
export function maxAllowed(mode: WorkerCountMode, n: number): number {
  switch (mode) {
    case WorkerCountMode.EXACTLY:
      return n;
    case WorkerCountMode.AT_LEAST:
      return Infinity;
    case WorkerCountMode.AT_MOST:
      return n;
  }
}

export type SlotEvent = 'JOIN' | 'LEAVE';

export interface SlotOutcomeInput {
  event: SlotEvent;
  activeSlotCount: number;
  min: number;
  max: number;
}

export interface SlotOutcome {
  /** `activeSlotCount` after applying the event. */
  nextActiveSlotCount: number;
  /** True once `nextActiveSlotCount` reaches `max` — no more joining. */
  isFull: boolean;
  /** True while `nextActiveSlotCount` is below `min` — still needs (more) workers. */
  isBelowMin: boolean;
}

/**
 * Applies one `JOIN` (an assignment goes `ACTIVE`) or `LEAVE` (an `ACTIVE`
 * assignment closes — buyout, release, revoke, or completion) to a slot
 * count, and reports whether either configured threshold was crossed.
 */
export function slotOutcome(input: SlotOutcomeInput): SlotOutcome {
  const delta = input.event === 'JOIN' ? 1 : -1;
  const nextActiveSlotCount = input.activeSlotCount + delta;
  return {
    nextActiveSlotCount,
    isFull: nextActiveSlotCount >= input.max,
    isBelowMin: nextActiveSlotCount < input.min,
  };
}
