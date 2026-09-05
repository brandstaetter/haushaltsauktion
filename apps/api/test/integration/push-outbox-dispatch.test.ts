/**
 * `dispatchPushOutbox` (push-notifications §Architekturvorschlag, Phase 2 —
 * rollback-safety fix).
 *
 * Exercises the dispatcher directly against a real `PushOutboxItem` table
 * and a fake `PushSender`, the same way `push-notifier.test.ts` exercises
 * the enqueue side. What matters here: every claimed row is gone after one
 * pass regardless of outcome (no retry — push is best-effort), a disabled
 * household's rows are dropped without ever calling `push.send`, and a
 * `gone: true` result cleans up the dead `PushSubscription` alongside the
 * outbox row.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { DEFAULT_CONFIG, parseConfig } from '@haushaltsauktion/shared';

import type { Deps } from '../../src/app/deps.js';
import type { PushSendResult, PushSender, PushSubscriptionKeys } from '../../src/app/integrations/ports.js';
import { dispatchPushOutbox } from '../../src/app/notifications/dispatchPushOutbox.js';
import {
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  testDb,
  testDeps,
} from './_fixture.js';

const ids = idsFor('test-pushdispatch-');

let db: PrismaClient;

async function setPushEnabled(enabled: boolean): Promise<void> {
  await db.householdConfiguration.update({
    where: { id: ids.configId },
    data: {
      values: parseConfig({
        ...DEFAULT_CONFIG,
        notifications: { ...DEFAULT_CONFIG.notifications, pushEnabled: enabled },
      }) as unknown as Prisma.InputJsonObject,
    },
  });
}

function recordingPush(outcome: (endpoint: string) => PushSendResult): {
  push: PushSender;
  calls: { endpoint: string; payload: Record<string, unknown> }[];
} {
  const calls: { endpoint: string; payload: Record<string, unknown> }[] = [];
  return {
    calls,
    push: {
      send: (subscription: PushSubscriptionKeys, payload: Record<string, unknown>) => {
        calls.push({ endpoint: subscription.endpoint, payload });
        return Promise.resolve(outcome(subscription.endpoint));
      },
    },
  };
}

function depsWith(push: PushSender): Deps {
  return { ...testDeps(db), push };
}

async function enqueue(
  memberKey: string,
  type: string,
  taskInstanceId: string | null,
): Promise<string> {
  const row = await db.pushOutboxItem.create({
    data: {
      householdId: ids.householdId,
      memberId: ids.memberId(memberKey),
      type,
      payload: { value: 6 },
      taskInstanceId,
    },
    select: { id: true },
  });
  return row.id;
}

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
  await db.pushSubscription.deleteMany({ where: { memberId: ids.memberId('elke') } });
  await db.pushSubscription.deleteMany({ where: { memberId: ids.memberId('arthur') } });
  await setPushEnabled(true);
});

test('deps.push undefined: a no-op, nothing claimed', async () => {
  await enqueue('elke', 'TASK_ASSIGNED', null);

  const outcome = await dispatchPushOutbox(testDeps(db), { householdId: ids.householdId }); // no `push` set

  expect(outcome).toEqual({ claimed: 0, delivered: 0, skippedHouseholdDisabled: 0 });
  const remaining = await db.pushOutboxItem.count({ where: { householdId: ids.householdId } });
  expect(remaining).toBe(1);
});

test('household with notifications.pushEnabled = false: rows are deleted, push.send is never called', async () => {
  await setPushEnabled(false);
  await db.pushSubscription.create({
    data: { memberId: ids.memberId('elke'), endpoint: 'https://push.example/disabled', p256dh: 'p', auth: 'a' },
  });
  const rowId = await enqueue('elke', 'TASK_ASSIGNED', null);
  const { push, calls } = recordingPush(() => ({ ok: true }));

  const outcome = await dispatchPushOutbox(depsWith(push), { householdId: ids.householdId });

  expect(outcome.claimed).toBe(1);
  expect(outcome.skippedHouseholdDisabled).toBe(1);
  expect(calls.length).toBe(0);
  const row = await db.pushOutboxItem.findUnique({ where: { id: rowId } });
  expect(row).toBeNull();
});

test('successful send: the outbox row is deleted, the subscription is left alone', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
  const sub = await db.pushSubscription.create({
    data: { memberId: ids.memberId('elke'), endpoint: 'https://push.example/ok', p256dh: 'p', auth: 'a' },
  });
  const rowId = await enqueue('elke', 'TASK_ASSIGNED', instanceId);
  const { push, calls } = recordingPush(() => ({ ok: true }));

  const outcome = await dispatchPushOutbox(depsWith(push), { householdId: ids.householdId });

  expect(outcome.claimed).toBe(1);
  expect(outcome.delivered).toBe(1);
  expect(calls.length).toBe(1);
  expect(calls[0]?.payload).toMatchObject({ type: 'TASK_ASSIGNED', taskTitle: 'Bad putzen' });

  const row = await db.pushOutboxItem.findUnique({ where: { id: rowId } });
  expect(row).toBeNull();
  const subscriptionRow = await db.pushSubscription.findUnique({ where: { id: sub.id } });
  expect(subscriptionRow).not.toBeNull();
});

test('a `gone: true` result deletes both the outbox row and the dead subscription', async () => {
  const sub = await db.pushSubscription.create({
    data: { memberId: ids.memberId('elke'), endpoint: 'https://push.example/dead', p256dh: 'p', auth: 'a' },
  });
  const rowId = await enqueue('elke', 'TASK_ASSIGNED', null);
  const { push } = recordingPush(() => ({ ok: false, gone: true }));

  await dispatchPushOutbox(depsWith(push), { householdId: ids.householdId });

  const row = await db.pushOutboxItem.findUnique({ where: { id: rowId } });
  expect(row).toBeNull();
  const subscriptionRow = await db.pushSubscription.findUnique({ where: { id: sub.id } });
  expect(subscriptionRow).toBeNull();
});

test('a `gone: false` result still deletes the outbox row (best-effort, no retry) and leaves the subscription', async () => {
  const sub = await db.pushSubscription.create({
    data: { memberId: ids.memberId('elke'), endpoint: 'https://push.example/flaky', p256dh: 'p', auth: 'a' },
  });
  const rowId = await enqueue('elke', 'TASK_ASSIGNED', null);
  const { push } = recordingPush(() => ({ ok: false, gone: false }));

  await dispatchPushOutbox(depsWith(push), { householdId: ids.householdId });

  const row = await db.pushOutboxItem.findUnique({ where: { id: rowId } });
  expect(row).toBeNull();
  const subscriptionRow = await db.pushSubscription.findUnique({ where: { id: sub.id } });
  expect(subscriptionRow).not.toBeNull();
});

test('a thrown error from push.send still deletes that row and does not affect other rows in the batch', async () => {
  await db.pushSubscription.create({
    data: { memberId: ids.memberId('elke'), endpoint: 'https://push.example/throws', p256dh: 'p', auth: 'a' },
  });
  await db.pushSubscription.create({
    data: { memberId: ids.memberId('arthur'), endpoint: 'https://push.example/other-member', p256dh: 'p', auth: 'a' },
  });
  const throwingRowId = await enqueue('elke', 'TASK_ASSIGNED', null);
  const otherRowId = await enqueue('arthur', 'TASK_TAKEN', null);

  const throwingPush: PushSender = {
    send: (subscription) => {
      if (subscription.endpoint === 'https://push.example/throws') {
        throw new Error('simulierter Transportfehler');
      }
      return Promise.resolve({ ok: true });
    },
  };

  const outcome = await dispatchPushOutbox(depsWith(throwingPush), { householdId: ids.householdId });

  expect(outcome.claimed).toBe(2);
  expect(outcome.delivered).toBe(2);
  const throwingRow = await db.pushOutboxItem.findUnique({ where: { id: throwingRowId } });
  expect(throwingRow).toBeNull();
  const otherRow = await db.pushOutboxItem.findUnique({ where: { id: otherRowId } });
  expect(otherRow).toBeNull();
});

test('a member with no subscribed device: the row is simply deleted, no send attempted', async () => {
  const rowId = await enqueue('elke', 'TASK_ASSIGNED', null);
  const { push, calls } = recordingPush(() => ({ ok: true }));

  await dispatchPushOutbox(depsWith(push), { householdId: ids.householdId });

  expect(calls.length).toBe(0);
  const row = await db.pushOutboxItem.findUnique({ where: { id: rowId } });
  expect(row).toBeNull();
});
