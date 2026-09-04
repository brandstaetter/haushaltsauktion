/**
 * Multi-worker-tasks Phase 2 — real-lock concurrency proof for slot-aware
 * volunteering (.planning/architecture-multi-worker-tasks.md, Phase 2 end
 * conditions: "Two members can volunteer for distinct slots on the same
 * instance without racing each other out" / "Concurrent volunteer attempts
 * for what would become the same slot are proven safe by a real-lock test").
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * Mirrors `concurrency.test.ts`'s lock-gate methodology exactly (see that
 * file's module docstring for the full rationale): an external transaction
 * takes `FOR UPDATE` on the target `task_instances` row and holds it, so both
 * competing requests are forced to overlap *inside Postgres* — confirmed via
 * `pg_blocking_pids`, not hoped for via scheduling — before being released
 * together. Nothing under `src/` is touched to make this run; the gate is
 * external, the same as the existing suite's.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  authHeaders,
  buildTestServer,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-multiworker-concurrency-');

let db: PrismaClient;
let app: FastifyInstance;
let anna: Session;
let paul: Session;
let maria: Session;

// ───────────────────────────── the lock gate ─────────────────────────────
// Copied from `concurrency.test.ts` — not exported there, and duplicating a
// dozen lines here is cheaper than coupling the two files' internals.

interface LockGate {
  pid: number;
  release(): void;
  released: Promise<void>;
}

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

// ─────────────────────────────── fixtures ────────────────────────────────

async function createMultiSlotInstance(
  mode: 'EXACTLY' | 'AT_LEAST' | 'AT_MOST',
  workerCount: number,
  value: number,
): Promise<string> {
  const now = new Date();
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('multi'),
      status: 'AVAILABLE',
      currentValue: value,
      baseValue: value,
      scheduledFor: now,
      publishedAt: now,
      offerExpiresAt: new Date(now.getTime() + 3600_000),
      configVersion: 1,
      workerCountMode: mode,
      workerCount,
      activeSlotCount: 0,
    },
    select: { id: true },
  });
  return instance.id;
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'anna', displayName: 'Anna', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
    ],
    definitions: [],
  });
  await db.taskDefinition.create({
    data: {
      id: ids.definitionId('multi'),
      householdId: ids.householdId,
      title: 'Garten pflegen',
      categoryId: ids.categoryId,
      baseValue: 6,
      estimatedMinutes: 20,
      recurrenceType: 'MANUAL',
      workerCountMode: 'EXACTLY',
      workerCount: 1,
    },
  });
  app = await buildTestServer(db);
  await app.ready();
  anna = await login(app, ids, 'anna');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
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

// ──────────────────────────────── the races ──────────────────────────────

test(
  'zwei gleichzeitige Freiwillige für unterschiedliche Slots — beide gewinnen (erzwungene Überlappung)',
  async () => {
    // EXACTLY(3): min = max = 3, so two joins still leave the instance
    // recruiting (AVAILABLE) — nobody should see a conflict.
    const instanceId = await createMultiSlotInstance('EXACTLY', 3, 6);
    const gate = await holdInstanceLock(instanceId);

    let paulSettled = false;
    let mariaSettled = false;
    const paulCall = volunteer(paul, instanceId).then((r) => {
      paulSettled = true;
      return r;
    });
    const mariaCall = volunteer(maria, instanceId).then((r) => {
      mariaSettled = true;
      return r;
    });

    try {
      await waitForBlockedBackends(gate, 2);
      expect(paulSettled, 'Paul kam trotz gehaltener Zeilensperre durch').toBe(false);
      expect(mariaSettled, 'Maria kam trotz gehaltener Zeilensperre durch').toBe(false);
    } finally {
      gate.release();
      await gate.released.catch(() => undefined);
    }

    const [p, m] = await Promise.all([paulCall, mariaCall]);
    expect(p.statusCode, JSON.stringify(p.json())).toBe(200);
    expect(m.statusCode, JSON.stringify(m.json())).toBe(200);

    const assignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instanceId, status: 'ACTIVE' },
      select: { memberId: true, slotIndex: true, activeSlotKey: true, kind: true },
    });
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.slotIndex).sort()).toEqual([0, 1]);
    expect(new Set(assignments.map((a) => a.memberId))).toEqual(
      new Set([paul.memberId, maria.memberId]),
    );
    // The real guard: two distinct slots, never the same key twice.
    expect(new Set(assignments.map((a) => a.activeSlotKey)).size).toBe(2);
    expect(assignments.every((a) => a.kind === 'VOLUNTARY')).toBe(true);

    const instance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: { status: true, activeSlotCount: true, version: true },
    });
    // min = 3, only 2 filled — still recruiting.
    expect(instance.status).toBe('AVAILABLE');
    expect(instance.activeSlotCount).toBe(2);
    // Two successful compare-and-set writes, no wasted increments from a loser.
    expect(instance.version).toBe(2);
  },
  60_000,
);

test(
  'zwei gleichzeitige Freiwillige um den letzten freien Slot — genau einer gewinnt, der andere bekommt einen sauberen Konflikt',
  async () => {
    // EXACTLY(2) with slot 0 already held: exactly ONE slot is free, so this
    // is the "two attempts resolve to the same slot" case end-condition asks
    // for — not two different free slots, but genuine contention for one.
    const instanceId = await createMultiSlotInstance('EXACTLY', 2, 6);
    const now = new Date();
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instanceId,
        memberId: anna.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: instanceId,
        slotIndex: 0,
        activeSlotKey: `${instanceId}:0`,
        valueAtAssignment: 6,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
    });

    const gate = await holdInstanceLock(instanceId);
    let paulSettled = false;
    let mariaSettled = false;
    const paulCall = volunteer(paul, instanceId).then((r) => {
      paulSettled = true;
      return r;
    });
    const mariaCall = volunteer(maria, instanceId).then((r) => {
      mariaSettled = true;
      return r;
    });

    try {
      await waitForBlockedBackends(gate, 2);
      expect(paulSettled, 'Paul kam trotz gehaltener Zeilensperre durch').toBe(false);
      expect(mariaSettled, 'Maria kam trotz gehaltener Zeilensperre durch').toBe(false);
    } finally {
      gate.release();
      await gate.released.catch(() => undefined);
    }

    const [p, m] = await Promise.all([paulCall, mariaCall]);
    const winners = [p, m].filter((r) => r.statusCode === 200);
    const losers = [p, m].filter((r) => r.statusCode !== 200);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const loser = losers[0]!;
    expect(loser.statusCode).toBe(409);
    const loserBody = loser.json() as { error: { code: string } };
    expect(loserBody.error.code).toBe('TASK_NOT_AVAILABLE');

    // The database, checked independently of the HTTP answers: exactly two
    // ACTIVE rows total (Anna's pre-existing one plus exactly one winner),
    // never three, never a duplicate slotIndex.
    const assignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instanceId, status: 'ACTIVE' },
      select: { memberId: true, slotIndex: true },
    });
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.slotIndex).sort()).toEqual([0, 1]);

    const instance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: { status: true, activeSlotCount: true },
    });
    // min = max = 2, now fully reached.
    expect(instance.status).toBe('ASSIGNED');
    expect(instance.activeSlotCount).toBe(2);
  },
  60_000,
);
