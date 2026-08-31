/**
 * The four things a use-case may reach for (Architektur §7.2).
 *
 * Only these four are injected, because only these four break determinism or
 * reach outside the process. Everything else a use-case needs it computes from
 * its inputs or reads through `db`. In particular there is no repository port:
 * use-cases talk to Prisma directly (§7.2), and the isolation that matters —
 * `domain/` knowing nothing of Prisma or Fastify — is enforced by the import
 * matrix in §7.3 rather than by an interface nobody swaps.
 */

import { randomInt } from 'node:crypto';

import type { Prisma, PrismaClient } from '@prisma/client';

import type { Rng } from '../domain/assignment/strategies.js';

/** The transaction-scoped client. Everything transactional takes this, not `db`. */
export type PrismaTx = Prisma.TransactionClient;

export interface Clock {
  now(): Date;
}

export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * §24 — in-app only for the MVP. Notifications are rows written inside the same
 * transaction as the event that justifies them, so a committed buyout can never
 * leave the household un-notified and a rolled-back one can never notify.
 */
export interface NotificationDraft {
  householdId: string;
  memberId: string;
  type: string;
  payload: Record<string, unknown>;
  taskInstanceId?: string | null;
}

export interface Notifier {
  emit(tx: PrismaTx, drafts: readonly NotificationDraft[]): Promise<void>;
}

/**
 * §4.8 — a test seam, not production branching. `undefined` in production
 * and the call vanishes.
 *
 * `afterLock` observes or delays a holder *after* it has won the row lock —
 * useful for exercising the losing side's error path deterministically.
 *
 * A `beforeLock` seam (releasing two waiting callers together just before
 * they attempt the same row, so Postgres itself serializes them) was
 * considered here for forcing genuine lock contention in a test, but it
 * would need a two-party barrier held *while a transaction is open*, which
 * risks exactly the kind of test-only coupling into production code this
 * seam exists to avoid. Phase 5's concurrency tests (`apps/api/test/
 * integration/concurrency.test.ts`) instead gate from outside the process —
 * an external transaction takes `FOR UPDATE` on the target row first,
 * confirmed via `pg_blocking_pids` — which forces the same real contention
 * with no production seam required at all.
 */
export interface UseCaseHooks {
  afterLock?: () => Promise<void>;
}

export interface Deps {
  db: PrismaClient;
  clock: Clock;
  rng: Rng;
  logger: Logger;
  notifier: Notifier;
  hooks?: UseCaseHooks;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * Production RNG. `crypto.randomInt` is drawn from the OS entropy pool, so a
 * selection cannot be predicted by someone who watched earlier draws — which
 * matters because §12's whole point is that nobody can game the assignment.
 * Tests and §34's simulation inject `mulberry32` instead so distributions are
 * reproducible.
 */
export const cryptoRng: Rng = {
  next: () => randomInt(0, 2 ** 32) / 2 ** 32,
};

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** The default notifier: one row per draft, inside the caller's transaction. */
export const dbNotifier: Notifier = {
  async emit(tx, drafts) {
    if (drafts.length === 0) return;
    await tx.notification.createMany({
      data: drafts.map((d) => ({
        householdId: d.householdId,
        memberId: d.memberId,
        // The enum is validated by Prisma; the draft type is a string so that
        // `app/` does not have to import the generated enum object.
        type: d.type as never,
        payload: d.payload as never,
        taskInstanceId: d.taskInstanceId ?? null,
      })),
    });
  },
};

/** Drops every notification. Used by the sweep's `dryRun` path and by tests. */
export const nullNotifier: Notifier = {
  emit: async () => undefined,
};
