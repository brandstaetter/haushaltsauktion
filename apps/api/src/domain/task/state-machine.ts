/**
 * The `TaskInstance` state machine (Architektur §2.2, §2.4).
 *
 * One table, everything derived from it. Nothing else in the codebase is
 * allowed to decide whether a transition is legal — which is what keeps the
 * 70 illegal pairs actually illegal instead of merely undocumented.
 *
 * Pure: no Prisma, no Fastify, no `Date`, no `Math.random` (§7.2).
 */

import { TaskStatus } from '@haushaltsauktion/shared';
import { IllegalTransitionError } from '../errors.js';

export const TaskEvent = Object.freeze({
  PUBLISH: 'PUBLISH',
  VOLUNTEER: 'VOLUNTEER',
  ASSIGN_RANDOM: 'ASSIGN_RANDOM',
  COMPLETE: 'COMPLETE',
  BUYOUT: 'BUYOUT',
  RELEASE: 'RELEASE',
  REVOKE: 'REVOKE',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  CANCEL: 'CANCEL',
  EXPIRE: 'EXPIRE',
  /** Admin-only (§32-adjacent moderation): a rejected completion, reopened directly to the member who did it. */
  REOPEN_TO_ASSIGNEE: 'REOPEN_TO_ASSIGNEE',
  /** Admin-only: a rejected completion, put back on the market for anyone. */
  REOPEN_TO_MARKET: 'REOPEN_TO_MARKET',
} as const);
export type TaskEvent = (typeof TaskEvent)[keyof typeof TaskEvent];

export const ALL_TASK_STATUSES = Object.freeze(Object.values(TaskStatus));
export const ALL_TASK_EVENTS = Object.freeze(Object.values(TaskEvent));

export interface Transition {
  readonly from: TaskStatus;
  readonly event: TaskEvent;
  readonly to: TaskStatus;
}

/**
 * §2.4 — normative. 21 legal transitions out of 7 states × 13 events = 91 pairs,
 * leaving 70 that must be rejected.
 *
 * `ACCEPT` (T6) is deliberately absent: it changes `TaskAssignment.response`,
 * not `TaskInstance.status` (OQ-3).
 *
 * `COMPLETED` is reachable again only through the two `REOPEN_*` events, and
 * only an admin's rejection use-case ever raises them (§32-adjacent
 * moderation). No *ordinary* event ever reopens a completion — the correction
 * a ledger entry gives you is still the only way an ordinary actor "undoes"
 * one; these two exist so a bad completion can be handed back for a genuine
 * redo instead of just being financially reversed.
 */
export const TRANSITIONS = [
  { from: 'DRAFT', event: 'PUBLISH', to: 'AVAILABLE' },
  { from: 'AVAILABLE', event: 'VOLUNTEER', to: 'ASSIGNED' },
  { from: 'AVAILABLE', event: 'ASSIGN_RANDOM', to: 'ASSIGNED' },
  { from: 'ASSIGNED', event: 'COMPLETE', to: 'COMPLETED' },
  { from: 'ASSIGNED', event: 'BUYOUT', to: 'AVAILABLE' },
  { from: 'ASSIGNED', event: 'RELEASE', to: 'AVAILABLE' },
  { from: 'ASSIGNED', event: 'REVOKE', to: 'AVAILABLE' },
  { from: 'DRAFT', event: 'PAUSE', to: 'PAUSED' },
  { from: 'AVAILABLE', event: 'PAUSE', to: 'PAUSED' },
  { from: 'ASSIGNED', event: 'PAUSE', to: 'PAUSED' },
  { from: 'PAUSED', event: 'RESUME', to: 'AVAILABLE' },
  { from: 'DRAFT', event: 'CANCEL', to: 'CANCELLED' },
  { from: 'AVAILABLE', event: 'CANCEL', to: 'CANCELLED' },
  { from: 'ASSIGNED', event: 'CANCEL', to: 'CANCELLED' },
  { from: 'PAUSED', event: 'CANCEL', to: 'CANCELLED' },
  { from: 'DRAFT', event: 'EXPIRE', to: 'EXPIRED' },
  { from: 'AVAILABLE', event: 'EXPIRE', to: 'EXPIRED' },
  { from: 'ASSIGNED', event: 'EXPIRE', to: 'EXPIRED' },
  { from: 'PAUSED', event: 'EXPIRE', to: 'EXPIRED' },
  { from: 'COMPLETED', event: 'REOPEN_TO_ASSIGNEE', to: 'ASSIGNED' },
  { from: 'COMPLETED', event: 'REOPEN_TO_MARKET', to: 'AVAILABLE' },
] as const satisfies readonly Transition[];

const INDEX: ReadonlyMap<string, TaskStatus> = new Map(
  TRANSITIONS.map((t) => [`${t.from}|${t.event}`, t.to as TaskStatus]),
);

/** The target state, or `undefined` when the pair is illegal. */
export function targetOf(from: TaskStatus, event: TaskEvent): TaskStatus | undefined {
  return INDEX.get(`${from}|${event}`);
}

export function isLegal(from: TaskStatus, event: TaskEvent): boolean {
  return INDEX.has(`${from}|${event}`);
}

/** Every event legal from `from`, in declaration order. */
export function legalEvents(from: TaskStatus): TaskEvent[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.event);
}

/** Resolve or throw. The single gate every use-case passes through. */
export function resolve(from: TaskStatus, event: TaskEvent): TaskStatus {
  const to = targetOf(from, event);
  if (to === undefined) {
    throw new IllegalTransitionError(from, event, legalEvents(from));
  }
  return to;
}

/**
 * Every `(from, event)` pair NOT in `TRANSITIONS` — consumed by the test suite
 * so the table and the §2.4 matrix cannot drift apart.
 */
export function illegalPairs(): Array<{ from: TaskStatus; event: TaskEvent }> {
  const pairs: Array<{ from: TaskStatus; event: TaskEvent }> = [];
  for (const from of ALL_TASK_STATUSES) {
    for (const event of ALL_TASK_EVENTS) {
      if (!isLegal(from, event)) pairs.push({ from, event });
    }
  }
  return pairs;
}

/** §2.1 — a terminal state accepts no event at all. That is what makes it terminal. */
export function isTerminal(status: TaskStatus): boolean {
  return legalEvents(status).length === 0;
}

/** §2.1 — the states that hold exactly one ACTIVE assignment. */
export function hasActiveAssignment(status: TaskStatus): boolean {
  return status === TaskStatus.ASSIGNED;
}
