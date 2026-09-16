/**
 * Intake "time-based-value-growth" + "single-random-assignment", end to end.
 *
 * The new §10: a chore is conscripted to somebody at most once. After that it
 * goes back on the market and gets steadily more rewarding until somebody
 * volunteers — nobody is ever force-assigned the same chore twice.
 *
 * Runs the real sweep against Postgres; only the clock and RNG are seams.
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { cloneDefaultConfig, type HouseholdConfig } from '@haushaltsauktion/shared';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import { dbNotifier, type Deps } from '../../src/app/deps.js';
import { createHousehold, dropHousehold, idsFor, testDb, testDeps } from './_fixture.js';

const ids = idsFor('test-value-growth-');
const T0 = new Date('2026-09-16T08:00:00.000Z');
const hoursAfter = (h: number): Date => new Date(T0.getTime() + h * 3_600_000);

let db: PrismaClient;

function depsAt(now: Date, rngValue = 0): Deps {
  return {
    ...testDeps(db),
    clock: { now: () => now },
    rng: { next: () => rngValue },
    notifier: dbNotifier,
  };
}

async function installConfig(
  mutate: (config: HouseholdConfig) => void = () => undefined,
): Promise<number> {
  const config = cloneDefaultConfig();
  mutate(config);
  await db.householdConfiguration.create({
    data: {
      id: `${ids.prefix}config-v2`,
      householdId: ids.householdId,
      version: 2,
      values: config as never,
    },
  });
  return 2;
}

/**
 * An instance already on the market, ripe for the random draw at `T0`.
 *
 * `dueAt` sits a month out on purpose while `offerExpiresAt` is already in the
 * past: that combination makes the instance ripe for the draw *without* making
 * it expire partway through a test that advances the clock by hours (T16-T18
 * would otherwise EXPIRE it and there would be nothing left to grow).
 */
async function createRipe(
  configVersion: number,
  options: { currentValue?: number; growthAnchor?: Date | null; ripe?: boolean } = {},
): Promise<string> {
  const value = options.currentValue ?? 4;
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore'),
      status: 'AVAILABLE',
      currentValue: value,
      baseValue: value,
      scheduledFor: T0,
      dueAt: new Date(T0.getTime() + 30 * 24 * 3_600_000),
      publishedAt: T0,
      // `null` ⇒ never reached by the random draw; `T0` ⇒ ripe immediately.
      offerExpiresAt: options.ripe === false ? null : T0,
      valueGrowthAt: options.growthAnchor === undefined ? T0 : options.growthAnchor,
      configVersion,
    },
    select: { id: true },
  });
  return instance.id;
}

const valueOf = async (id: string): Promise<number> =>
  (await db.taskInstance.findUniqueOrThrow({ where: { id }, select: { currentValue: true } }))
    .currentValue;

const statusOf = async (id: string): Promise<string> =>
  (await db.taskInstance.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

const randomAssignmentCount = (id: string): Promise<number> =>
  db.taskAssignment.count({ where: { taskInstanceId: id, kind: 'RANDOM' } });

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
      { key: 'luise', displayName: 'Luise', role: 'MEMBER' },
    ],
    definitions: [{ key: 'chore', title: 'Bad putzen', baseValue: 4 }],
  });
}, 60_000);

afterAll(async () => {
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.notification.deleteMany({ where: { householdId: ids.householdId } });
  await db.auditEvent.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskHistoryEvent.deleteMany({ where: { householdId: ids.householdId } });
  await db.pointTransaction.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskAssignment.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskInstance.deleteMany({ where: { householdId: ids.householdId } });
  await db.householdConfiguration.deleteMany({
    where: { householdId: ids.householdId, version: { gt: 1 } },
  });
  await db.taskDefinition.update({
    where: { id: ids.definitionId('chore') },
    data: { carriedValue: null, nextDueAt: null },
  });
});

test('an unclaimed task on the market gains its configured points per hour', async () => {
  const version = await installConfig();
  // No due date and far from ripe: this one is never conscripted, it only sits
  // there and grows — the pure "nobody wants it" case.
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore'),
      status: 'AVAILABLE',
      currentValue: 4,
      baseValue: 4,
      scheduledFor: T0,
      publishedAt: T0,
      offerExpiresAt: null, // no dueAt ⇒ never auto-assigned (§5.8)
      valueGrowthAt: T0,
      configVersion: version,
    },
    select: { id: true, version: true },
  });

  // Half an hour in: nothing owed yet.
  await runAssignmentSweep(depsAt(new Date(T0.getTime() + 30 * 60_000)), {
    householdId: ids.householdId,
  });
  expect(await valueOf(instance.id)).toBe(4);

  await runAssignmentSweep(depsAt(hoursAfter(1)), { householdId: ids.householdId });
  expect(await valueOf(instance.id)).toBe(5);

  await runAssignmentSweep(depsAt(hoursAfter(5)), { householdId: ids.householdId });
  expect(await valueOf(instance.id)).toBe(9);

  // §4.3: a value change is a compare-and-set change, so stale client views
  // cannot act on the old price.
  const after = await db.taskInstance.findUniqueOrThrow({
    where: { id: instance.id },
    select: { version: true },
  });
  expect(after.version).toBeGreaterThan(instance.version);
});

test('growth stops at the shared ceiling and stays there', async () => {
  const version = await installConfig((config) => {
    config.valueIncrease.maximumValue = 7;
  });
  const instance = await createRipe(version, { currentValue: 4, ripe: false });

  await runAssignmentSweep(depsAt(hoursAfter(10)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(7);

  // Anchor retired, so the instance leaves the growth query for good rather
  // than being re-examined and re-written every interval forever.
  const row = await db.taskInstance.findUniqueOrThrow({
    where: { id: instance },
    select: { valueGrowthAt: true },
  });
  expect(row.valueGrowthAt).toBeNull();

  await runAssignmentSweep(depsAt(hoursAfter(50)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(7);
});

test('growth is inert when switched off', async () => {
  const version = await installConfig((config) => {
    config.valueGrowth.enabled = false;
  });
  const instance = await createRipe(version, { currentValue: 4, ripe: false });

  await runAssignmentSweep(depsAt(hoursAfter(24)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(4);
});

test('an instance already on the market before the feature existed starts its clock at first sight, not retroactively', async () => {
  const version = await installConfig();
  // valueGrowthAt NULL is exactly what the migration leaves behind.
  const instance = await createRipe(version, { currentValue: 4, growthAnchor: null, ripe: false });

  // First sight: seeded, not credited — nobody is paid for time the household
  // never promised.
  await runAssignmentSweep(depsAt(hoursAfter(100)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(4);
  const seeded = await db.taskInstance.findUniqueOrThrow({
    where: { id: instance },
    select: { valueGrowthAt: true },
  });
  expect(seeded.valueGrowthAt).toEqual(hoursAfter(100));

  // From there it grows normally.
  await runAssignmentSweep(depsAt(hoursAfter(103)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(7);
});

test('a task is conscripted at most once, then stays on the market and grows', async () => {
  const version = await installConfig((config) => {
    config.assignment.strategy = 'PURE_RANDOM';
  });
  const instance = await createRipe(version, { currentValue: 4 });

  // First sweep: the one random assignment this instance will ever get.
  await runAssignmentSweep(depsAt(T0), { householdId: ids.householdId });
  expect(await statusOf(instance)).toBe('ASSIGNED');
  expect(await randomAssignmentCount(instance)).toBe(1);

  // Hand it back to the market, as a release or a buyout would.
  const assignment = await db.taskAssignment.findFirstOrThrow({
    where: { taskInstanceId: instance, status: 'ACTIVE' },
    select: { id: true },
  });
  await db.taskAssignment.update({
    where: { id: assignment.id },
    // activeSlotKey must go too, exactly as reopen.ts does it — leaving it
    // behind trips the unique constraint on the next draw.
    data: { status: 'RELEASED', closedAt: T0, activeForInstanceId: null, activeSlotKey: null },
  });
  await db.taskInstance.update({
    where: { id: instance },
    data: {
      status: 'AVAILABLE',
      activeSlotCount: 0,
      offerExpiresAt: T0,
      valueGrowthAt: T0,
      version: { increment: 1 },
    },
  });

  // Ripe again, and sweeps keep running — but it is never conscripted a second
  // time. It grows instead.
  for (const h of [1, 2, 3]) {
    await runAssignmentSweep(depsAt(hoursAfter(h)), { householdId: ids.householdId });
  }
  expect(await statusOf(instance)).toBe('AVAILABLE');
  expect(await randomAssignmentCount(instance)).toBe(1);
  expect(await valueOf(instance)).toBe(7);
});

test('setting maxRandomAssignmentsPerInstance to null restores repeated conscription', async () => {
  const version = await installConfig((config) => {
    config.assignment.strategy = 'PURE_RANDOM';
    config.assignment.maxRandomAssignmentsPerInstance = null;
    config.assignment.preventImmediateReassignment = false;
  });
  const instance = await createRipe(version, { currentValue: 4 });

  await runAssignmentSweep(depsAt(T0), { householdId: ids.householdId });
  expect(await randomAssignmentCount(instance)).toBe(1);

  const assignment = await db.taskAssignment.findFirstOrThrow({
    where: { taskInstanceId: instance, status: 'ACTIVE' },
    select: { id: true },
  });
  await db.taskAssignment.update({
    where: { id: assignment.id },
    // activeSlotKey must go too, exactly as reopen.ts does it — leaving it
    // behind trips the unique constraint on the next draw.
    data: { status: 'RELEASED', closedAt: T0, activeForInstanceId: null, activeSlotKey: null },
  });
  await db.taskInstance.update({
    where: { id: instance },
    data: { status: 'AVAILABLE', activeSlotCount: 0, offerExpiresAt: T0, version: { increment: 1 } },
  });

  await runAssignmentSweep(depsAt(hoursAfter(1)), { householdId: ids.householdId });
  expect(await randomAssignmentCount(instance)).toBe(2);
});

const growthNotifications = (instanceId: string) =>
  db.notification.findMany({
    where: { taskInstanceId: instanceId, type: 'TASK_VALUE_INCREASED' },
    select: { memberId: true, payload: true },
    orderBy: { createdAt: 'asc' },
  });

test('§24 — the household is told when the value climbs a band, not on every step', async () => {
  const version = await installConfig(); // notifyAfterPoints: 5
  const instance = await createRipe(version, { currentValue: 4, ripe: false });

  // Four hours: 4 → 8. Below the first band (base 4 + 5 = 9): silence.
  await runAssignmentSweep(depsAt(hoursAfter(4)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(8);
  expect(await growthNotifications(instance)).toHaveLength(0);

  // The fifth hour crosses 9 and speaks — once per active member, not once
  // per elapsed hour.
  await runAssignmentSweep(depsAt(hoursAfter(5)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(9);
  const first = await growthNotifications(instance);
  expect(first).toHaveLength(3); // elke, arthur, luise
  expect(first[0]?.payload).toMatchObject({ from: 4, to: 9 });

  // Hours six through nine climb 10 → 13 without another word.
  for (const h of [6, 7, 8, 9]) {
    await runAssignmentSweep(depsAt(hoursAfter(h)), { householdId: ids.householdId });
  }
  expect(await valueOf(instance)).toBe(13);
  expect(await growthNotifications(instance)).toHaveLength(3);

  // The tenth crosses the second band at 14.
  await runAssignmentSweep(depsAt(hoursAfter(10)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(14);
  const second = await growthNotifications(instance);
  expect(second).toHaveLength(6);
  expect(second[5]?.payload).toMatchObject({ from: 9, to: 14 });
});

test('§24 — a sweep outage that crosses several bands still sends exactly one message', async () => {
  const version = await installConfig();
  const instance = await createRipe(version, { currentValue: 4, ripe: false });

  // Nothing ran for a day: 4 → 28, crossing 9, 14, 19 and 24.
  await runAssignmentSweep(depsAt(hoursAfter(24)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(28);

  const sent = await growthNotifications(instance);
  expect(sent).toHaveLength(3);
  // The highest band crossed is what gets reported, not every intermediate one.
  expect(sent[0]?.payload).toMatchObject({ from: 19, to: 28 });
});

test('§24 — notifyAfterPoints: 0 keeps the value climbing in silence', async () => {
  const version = await installConfig((config) => {
    config.valueGrowth.notifyAfterPoints = 0;
  });
  const instance = await createRipe(version, { currentValue: 4, ripe: false });

  await runAssignmentSweep(depsAt(hoursAfter(30)), { householdId: ids.householdId });
  expect(await valueOf(instance)).toBe(34);
  expect(await growthNotifications(instance)).toHaveLength(0);
});
