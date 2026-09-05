/**
 * `TASK_DUE_SOON` (intake "due-soon-reminder-for-assigned-tasks") — wiring up
 * a `NotificationType` that had sat dormant in the enum/config/i18n surface
 * since the push-notifications campaign, never fired anywhere.
 *
 * Trigger: an `ASSIGNED` `TaskInstance` with both `dueAt` and
 * `definition.estimatedMinutes` set notifies every currently `ACTIVE`
 * `TaskAssignment` (any `kind`) exactly once, the moment
 * `now >= dueAt - dueSoonDurationMultiplier * estimatedMinutes` (default
 * multiplier `2`, `NotificationsConfig.dueSoonDurationMultiplier`).
 *
 * Idempotency is the interesting part: `dueSoonNotifiedAt` lives on
 * `TaskAssignment`, not `TaskInstance`, precisely so a later assignee on the
 * same instance (after a buyout or an expiry-penalty re-offer) still gets
 * their own chance to be warned — see the field's schema comment.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import { dbNotifier, type Deps } from '../../src/app/deps.js';
import { pushNotifier } from '../../src/app/notifications/pushNotifier.js';
import { createHousehold, dropHousehold, idsFor, testDb, testDeps, type FixtureIds } from './_fixture.js';

const ids = idsFor('test-duesoon-');

let db: PrismaClient;
let sweepDeps: Deps;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
      { key: 'luise', displayName: 'Luise', role: 'MEMBER' },
    ],
    // `estimatedMinutes` defaults to 10 for every definition the fixture
    // creates (see `createHousehold`'s `taskDefinition.create` call).
    definitions: [{ key: 'chore', title: 'Bad putzen', baseValue: 6 }],
  });
  sweepDeps = { ...testDeps(db), notifier: pushNotifier(dbNotifier) };
}, 60_000);

afterAll(async () => {
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.pushOutboxItem.deleteMany({ where: { householdId: ids.householdId } });
  await db.notification.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskAssignment.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskInstance.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskDefinition.updateMany({
    where: { householdId: ids.householdId },
    data: { nextDueAt: null, estimatedMinutes: 10 },
  });
});

/** An `ASSIGNED` instance of the `chore` definition, due `dueAt`. */
async function createAssignedInstance(
  fixtureIds: FixtureIds,
  dueAt: Date | null,
): Promise<string> {
  const now = new Date();
  const instance = await db.taskInstance.create({
    data: {
      householdId: fixtureIds.householdId,
      taskDefinitionId: fixtureIds.definitionId('chore'),
      status: 'ASSIGNED',
      currentValue: 6,
      baseValue: 6,
      scheduledFor: now,
      dueAt,
      publishedAt: now,
      configVersion: 1,
      activeSlotCount: 1,
    },
    select: { id: true },
  });
  return instance.id;
}

/** One `ACTIVE` `TaskAssignment` occupying `slotIndex` of an instance. */
async function createActiveAssignment(
  fixtureIds: FixtureIds,
  instanceId: string,
  memberKey: string,
  options: { slotIndex?: number; dueSoonNotifiedAt?: Date | null } = {},
): Promise<string> {
  const slotIndex = options.slotIndex ?? 0;
  const assignment = await db.taskAssignment.create({
    data: {
      householdId: fixtureIds.householdId,
      taskInstanceId: instanceId,
      memberId: fixtureIds.memberId(memberKey),
      kind: 'RANDOM',
      status: 'ACTIVE',
      response: 'PENDING',
      slotIndex,
      activeForInstanceId: slotIndex === 0 ? instanceId : null,
      activeSlotKey: `${instanceId}:${slotIndex}`,
      valueAtAssignment: 6,
      configVersion: 1,
      dueSoonNotifiedAt: options.dueSoonNotifiedAt ?? null,
    },
    select: { id: true },
  });
  return assignment.id;
}

test('fires exactly one TASK_DUE_SOON, in-app and via push, once the threshold is crossed', async () => {
  // dueSoonDurationMultiplier default 2, estimatedMinutes 10 -> lead 20 min.
  // dueAt 5 minutes out puts the threshold 15 minutes in the past already.
  const dueAt = new Date(Date.now() + 5 * 60_000);
  const instanceId = await createAssignedInstance(ids, dueAt);
  await createActiveAssignment(ids, instanceId, 'arthur');

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.dueSoonNotified).toBe(1);

  const notified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
    select: { memberId: true },
  });
  expect(notified.map((n) => n.memberId)).toEqual([ids.memberId('arthur')]);

  const pushed = await db.pushOutboxItem.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
    select: { memberId: true },
  });
  expect(pushed.map((p) => p.memberId)).toEqual([ids.memberId('arthur')]);

  const assignment = await db.taskAssignment.findFirstOrThrow({
    where: { householdId: ids.householdId, taskInstanceId: instanceId },
    select: { dueSoonNotifiedAt: true },
  });
  expect(assignment.dueSoonNotifiedAt).not.toBeNull();
});

test('never fires when dueAt is null, even past what would be the threshold', async () => {
  const instanceId = await createAssignedInstance(ids, null);
  await createActiveAssignment(ids, instanceId, 'arthur');

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.dueSoonNotified).toBe(0);

  const count = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
  });
  expect(count).toBe(0);
});

test('never fires when estimatedMinutes is null, even past what would be the threshold', async () => {
  await db.taskDefinition.update({
    where: { id: ids.definitionId('chore') },
    data: { estimatedMinutes: null },
  });
  // Still ahead of dueAt itself (not overdue) — isolates the missing
  // estimatedMinutes as the reason for silence, rather than also tripping
  // the T16-T18 expiry step, which uses dueAt as its own deadline.
  const dueAt = new Date(Date.now() + 5 * 60_000);
  const instanceId = await createAssignedInstance(ids, dueAt);
  await createActiveAssignment(ids, instanceId, 'arthur');

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.dueSoonNotified).toBe(0);

  const count = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
  });
  expect(count).toBe(0);
});

test('fires exactly once per assignment — a second sweep tick after the threshold does not re-notify', async () => {
  const dueAt = new Date(Date.now() + 5 * 60_000);
  const instanceId = await createAssignedInstance(ids, dueAt);
  await createActiveAssignment(ids, instanceId, 'arthur');

  const first = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(first.dueSoonNotified).toBe(1);

  const second = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(second.dueSoonNotified).toBe(0);

  const count = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
  });
  expect(count).toBe(1);
});

test('a multi-worker instance notifies every currently active worker independently', async () => {
  const dueAt = new Date(Date.now() + 5 * 60_000);
  const instanceId = await createAssignedInstance(ids, dueAt);
  await db.taskInstance.update({
    where: { id: instanceId },
    data: { workerCountMode: 'AT_LEAST', workerCount: 2, activeSlotCount: 2 },
  });
  await createActiveAssignment(ids, instanceId, 'arthur', { slotIndex: 0 });
  await createActiveAssignment(ids, instanceId, 'luise', { slotIndex: 1 });

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.dueSoonNotified).toBe(2);

  const notified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
    select: { memberId: true },
  });
  expect(notified.map((n) => n.memberId).sort()).toEqual(
    [ids.memberId('arthur'), ids.memberId('luise')].sort(),
  );
});

test('reads TaskDefinition.estimatedMinutes live — an admin edit shifts the observed firing point, not a stale/pinned copy', async () => {
  // dueAt 60 minutes out. estimatedMinutes 10 -> lead 20 min -> threshold at
  // +40 min: not yet due.
  const dueAt = new Date(Date.now() + 60 * 60_000);
  const instanceId = await createAssignedInstance(ids, dueAt);
  await createActiveAssignment(ids, instanceId, 'arthur');

  const before = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(before.dueSoonNotified).toBe(0);
  const beforeCount = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
  });
  expect(beforeCount).toBe(0);

  // Raising estimatedMinutes to 40 -> lead 80 min -> threshold at -20 min:
  // already past. No pinned copy on the instance/assignment is consulted, so
  // this admin edit on the still-open instance must be observed immediately.
  await db.taskDefinition.update({
    where: { id: ids.definitionId('chore') },
    data: { estimatedMinutes: 40 },
  });

  const after = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(after.dueSoonNotified).toBe(1);
  const afterCount = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
  });
  expect(afterCount).toBe(1);
});

test('a new assignment on the same instance (post-buyout shape) gets its own independent chance to be notified', async () => {
  // Simulates the tail end of a buyout/expiry-penalty re-offer: the same
  // instance and dueAt, but a fresh TaskAssignment row for the new holder.
  // The prior holder's row already carries dueSoonNotifiedAt (they were
  // warned before losing/leaving the slot) and is closed; if the dedup flag
  // lived on TaskInstance instead, this new row's owner could wrongly never
  // be notified at all — the regression this test guards against.
  const dueAt = new Date(Date.now() + 5 * 60_000); // threshold already past
  const instanceId = await createAssignedInstance(ids, dueAt);
  const oldAssignmentId = await createActiveAssignment(ids, instanceId, 'arthur', {
    dueSoonNotifiedAt: new Date(Date.now() - 10 * 60_000),
  });
  // EXPIRED rather than BOUGHT_OUT: a real buyout's closed row also carries
  // buyoutCost/valueBeforeBuyout/valueAfterBuyout together (CHECK
  // `ta_buyout_fields_together`), which is irrelevant to what this test is
  // proving — only that a *closed* prior assignment's dueSoonNotifiedAt does
  // not leak onto the instance's next holder.
  await db.taskAssignment.update({
    where: { id: oldAssignmentId },
    data: {
      status: 'EXPIRED',
      closedAt: new Date(),
      activeForInstanceId: null,
      activeSlotKey: null,
    },
  });
  await createActiveAssignment(ids, instanceId, 'luise');

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.dueSoonNotified).toBe(1);

  const notified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, type: 'TASK_DUE_SOON' },
    select: { memberId: true },
  });
  expect(notified.map((n) => n.memberId)).toEqual([ids.memberId('luise')]);
});
