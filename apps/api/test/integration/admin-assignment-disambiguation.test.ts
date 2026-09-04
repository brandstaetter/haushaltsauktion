/**
 * Admin instance-level actions (`revoke-assignment`, `reject-completion`)
 * that pick "the" active/completed assignment on an instance must disambiguate
 * once more than one slot can be active or completed at once
 * (multi-worker-tasks; see `.planning/campaigns/multi-worker-tasks.md`).
 *
 * `EXACTLY(1)` must stay byte-identical to the pre-existing behavior (no
 * `assignmentId` required, no new error for a single candidate). An
 * `AT_LEAST`/`AT_MOST`/`EXACTLY(n>1)` instance with more than one candidate
 * must now require an explicit `assignmentId` — and reject both silence and a
 * foreign id loudly rather than acting on an arbitrary row.
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

const ids = idsFor('test-admin-assignment-disambig-');

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session; // ADMIN
let paul: Session; // MEMBER
let maria: Session; // MEMBER

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
    ],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: 6 }],
  });
  // A single shared multi-slot definition — reused by every
  // `createMultiSlotAssignedInstance()` call below to create fresh instances.
  await db.taskDefinition.create({
    data: {
      id: ids.definitionId('multi'),
      householdId: ids.householdId,
      title: 'Garten',
      categoryId: ids.categoryId,
      baseValue: 6,
      estimatedMinutes: 20,
      recurrenceType: 'MANUAL',
      workerCountMode: 'AT_LEAST',
      workerCount: 2,
    },
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

async function createMultiSlotAssignedInstance(): Promise<{
  instanceId: string;
  paulAssignmentId: string;
  mariaAssignmentId: string;
}> {
  const now = new Date();
  const defId = ids.definitionId('multi');
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: defId,
      status: 'ASSIGNED',
      currentValue: 6,
      baseValue: 6,
      scheduledFor: now,
      publishedAt: now,
      configVersion: 1,
      workerCountMode: 'AT_LEAST',
      workerCount: 2,
      activeSlotCount: 2,
    },
    select: { id: true },
  });
  const paulAssignment = await db.taskAssignment.create({
    data: {
      householdId: ids.householdId,
      taskInstanceId: instance.id,
      memberId: paul.memberId,
      kind: 'VOLUNTARY',
      status: 'ACTIVE',
      response: 'ACCEPTED',
      activeForInstanceId: instance.id,
      slotIndex: 0,
      activeSlotKey: `${instance.id}:0`,
      valueAtAssignment: 6,
      configVersion: 1,
      assignedAt: now,
      respondedAt: now,
    },
    select: { id: true },
  });
  const mariaAssignment = await db.taskAssignment.create({
    data: {
      householdId: ids.householdId,
      taskInstanceId: instance.id,
      memberId: maria.memberId,
      kind: 'VOLUNTARY',
      status: 'ACTIVE',
      response: 'ACCEPTED',
      activeForInstanceId: null,
      slotIndex: 1,
      activeSlotKey: `${instance.id}:1`,
      valueAtAssignment: 6,
      configVersion: 1,
      assignedAt: now,
      respondedAt: now,
    },
    select: { id: true },
  });
  return {
    instanceId: instance.id,
    paulAssignmentId: paulAssignment.id,
    mariaAssignmentId: mariaAssignment.id,
  };
}

test('(a) EXACTLY(1): revoke ohne assignmentId funktioniert wie bisher', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const taken = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/volunteer`,
    headers: authHeaders(paul),
    payload: {},
  });
  expect(taken.statusCode).toBe(200);

  const revoked = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/revoke-assignment`,
    headers: authHeaders(elke),
    payload: {},
  });
  expect(revoked.statusCode, JSON.stringify(revoked.json())).toBe(200);

  const instanceRow = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { status: true },
  });
  expect(instanceRow.status).toBe('AVAILABLE');
});

test('(b) Mehrere aktive Slots, kein assignmentId: 409 AMBIGUOUS_ASSIGNMENT, nichts wird verändert', async () => {
  const { instanceId } = await createMultiSlotAssignedInstance();

  const revoked = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/revoke-assignment`,
    headers: authHeaders(elke),
    payload: {},
  });
  expect(revoked.statusCode).toBe(409);
  expect((revoked.json() as { error: { code: string } }).error.code).toBe(
    'AMBIGUOUS_ASSIGNMENT',
  );

  // Nothing changed: both slots still active, instance still ASSIGNED.
  const active = await db.taskAssignment.findMany({
    where: { taskInstanceId: instanceId, status: 'ACTIVE' },
    select: { id: true },
  });
  expect(active).toHaveLength(2);
  const instanceRow = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { status: true },
  });
  expect(instanceRow.status).toBe('ASSIGNED');
});

test('(c) Mehrere aktive Slots, korrekte assignmentId: trifft genau diesen Slot, der andere bleibt unberührt', async () => {
  const { instanceId, paulAssignmentId, mariaAssignmentId } =
    await createMultiSlotAssignedInstance();

  const revoked = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/revoke-assignment`,
    headers: authHeaders(elke),
    payload: { assignmentId: paulAssignmentId },
  });
  expect(revoked.statusCode, JSON.stringify(revoked.json())).toBe(200);

  const paulRow = await db.taskAssignment.findUniqueOrThrow({
    where: { id: paulAssignmentId },
    select: { status: true },
  });
  expect(paulRow.status).toBe('REVOKED');

  // Maria's own assignment row is untouched — this is what this fix is
  // actually about: the backend now targets Paul's slot specifically instead
  // of an arbitrary ACTIVE row, so it never touches Maria's.
  const mariaRow = await db.taskAssignment.findUniqueOrThrow({
    where: { id: mariaAssignmentId },
    select: { status: true },
  });
  expect(mariaRow.status).toBe('ACTIVE');

  // AVAILABLE is correct here, not a bug: this fixture is AT_LEAST(2), so
  // `minRequired` is 2. Revoking one of the two active slots leaves 1 < 2 —
  // understaffed — so `releaseOrRevokeAssignment` (reopen.ts) reopens the
  // whole instance with a fresh offer window, exactly like today's
  // single-slot case. See `multi-worker-lifecycle.test.ts` for the
  // still-staffed branch (AT_MOST/AT_LEAST(1) with a surplus volunteer),
  // where the instance instead stays ASSIGNED and Maria's slot is untouched.
  const instanceRow = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { status: true },
  });
  expect(instanceRow.status).toBe('AVAILABLE');
});

test('(d) Falsche/fremde assignmentId wird abgelehnt statt stillschweigend ignoriert', async () => {
  const { instanceId, mariaAssignmentId } = await createMultiSlotAssignedInstance();

  // A foreign id (well-formed, but not a candidate row for this instance).
  const revoked = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/revoke-assignment`,
    headers: authHeaders(elke),
    payload: { assignmentId: 'does-not-exist-on-this-instance' },
  });
  expect(revoked.statusCode).toBe(404);
  expect((revoked.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');

  // Nothing changed — including Maria's slot, which the arbitrary-pick bug
  // could otherwise have silently released.
  const mariaRow = await db.taskAssignment.findUniqueOrThrow({
    where: { id: mariaAssignmentId },
    select: { status: true },
  });
  expect(mariaRow.status).toBe('ACTIVE');
});

test('reject-completion: dieselbe Mehrdeutigkeitsprüfung gilt für COMPLETED-Kandidaten', async () => {
  const { instanceId, paulAssignmentId, mariaAssignmentId } =
    await createMultiSlotAssignedInstance();

  // The unanimous-completion gate closes the whole instance only once every
  // slot has independently completed — and each slot's own row already
  // moved to COMPLETED at the moment *it* completed (completeTask.ts marks
  // only its own assignment per call), so by the time the instance itself is
  // COMPLETED, all `workerCount` assignment rows are COMPLETED together.
  // Constructed directly here (bypassing the real `completeTask` calls), the
  // same way multi-worker-lifecycle.test.ts builds a specific starting
  // position — mirroring exactly what `completeTask.ts`'s last-slot branch
  // writes on both sides.
  const now = new Date();
  await db.taskAssignment.updateMany({
    where: { id: { in: [paulAssignmentId, mariaAssignmentId] } },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      closedAt: now,
      activeForInstanceId: null,
      activeSlotKey: null,
    },
  });
  await db.taskInstance.update({
    where: { id: instanceId },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      closedAt: now,
      completedByMemberId: paul.memberId,
      activeSlotCount: 0,
    },
  });

  const ambiguous = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/reject-completion`,
    headers: authHeaders(elke),
    payload: { outcome: 'REOFFER_MARKET' },
  });
  expect(ambiguous.statusCode).toBe(409);
  expect((ambiguous.json() as { error: { code: string } }).error.code).toBe(
    'AMBIGUOUS_ASSIGNMENT',
  );

  const targeted = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/reject-completion`,
    headers: authHeaders(elke),
    payload: { outcome: 'REOFFER_MARKET', assignmentId: paulAssignmentId },
  });
  expect(targeted.statusCode, JSON.stringify(targeted.json())).toBe(200);

  const mariaRow = await db.taskAssignment.findUniqueOrThrow({
    where: { id: mariaAssignmentId },
    select: { status: true },
  });
  expect(mariaRow.status).toBe('COMPLETED');
});
