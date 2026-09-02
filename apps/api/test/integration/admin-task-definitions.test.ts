/**
 * `POST /api/admin/task-definitions/:id/materialize` — §18 on-demand
 * materialization. Originally the only path for a `MANUAL` definition
 * (`nextOccurrence()` returns `null` for it, so it never gets a new
 * `TaskInstance` on its own), but works for any recurrence type: an
 * auto-scheduled definition can also be materialized ahead of its next
 * scheduled occurrence.
 *
 * Requires a live Postgres, same as the rest of `test/integration/` —
 * `docker compose up -d db && npm run db:migrate`.
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

const ids = idsFor('test-admintaskdefs-');

let db: PrismaClient;
let app: FastifyInstance;
let admin: Session;
let bob: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'admin', displayName: 'Admin', role: 'ADMIN' },
      { key: 'bob', displayName: 'Bob', role: 'MEMBER' },
    ],
    // `createHousehold` always creates fixture definitions as `MANUAL`.
    definitions: [{ key: 'keller', title: 'Keller aufräumen', baseValue: 5 }],
  });
  app = await buildTestServer(db);
  await app.ready();
  admin = await login(app, ids, 'admin');
  bob = await login(app, ids, 'bob');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test('admin materializes a MANUAL definition into a published, available instance', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/task-definitions/${ids.definitionId('keller')}/materialize`,
    headers: authHeaders(admin),
    payload: {},
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { instance: { id: string; status: string; currentValue: number } };
  expect(body.instance.status).toBe('AVAILABLE');
  expect(body.instance.currentValue).toBe(5);

  const historyTypes = (
    await db.taskHistoryEvent.findMany({
      where: { taskInstanceId: body.instance.id },
      orderBy: { createdAt: 'asc' },
    })
  ).map((e) => e.type);
  expect(historyTypes).toEqual(['CREATED', 'OFFERED']);

  // Clean up so later tests in this file see zero open instances again.
  await db.taskInstance.delete({ where: { id: body.instance.id } });
});

test('admin materializes an auto-scheduled (WEEKLY) definition on demand, not just MANUAL', async () => {
  const weeklyDefId = ids.definitionId('badputzen');
  await db.taskDefinition.create({
    data: {
      id: weeklyDefId,
      householdId: ids.householdId,
      title: 'Bad putzen',
      baseValue: 6,
      recurrenceType: 'WEEKLY',
      recurrenceWeekdays: [6],
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/task-definitions/${weeklyDefId}/materialize`,
    headers: authHeaders(admin),
    payload: {},
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { instance: { id: string; status: string; currentValue: number } };
  expect(body.instance.status).toBe('AVAILABLE');
  expect(body.instance.currentValue).toBe(6);

  await db.taskInstance.delete({ where: { id: body.instance.id } });
  await db.taskDefinition.delete({ where: { id: weeklyDefId } });
});

test('publishImmediately: false materializes a draft instance with no OFFERED event', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/task-definitions/${ids.definitionId('keller')}/materialize`,
    headers: authHeaders(admin),
    payload: { publishImmediately: false },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { instance: { id: string; status: string; publishedAt: string | null } };
  expect(body.instance.status).toBe('DRAFT');
  expect(body.instance.publishedAt).toBeNull();

  const historyTypes = (
    await db.taskHistoryEvent.findMany({ where: { taskInstanceId: body.instance.id } })
  ).map((e) => e.type);
  expect(historyTypes).toEqual(['CREATED']);

  await db.taskInstance.delete({ where: { id: body.instance.id } });
});

test('materializing again while an instance is still open hits the maxOpenInstancesPerDefinition cap', async () => {
  const first = await app.inject({
    method: 'POST',
    url: `/api/admin/task-definitions/${ids.definitionId('keller')}/materialize`,
    headers: authHeaders(admin),
    payload: {},
  });
  expect(first.statusCode).toBe(201);
  const { instance } = first.json() as { instance: { id: string } };

  try {
    const second = await app.inject({
      method: 'POST',
      url: `/api/admin/task-definitions/${ids.definitionId('keller')}/materialize`,
      headers: authHeaders(admin),
      payload: {},
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: { code: 'HAS_OPEN_INSTANCES', details: { count: 1 } },
    });
  } finally {
    await db.taskInstance.delete({ where: { id: instance.id } });
  }
});

test('a non-admin cannot materialize a task definition', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/task-definitions/${ids.definitionId('keller')}/materialize`,
    headers: authHeaders(bob),
    payload: {},
  });
  expect(response.statusCode).toBe(403);
});

test('the definition detail view includes an open instance with its active assignee', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'keller', 5);
  try {
    const taken = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/volunteer`,
      headers: authHeaders(bob),
      payload: {},
    });
    expect(taken.statusCode).toBe(200);

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/task-definitions/${ids.definitionId('keller')}`,
      headers: authHeaders(admin),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      instances: {
        id: string;
        status: string;
        currentValue: number;
        assignments: { kind: string; member: { id: string; displayName: string } }[];
      }[];
    };
    const instance = body.instances.find((i) => i.id === instanceId);
    expect(instance).toBeDefined();
    expect(instance!.status).toBe('ASSIGNED');
    expect(instance!.assignments).toHaveLength(1);
    expect(instance!.assignments[0]!.kind).toBe('VOLUNTARY');
    expect(instance!.assignments[0]!.member).toMatchObject({ displayName: 'Bob' });
  } finally {
    await db.taskInstance.delete({ where: { id: instanceId } });
  }
});

test('materializing an unknown definition is a 404, not a leak', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/task-definitions/does-not-belong-to-this-household/materialize',
    headers: authHeaders(admin),
    payload: {},
  });
  expect(response.statusCode).toBe(404);
});
