/**
 * `GET /api/tasks/all` — the household-wide "Alle Aufgaben" tab (§20
 * extended). Unlike `/tasks/available` (only `AVAILABLE`) and
 * `/tasks/assigned-to-me` (only the caller's own `ASSIGNED` rows), this must
 * return every open instance in the household regardless of who — if anyone
 * — holds it, and name the assignee for `ASSIGNED` rows.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
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

const ids = idsFor('test-tasksall-');

const BASE_VALUE = 4;

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;
let anna: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'anna', displayName: 'Anna', role: 'MEMBER' },
    ],
    definitions: [
      { key: 'muell', title: 'Müll hinausbringen', baseValue: BASE_VALUE },
      { key: 'bad', title: 'Bad putzen', baseValue: 6 },
      { key: 'staub', title: 'Staubsaugen', baseValue: 4 },
    ],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  anna = await login(app, ids, 'anna');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'listet AVAILABLE- und ASSIGNED-Aufgaben householdweit, mit korrektem Zuweisungsträger je Karte',
  async () => {
    // ── one AVAILABLE task, untouched ────────────────────────────────────
    const availableId = await createAvailableInstance(db, ids, 'muell', BASE_VALUE);

    // ── one ASSIGNED task, randomly drawn for Anna — not the viewer (Elke) ──
    const now = new Date();
    const randomInstance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: ids.definitionId('bad'),
        status: 'ASSIGNED',
        currentValue: 6,
        baseValue: 6,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
        // EXACTLY(1), one ACTIVE assignment below — matches the invariant
        // volunteerForTask.ts/the sweep maintain, which /tasks/available's
        // slot-based filtering (bugfix: vanish-from-list) now depends on.
        activeSlotCount: 1,
      },
      select: { id: true },
    });
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: randomInstance.id,
        memberId: anna.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: randomInstance.id,
        valueAtAssignment: 6,
        configVersion: 1,
        assignedAt: now,
      },
    });

    // ── one ASSIGNED task, voluntarily taken by Anna ─────────────────────
    const voluntaryInstance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: ids.definitionId('staub'),
        status: 'ASSIGNED',
        currentValue: 4,
        baseValue: 4,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
        activeSlotCount: 1,
      },
      select: { id: true },
    });
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: voluntaryInstance.id,
        memberId: anna.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: voluntaryInstance.id,
        valueAtAssignment: 4,
        configVersion: 1,
        assignedAt: now,
      },
    });

    try {
      // Elke — who holds none of these — asks for the household-wide view.
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks/all',
        headers: authHeaders(elke),
      });
      expect(response.statusCode).toBe(200);

      const items = (
        response.json() as {
          items: {
            id: string;
            status: string;
            assignee: { id: string; displayName: string; kind: string } | null;
          }[];
        }
      ).items;

      const available = items.find((i) => i.id === availableId);
      expect(available).toBeDefined();
      expect(available!.status).toBe('AVAILABLE');
      // §20: no assignee for an AVAILABLE task — there isn't one.
      expect(available!.assignee).toBeNull();

      const random = items.find((i) => i.id === randomInstance.id);
      expect(random).toBeDefined();
      expect(random!.status).toBe('ASSIGNED');
      expect(random!.assignee).toMatchObject({
        id: anna.memberId,
        displayName: 'Anna',
        kind: 'RANDOM',
      });

      const voluntary = items.find((i) => i.id === voluntaryInstance.id);
      expect(voluntary).toBeDefined();
      expect(voluntary!.status).toBe('ASSIGNED');
      expect(voluntary!.assignee).toMatchObject({
        id: anna.memberId,
        displayName: 'Anna',
        kind: 'VOLUNTARY',
      });

      // ── the two narrower endpoints stay exactly what they always were ──
      const availableOnly = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
        headers: authHeaders(elke),
      });
      const availableOnlyIds = (availableOnly.json() as { items: { id: string }[] }).items.map(
        (i) => i.id,
      );
      expect(availableOnlyIds).toContain(availableId);
      expect(availableOnlyIds).not.toContain(randomInstance.id);
      expect(availableOnlyIds).not.toContain(voluntaryInstance.id);

      const assignedToElke = await app.inject({
        method: 'GET',
        url: '/api/tasks/assigned-to-me',
        headers: authHeaders(elke),
      });
      // Elke holds none of Anna's assignments — assigned-to-me stays scoped.
      expect((assignedToElke.json() as { items: unknown[] }).items).toHaveLength(0);
    } finally {
      await db.taskAssignment.deleteMany({
        where: { taskInstanceId: { in: [randomInstance.id, voluntaryInstance.id] } },
      });
      await db.taskInstance.deleteMany({
        where: { id: { in: [availableId, randomInstance.id, voluntaryInstance.id] } },
      });
    }
  },
  60_000,
);
