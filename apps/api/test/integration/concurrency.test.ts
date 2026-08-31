/**
 * §28 / §35 "Parallelzugriff" over the real HTTP stack.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * The domain suite proves the *rules*; this file proves the **mechanism** that
 * `app/tx.ts` documents — `READ COMMITTED` plus a level-1 `SELECT … FOR UPDATE`
 * on `task_instances` — actually serializes two simultaneous callers against a
 * real database. Nothing on the write path is stubbed.
 *
 * ## Why a lock gate rather than only `Promise.all`
 *
 * `Promise.all([inject(), inject()])` starts two requests, but nothing makes
 * their *transactions* overlap: if the first commits before the second reaches
 * `lockInstance`, the second simply reads `ASSIGNED` and the row lock is never
 * exercised at all. Such a test passes without ever testing anything, and its
 * coverage silently depends on event-loop scheduling.
 *
 * So the race is forced instead. The test opens its own transaction, takes
 * `FOR UPDATE` on the very row both requests will want, and holds it. Both
 * requests then block *inside Postgres* at `lockInstance` — confirmed by asking
 * `pg_blocking_pids` who is waiting behind the gate, not by sleeping — and only
 * then is it released. At that instant two transactions are open and both about
 * to touch the same row: exactly the state §28 is about, reproduced on every
 * run rather than when scheduling happens to cooperate.
 *
 * An in-process `UseCaseHooks` barrier was considered instead, but gating
 * from outside needs no production seam at all — see the comment on
 * `UseCaseHooks` in `app/deps.ts` for why. Nothing under `src/` is touched to
 * make these tests run.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { withTransaction } from '../../src/app/tx.js';
import { postTransaction } from '../../src/app/points/postTransaction.js';

import {
  authHeaders,
  buildTestServer,
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  testDeps,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-concurrency-');

let db: PrismaClient;
let app: FastifyInstance;
let anna: Session;
let paul: Session;

// ───────────────────────────── the lock gate ─────────────────────────────

interface LockGate {
  /** The backend holding the row, so waiters can be traced back to *this* lock. */
  pid: number;
  /** Commits the holding transaction, freeing every waiter at once. */
  release(): void;
  released: Promise<void>;
}

/**
 * Hold a level-1 row lock on one instance until `release()` is called.
 *
 * Deliberately the same statement `lockInstance` issues, so a waiter is
 * blocked by precisely the lock the production code would have taken.
 */
async function holdInstanceLock(instanceId: string): Promise<LockGate> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: (pid: number) => void;
  const isAcquired = new Promise<number>((resolve) => {
    acquired = resolve;
  });

  const released = db
    .$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid
            FROM task_instances
           WHERE id = ${instanceId} AND household_id = ${ids.householdId}
             FOR UPDATE`;
        acquired(rows[0]!.pid);
        await gate;
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    .then(() => undefined);

  return { pid: await isAcquired, release, released };
}

/**
 * Wait until `expected` backends are blocked, mid-`FOR UPDATE` on
 * `task_instances`, behind the gate.
 *
 * This is the assertion that the requests really are contending, rather than a
 * sleep that hopes they are. A timeout here means the race never formed, which
 * must fail the test loudly instead of passing it vacuously.
 *
 * The predicate is deliberately narrow on two axes. `query ILIKE` pins the
 * waiters to the level-1 lock statement, so an unrelated backend elsewhere in
 * the database cannot be miscounted as a participant. `blockedByGate` then
 * requires at least one of them to be blocked by the gate's own pid —
 * `pg_blocking_pids` reports the *tuple*-lock holder for the second waiter, so
 * only the head of the queue points straight at the gate, and asserting it for
 * all of them would be wrong.
 */
async function waitForBlockedBackends(
  gate: LockGate,
  expected: number,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let waiting = 0;
  let blockedByGate = 0;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ waiting: number; blocked_by_gate: number }[]>`
      SELECT count(*)::int AS waiting,
             count(*) FILTER (WHERE ${gate.pid} = ANY (pg_blocking_pids(a.pid)))::int
               AS blocked_by_gate
        FROM pg_stat_activity a
       WHERE a.datname = current_database()
         AND a.pid <> pg_backend_pid()
         AND a.pid <> ${gate.pid}
         AND cardinality(pg_blocking_pids(a.pid)) > 0
         AND a.query ILIKE '%task_instances%'
         AND a.query ILIKE '%FOR UPDATE%'`;
    waiting = rows[0]?.waiting ?? 0;
    blockedByGate = rows[0]?.blocked_by_gate ?? 0;
    if (waiting >= expected && blockedByGate >= 1) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `Es haben nie ${expected} Verbindungen gleichzeitig auf die Zeilensperre gewartet ` +
      `(zuletzt ${waiting} wartend, davon ${blockedByGate} direkt hinter dem Gate). ` +
      `Ohne echte Überlappung prüft dieser Test nichts.`,
  );
}

// ─────────────────────────────── lifecycle ───────────────────────────────

beforeAll(async () => {
  db = testDb();
  // Idempotent, exactly like `prisma/seed.ts`: a previous crashed run leaves
  // nothing for this one to collide with.
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'anna', displayName: 'Anna', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
    ],
    definitions: [
      { key: 'bad', title: 'Bad putzen', baseValue: 6 },
      { key: 'muell', title: 'Müll hinausbringen', baseValue: 4 },
    ],
  });
  app = await buildTestServer(db);
  await app.ready();
  anna = await login(app, ids, 'anna');
  paul = await login(app, ids, 'paul');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

function volunteer(session: Session, instanceId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/volunteer`,
    headers: authHeaders(session),
    payload: {},
  });
}

// ──────────────────────────────── the race ───────────────────────────────

describe('freiwillige Übernahme unter echtem Parallelzugriff', () => {
  test(
    'zwei gleichzeitige Freiwillige — genau einer gewinnt (erzwungene Überlappung)',
    async () => {
      const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
      const gate = await holdInstanceLock(instanceId);

      let annaSettled = false;
      let paulSettled = false;
      const annaCall = volunteer(anna, instanceId).then((r) => {
        annaSettled = true;
        return r;
      });
      const paulCall = volunteer(paul, instanceId).then((r) => {
        paulSettled = true;
        return r;
      });

      // `finally`, because a failed wait or assertion must still free the row —
      // otherwise the gate's transaction and both blocked requests would hang
      // on past this test and corrupt the next one's view of `pg_stat_activity`.
      try {
        // Both must now be stuck inside Postgres on the level-1 lock.
        await waitForBlockedBackends(gate, 2);

        // The row lock is doing the work: neither request can have got past
        // `lockInstance` while this test still holds the row.
        expect(annaSettled, 'Anna kam trotz gehaltener Zeilensperre durch').toBe(false);
        expect(paulSettled, 'Paul kam trotz gehaltener Zeilensperre durch').toBe(false);
      } finally {
        gate.release();
        await gate.released.catch(() => undefined);
      }

      const [a, p] = await Promise.all([annaCall, paulCall]);

      // ── HTTP: exactly one winner ────────────────────────────────────────
      const winners = [a, p].filter((r) => r.statusCode === 200);
      const losers = [a, p].filter((r) => r.statusCode !== 200);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      const loser = losers[0]!;
      expect(loser.statusCode).toBe(409);
      const loserBody = loser.json() as { error: { code: string; details?: Record<string, unknown> } };
      expect(loserBody.error.code).toBe('TASK_NOT_AVAILABLE');
      // §4.3 — the loser is told *who* holds it, so the UI can say
      // "Anna hat die Aufgabe übernommen" rather than showing a bare error.
      expect(loserBody.error.details?.['currentStatus']).toBe('ASSIGNED');

      const winnerBody = winners[0]!.json() as {
        assignment: { id: string; memberId: string };
        pointsAwarded: number;
      };
      // Default `rewardTiming: ON_COMPLETE` — volunteering alone pays nothing.
      expect(winnerBody.pointsAwarded).toBe(0);

      // ── the database, checked independently of the HTTP answers ─────────
      const assignments = await db.taskAssignment.findMany({
        where: { taskInstanceId: instanceId },
        select: { id: true, memberId: true, status: true, activeForInstanceId: true, kind: true },
      });
      expect(assignments).toHaveLength(1);
      expect(assignments[0]!.status).toBe('ACTIVE');
      expect(assignments[0]!.kind).toBe('VOLUNTARY');
      expect(assignments[0]!.activeForInstanceId).toBe(instanceId);
      expect(assignments[0]!.memberId).toBe(winnerBody.assignment.memberId);

      const instance = await db.taskInstance.findUniqueOrThrow({
        where: { id: instanceId },
        select: { status: true, version: true },
      });
      expect(instance.status).toBe('ASSIGNED');
      // Guard 2's compare-and-set incremented the version exactly once: the
      // loser wrote nothing at all.
      expect(instance.version).toBe(1);

      // The loser must not have left a half-written trail either.
      const volunteered = await db.taskHistoryEvent.count({
        where: { taskInstanceId: instanceId, type: 'VOLUNTEERED' },
      });
      expect(volunteered).toBe(1);
    },
    60_000,
  );

  test(
    'wiederholt, ohne Gate — nie zwei Gewinner',
    async () => {
      // The unforced path, five times over. It cannot prove the lock was
      // reached (that is the gated test's job), but it does prove the endpoint
      // never double-books under ordinary concurrent load.
      for (let round = 0; round < 5; round += 1) {
        const instanceId = await createAvailableInstance(db, ids, 'muell', 4);
        const [a, p] = await Promise.all([
          volunteer(anna, instanceId),
          volunteer(paul, instanceId),
        ]);

        const ok = [a, p].filter((r) => r.statusCode === 200);
        expect(ok, `Runde ${round}: ${a.statusCode}/${p.statusCode}`).toHaveLength(1);

        // 409, not merely "not 200": the rate limiter is per server instance
        // and this loop stays far under it, so a 429 here would be a real
        // regression rather than an acceptable second way to lose.
        const failed = [a, p].find((r) => r.statusCode !== 200)!;
        expect(failed.statusCode, `Runde ${round}`).toBe(409);
        expect((failed.json() as { error: { code: string } }).error.code).toBe(
          'TASK_NOT_AVAILABLE',
        );

        const assignments = await db.taskAssignment.count({
          where: { taskInstanceId: instanceId, status: 'ACTIVE' },
        });
        expect(assignments, `Runde ${round}: aktive Zuweisungen`).toBe(1);
      }
    },
    60_000,
  );
});

// ─────────────────────────── the buyout equivalent ───────────────────────

describe('Freikauf unter echtem Parallelzugriff', () => {
  /**
   * §28 lists the buyout as atomic too. The race that actually exists is *not*
   * two members buying out the same assignment — a non-assignee is rejected by
   * `NOT_ASSIGNEE` before any lock matters. It is the **double-tap**: one
   * member, two devices, one assignment. Charging twice would take points that
   * §44 says only one buyout may cost.
   */
  test(
    'zweimal gleichzeitig freikaufen — genau eine Buchung',
    async () => {
      const now = new Date();
      const instance = await db.taskInstance.create({
        data: {
          householdId: ids.householdId,
          taskDefinitionId: ids.definitionId('bad'),
          status: 'ASSIGNED',
          currentValue: 6,
          baseValue: 6,
          scheduledFor: now,
          publishedAt: now,
          configVersion: 1,
        },
        select: { id: true },
      });
      const assignment = await db.taskAssignment.create({
        data: {
          householdId: ids.householdId,
          taskInstanceId: instance.id,
          memberId: paul.memberId,
          kind: 'RANDOM',
          status: 'ACTIVE',
          response: 'PENDING',
          activeForInstanceId: instance.id,
          valueAtAssignment: 6,
          configVersion: 1,
          assignedAt: now,
        },
        select: { id: true },
      });

      // Points through the real ledger writer — §14 forbids setting a balance
      // directly, and this fixture is not allowed to take that shortcut either.
      await withTransaction(testDeps(db), (tx) =>
        postTransaction(tx, {
          householdId: ids.householdId,
          memberId: paul.memberId,
          amount: 10,
          type: 'MANUAL_ADJUSTMENT',
          initiatorMemberId: anna.memberId,
          initiatorType: 'ADMIN',
          description: 'Integrationstest-Startguthaben',
        }),
      );

      const quoteResponse = await app.inject({
        method: 'GET',
        url: `/api/assignments/${assignment.id}/buyout-quote`,
        headers: { cookie: paul.cookie },
      });
      expect(quoteResponse.statusCode).toBe(200);
      const quote = quoteResponse.json() as {
        allowed: boolean;
        cost: number;
        taskValueAfter: number;
      };
      expect(quote.allowed).toBe(true);
      // §39 defaults: cost = currentValue, new value = ceil(6 × 1.5).
      expect(quote.cost).toBe(6);
      expect(quote.taskValueAfter).toBe(9);

      const gate = await holdInstanceLock(instance.id);
      const payload = { acceptedCost: quote.cost, acceptedNewValue: quote.taskValueAfter };
      const first = app.inject({
        method: 'POST',
        url: `/api/assignments/${assignment.id}/buyout`,
        headers: authHeaders(paul),
        payload,
      });
      const second = app.inject({
        method: 'POST',
        url: `/api/assignments/${assignment.id}/buyout`,
        headers: authHeaders(paul),
        payload,
      });

      try {
        await waitForBlockedBackends(gate, 2);
      } finally {
        gate.release();
        await gate.released.catch(() => undefined);
      }

      const [a, b] = await Promise.all([first, second]);
      const winners = [a, b].filter((r) => r.statusCode === 200);
      expect(winners).toHaveLength(1);

      const loser = [a, b].find((r) => r.statusCode !== 200)!;
      expect(loser.statusCode).toBe(409);
      expect((loser.json() as { error: { code: string } }).error.code).toBe('ASSIGNMENT_CLOSED');

      // ── the ledger is the real assertion ────────────────────────────────
      const debits = await db.pointTransaction.findMany({
        where: { taskAssignmentId: assignment.id, type: 'BUYOUT' },
        select: { amount: true, balanceBefore: true, balanceAfter: true },
      });
      expect(debits).toHaveLength(1);
      expect(debits[0]!.amount).toBe(-6);
      expect(debits[0]!.balanceAfter).toBe(4);

      const member = await db.householdMember.findUniqueOrThrow({
        where: { id: paul.memberId },
        select: { pointsCache: true },
      });
      expect(member.pointsCache).toBe(4);

      const reopened = await db.taskInstance.findUniqueOrThrow({
        where: { id: instance.id },
        select: { status: true, currentValue: true, buyoutCount: true },
      });
      // §10 — one buyout, one value increase, one new offer cycle.
      expect(reopened.status).toBe('AVAILABLE');
      expect(reopened.currentValue).toBe(9);
      expect(reopened.buyoutCount).toBe(1);
    },
    60_000,
  );
});
