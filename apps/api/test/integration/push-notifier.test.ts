/**
 * `pushNotifier` decorator (push-notifications §Architekturvorschlag,
 * Phase 2 — rollback-safety fix).
 *
 * This decorator no longer sends anything itself. It only enqueues
 * `PushOutboxItem` rows, inside the same transaction `inner.emit` used for
 * the in-app `Notification` rows — so what's under test here is purely the
 * enqueue: which types get a row, what that row contains, and — the whole
 * point of this fix — that the row disappears along with everything else
 * when the caller's transaction rolls back. Actual delivery is covered by
 * `push-outbox-dispatch.test.ts`.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { dbNotifier } from '../../src/app/deps.js';
import { pushNotifier } from '../../src/app/notifications/pushNotifier.js';
import {
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  testDb,
} from './_fixture.js';

const ids = idsFor('test-pushnotifier-');

let db: PrismaClient;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
    ],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: 6 }],
  });
}, 60_000);

afterAll(async () => {
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.pushOutboxItem.deleteMany({ where: { householdId: ids.householdId } });
  await db.notification.deleteMany({ where: { householdId: ids.householdId } });
});

test('an allow-listed type enqueues a PushOutboxItem row alongside the in-app Notification', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const notifier = pushNotifier(dbNotifier);

  await db.$transaction((tx) =>
    notifier.emit(tx, [
      {
        householdId: ids.householdId,
        memberId: ids.memberId('elke'),
        type: 'TASK_ASSIGNED',
        payload: { value: 6 },
        taskInstanceId: instanceId,
      },
    ]),
  );

  const notification = await db.notification.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(notification.type).toBe('TASK_ASSIGNED');

  const outboxRow = await db.pushOutboxItem.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(outboxRow.type).toBe('TASK_ASSIGNED');
  expect(outboxRow.taskInstanceId).toBe(instanceId);
  expect(outboxRow.payload).toMatchObject({ value: 6 });
});

test('a non-allow-listed type gets an in-app row but no PushOutboxItem row', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const notifier = pushNotifier(dbNotifier);

  // TASK_COMPLETED is not (yet) in the allow-list — Phase 3's job.
  await db.$transaction((tx) =>
    notifier.emit(tx, [
      {
        householdId: ids.householdId,
        memberId: ids.memberId('elke'),
        type: 'TASK_COMPLETED',
        payload: { by: 'Elke' },
        taskInstanceId: instanceId,
      },
    ]),
  );

  const notification = await db.notification.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(notification.type).toBe('TASK_COMPLETED');

  const outboxCount = await db.pushOutboxItem.count({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(outboxCount).toBe(0);
});

test('one call with a mix of drafts enqueues only the allow-listed ones', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const notifier = pushNotifier(dbNotifier);

  await db.$transaction((tx) =>
    notifier.emit(tx, [
      {
        householdId: ids.householdId,
        memberId: ids.memberId('elke'),
        type: 'TASK_ASSIGNED',
        payload: { value: 6 },
        taskInstanceId: instanceId,
      },
      {
        householdId: ids.householdId,
        memberId: ids.memberId('arthur'),
        type: 'TASK_TAKEN',
        payload: { value: 6 },
        taskInstanceId: instanceId,
      },
      {
        householdId: ids.householdId,
        memberId: ids.memberId('arthur'),
        type: 'TASK_COMPLETED',
        payload: { by: 'Arthur' },
        taskInstanceId: instanceId,
      },
    ]),
  );

  const rows = await db.pushOutboxItem.findMany({ where: { householdId: ids.householdId } });
  expect(rows.map((r) => r.type).sort()).toEqual(['TASK_ASSIGNED', 'TASK_TAKEN']);
});

test('§24 core regression: a transaction that rolls back after emit() leaves zero PushOutboxItem rows', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const notifier = pushNotifier(dbNotifier);

  await expect(
    db.$transaction(async (tx) => {
      await notifier.emit(tx, [
        {
          householdId: ids.householdId,
          memberId: ids.memberId('elke'),
          type: 'TASK_ASSIGNED',
          payload: { value: 6 },
          taskInstanceId: instanceId,
        },
      ]);
      // Simulate a later statement in the same transaction failing — the
      // exact scenario the old implementation got wrong: the push had
      // already gone out by this point, even though everything below,
      // including the in-app Notification row, is about to vanish.
      throw new Error('simulierter Fehler nach dem Enqueue, vor dem Commit');
    }),
  ).rejects.toThrow('simulierter Fehler nach dem Enqueue, vor dem Commit');

  const notificationCount = await db.notification.count({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(notificationCount).toBe(0);

  const outboxCount = await db.pushOutboxItem.count({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
  });
  expect(outboxCount).toBe(0);
});

test('no drafts at all: neither inner.emit nor the outbox write does anything', async () => {
  const notifier = pushNotifier(dbNotifier);

  await expect(db.$transaction((tx) => notifier.emit(tx, []))).resolves.toBeUndefined();

  const outboxCount = await db.pushOutboxItem.count({ where: { householdId: ids.householdId } });
  expect(outboxCount).toBe(0);
});
