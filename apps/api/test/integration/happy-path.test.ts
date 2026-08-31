/**
 * The vertical slice of §40, over real HTTP against a real Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * Login → the offer board → voluntary takeover → completion → the balance, each
 * step through the shipped routes. The point is the *seam*: the domain suite
 * already proves `voluntaryReward` returns the current value, but only this
 * proves the route, the transaction, the ledger and the read model agree about
 * it. The final balance is therefore read back with `GET /members/me/points`
 * rather than from the row the write just made (§36: the client is only ever
 * shown a number the server computed).
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  authHeaders,
  buildTestServer,
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-happypath-');

/** Not the base value: the reward must follow the *current* value (§44). */
const BASE_VALUE = 4;
const CURRENT_VALUE = 9;

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [{ key: 'elke', displayName: 'Elke', role: 'ADMIN' }],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: BASE_VALUE }],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'anmelden → freiwillig übernehmen → erledigen → Punkte gutgeschrieben',
  async () => {
    // The instance carries a raised current value on a lower base value, so a
    // reward that accidentally used `baseValue` would show up as 4, not 9.
    const instanceId = await createAvailableInstance(db, ids, 'bad', BASE_VALUE);
    await db.taskInstance.update({
      where: { id: instanceId },
      data: { currentValue: CURRENT_VALUE },
    });

    // ── the session is real ─────────────────────────────────────────────
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: elke.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { member: { displayName: string } }).member.displayName).toBe('Elke');

    // ── §20: the chore is on the board at its current value ─────────────
    const board = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: { cookie: elke.cookie },
    });
    expect(board.statusCode).toBe(200);
    const offered = (
      board.json() as { items: { id: string; currentValue: number; canVolunteer: boolean }[] }
    ).items.find((i) => i.id === instanceId);
    expect(offered).toBeDefined();
    expect(offered!.currentValue).toBe(CURRENT_VALUE);
    expect(offered!.canVolunteer).toBe(true);

    const before = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: elke.cookie },
    });
    expect((before.json() as { balance: number }).balance).toBe(0);

    // ── §5: taking it on ────────────────────────────────────────────────
    const taken = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/volunteer`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(taken.statusCode).toBe(200);
    const takenBody = taken.json() as {
      assignment: { id: string; kind: string };
      pointsAwarded: number;
      instance: { status: string };
    };
    expect(takenBody.assignment.kind).toBe('VOLUNTARY');
    expect(takenBody.instance.status).toBe('ASSIGNED');
    // §39 `rewardTiming: ON_COMPLETE` — nothing is paid on acceptance.
    expect(takenBody.pointsAwarded).toBe(0);

    const midway = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: elke.cookie },
    });
    expect((midway.json() as { balance: number }).balance).toBe(0);

    // ── §5 / §11: completion pays, and resets the value ─────────────────
    const done = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/complete`,
      headers: authHeaders(elke),
      payload: { assignmentId: takenBody.assignment.id },
    });
    expect(done.statusCode).toBe(200);
    const doneBody = done.json() as {
      pointsAwarded: number;
      valueResetFrom: number;
      valueResetTo: number;
      transaction: { amount: number; balanceBefore: number; balanceAfter: number } | null;
    };
    expect(doneBody.pointsAwarded).toBe(CURRENT_VALUE);
    expect(doneBody.valueResetFrom).toBe(CURRENT_VALUE);
    expect(doneBody.valueResetTo).toBe(BASE_VALUE);
    expect(doneBody.transaction?.amount).toBe(CURRENT_VALUE);

    // ── the balance, read back through the API ──────────────────────────
    const after = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: elke.cookie },
    });
    expect(after.statusCode).toBe(200);
    expect((after.json() as { balance: number }).balance).toBe(CURRENT_VALUE);

    // ── §14: the ledger, not a mutated number ───────────────────────────
    const ledger = await app.inject({
      method: 'GET',
      url: '/api/members/me/point-transactions',
      headers: { cookie: elke.cookie },
    });
    expect(ledger.statusCode).toBe(200);
    const entries = (
      ledger.json() as {
        items: { amount: number; type: string; balanceBefore: number; balanceAfter: number }[];
      }
    ).items;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe('VOLUNTARY_TASK_REWARD');
    expect(entries[0]!.amount).toBe(CURRENT_VALUE);
    expect(entries[0]!.balanceBefore).toBe(0);
    expect(entries[0]!.balanceAfter).toBe(CURRENT_VALUE);

    // ── §22: the history is followable ──────────────────────────────────
    const history = await app.inject({
      method: 'GET',
      url: `/api/tasks/${instanceId}/history`,
      headers: { cookie: elke.cookie },
    });
    expect(history.statusCode).toBe(200);
    const types = (history.json() as { items: { type: string }[] }).items.map((e) => e.type);
    expect(types).toContain('VOLUNTEERED');
    expect(types).toContain('COMPLETED');
    expect(types).toContain('POINTS_AWARDED');
    expect(types).toContain('VALUE_RESET');

    // ── and the row itself agrees ───────────────────────────────────────
    const row = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: { status: true, currentValue: true, completedByMemberId: true },
    });
    expect(row.status).toBe('COMPLETED');
    expect(row.currentValue).toBe(BASE_VALUE);
    expect(row.completedByMemberId).toBe(elke.memberId);
  },
  60_000,
);
