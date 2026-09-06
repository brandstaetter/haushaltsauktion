/**
 * Expired active assignments are penalized and re-offered instead of silently
 * terminating the task. Exercises the real sweep, ledger writer and notifier
 * against Postgres; only clock/RNG are deterministic seams.
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { cloneDefaultConfig, type AssignmentKind, type HouseholdConfig } from '@haushaltsauktion/shared';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import { dbNotifier, type Deps } from '../../src/app/deps.js';
import { postTransaction } from '../../src/app/points/postTransaction.js';
import { volunteerForTask } from '../../src/app/tasks/volunteerForTask.js';
import { withTransaction } from '../../src/app/tx.js';
import { createHousehold, dropHousehold, idsFor, testDb, testDeps } from './_fixture.js';

const ids = idsFor('test-expiry-penalty-');
const DEADLINE = new Date('2026-09-06T12:00:00.000Z');
const BEFORE_DEADLINE = new Date('2026-09-06T11:00:00.000Z');
const AFTER_DEADLINE = new Date('2026-09-06T12:01:00.000Z');

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

async function createAssigned(
  kind: AssignmentKind,
  configVersion: number,
  options: { currentValue?: number; baseValue?: number; memberKey?: string } = {},
): Promise<{ instanceId: string; assignmentId: string }> {
  const currentValue = options.currentValue ?? 6;
  const memberKey = options.memberKey ?? 'arthur';
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore'),
      status: 'ASSIGNED',
      currentValue,
      baseValue: options.baseValue ?? currentValue,
      scheduledFor: new Date(DEADLINE.getTime() - 3_600_000),
      dueAt: DEADLINE,
      publishedAt: new Date(DEADLINE.getTime() - 7_200_000),
      offerExpiresAt: new Date(DEADLINE.getTime() - 3_600_000),
      configVersion,
      activeSlotCount: 1,
    },
    select: { id: true },
  });
  const assignment = await db.taskAssignment.create({
    data: {
      householdId: ids.householdId,
      taskInstanceId: instance.id,
      memberId: ids.memberId(memberKey),
      kind,
      status: 'ACTIVE',
      response: kind === 'VOLUNTARY' ? 'ACCEPTED' : 'PENDING',
      activeForInstanceId: instance.id,
      activeSlotKey: `${instance.id}:0`,
      valueAtAssignment: currentValue,
      configVersion,
      assignedAt: BEFORE_DEADLINE,
      respondedAt: kind === 'VOLUNTARY' ? BEFORE_DEADLINE : null,
    },
    select: { id: true },
  });
  return { instanceId: instance.id, assignmentId: assignment.id };
}

async function createAvailable(configVersion: number): Promise<string> {
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore'),
      status: 'AVAILABLE',
      currentValue: 6,
      baseValue: 6,
      scheduledFor: BEFORE_DEADLINE,
      dueAt: DEADLINE,
      publishedAt: BEFORE_DEADLINE,
      offerExpiresAt: new Date(DEADLINE.getTime() - 10 * 60_000),
      configVersion,
    },
    select: { id: true },
  });
  return instance.id;
}

async function seedPoints(memberKey: string, amount: number): Promise<void> {
  await withTransaction(depsAt(BEFORE_DEADLINE), (tx) =>
    postTransaction(tx, {
      householdId: ids.householdId,
      memberId: ids.memberId(memberKey),
      amount,
      type: 'MANUAL_ADJUSTMENT',
      initiatorMemberId: ids.memberId('elke'),
      initiatorType: 'ADMIN',
      description: 'Startguthaben für Ablauf-Test',
    }),
  );
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
      { key: 'luise', displayName: 'Luise', role: 'MEMBER' },
      { key: 'inactive', displayName: 'Inaktiv', role: 'MEMBER' },
    ],
    definitions: [{ key: 'chore', title: 'Bad putzen', baseValue: 6 }],
  });
  await db.householdMember.update({
    where: { id: ids.memberId('inactive') },
    data: { isActive: false },
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
  await db.householdMember.updateMany({
    where: { householdId: ids.householdId },
    data: { pointsCache: 0 },
  });
  await db.taskDefinition.update({
    where: { id: ids.definitionId('chore') },
    data: { carriedValue: null, nextDueAt: null },
  });
});

test.each(['RANDOM', 'VOLUNTARY'] as const)(
  '%s expiry debits currentValue + increment, preserves value, re-offers, and notifies every active member',
  async (kind) => {
    const version = await installConfig((config) => {
      config.expiry.penaltyIncrement = 2;
      config.buyout.allowNegativeBalance = true;
      config.buyout.maximumDebt = 30;
    });
    const { instanceId, assignmentId } = await createAssigned(kind, version, {
      currentValue: 9,
      baseValue: 4,
    });

    const report = await runAssignmentSweep(depsAt(AFTER_DEADLINE), {
      householdId: ids.householdId,
    });
    expect(report.expired).toBe(1);

    const instance = await db.taskInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(instance.status).toBe('AVAILABLE');
    expect(instance.currentValue).toBe(9);
    expect(instance.closedAt).toBeNull();
    expect(instance.offerExpiresAt?.toISOString()).toBe('2026-09-06T13:01:00.000Z');

    const assignment = await db.taskAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(assignment.status).toBe('EXPIRED');
    const penalty = await db.pointTransaction.findFirstOrThrow({
      where: { taskAssignmentId: assignmentId, type: 'PENALTY' },
    });
    expect(penalty.amount).toBe(-11);
    expect(penalty.assignmentKind).toBe(kind);

    const history = await db.taskHistoryEvent.findMany({
      where: { taskInstanceId: instanceId },
      orderBy: { seq: 'asc' },
    });
    expect(history.map((event) => event.type)).toEqual(['EXPIRY_PENALTY', 'RE_OFFERED']);

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { householdId: ids.householdId, entityId: instanceId, action: 'INSTANCE_EXPIRED' },
    });
    expect(audit.payload).toMatchObject({
      outcome: 'PENALIZED_AND_RE_OFFERED',
      configVersion: version,
      requestedAmount: 11,
      offerExpiresAt: '2026-09-06T13:01:00.000Z',
    });

    const notifications = await db.notification.findMany({
      where: { taskInstanceId: instanceId, type: 'TASK_EXPIRED_PENALTY' },
    });
    expect(notifications.map((item) => item.memberId).sort()).toEqual(
      [ids.memberId('elke'), ids.memberId('arthur'), ids.memberId('luise')].sort(),
    );
    expect(notifications.map((item) => item.memberId)).toContain(ids.memberId('arthur'));
    expect(notifications[0]?.payload).toMatchObject({ by: 'Arthur', value: 11 });
  },
);

test('a multi-worker expiry broadcasts one aggregated penalty notification per active household member', async () => {
  const version = await installConfig((config) => {
    config.buyout.allowNegativeBalance = true;
    config.buyout.maximumDebt = 30;
  });
  const { instanceId } = await createAssigned('RANDOM', version);
  await db.taskInstance.update({
    where: { id: instanceId },
    data: { workerCountMode: 'EXACTLY', workerCount: 2, activeSlotCount: 2 },
  });
  await db.taskAssignment.create({
    data: {
      householdId: ids.householdId,
      taskInstanceId: instanceId,
      memberId: ids.memberId('luise'),
      kind: 'RANDOM',
      status: 'ACTIVE',
      response: 'PENDING',
      slotIndex: 1,
      activeSlotKey: `${instanceId}:1`,
      valueAtAssignment: 6,
      configVersion: version,
      assignedAt: BEFORE_DEADLINE,
    },
  });

  await runAssignmentSweep(depsAt(AFTER_DEADLINE), { householdId: ids.householdId });

  const notifications = await db.notification.findMany({
    where: { taskInstanceId: instanceId, type: 'TASK_EXPIRED_PENALTY' },
    orderBy: { memberId: 'asc' },
  });
  expect(notifications).toHaveLength(3);
  expect(notifications.map((item) => item.memberId).sort()).toEqual(
    [ids.memberId('elke'), ids.memberId('arthur'), ids.memberId('luise')].sort(),
  );
  expect(notifications.map((item) => item.payload)).toEqual([
    { taskInstanceId: instanceId, by: 'Arthur, Luise', value: 14 },
    { taskInstanceId: instanceId, by: 'Arthur, Luise', value: 14 },
    { taskInstanceId: instanceId, by: 'Arthur, Luise', value: 14 },
  ]);
});

test.each([
  ['ON_ACCEPT', 6, -1, 2],
  ['ON_COMPLETE', 0, -7, 1],
] as const)(
  'VOLUNTARY + %s has the intended reward/penalty net balance',
  async (rewardTiming, expectedAward, expectedBalance, expectedTransactionCount) => {
    const version = await installConfig((config) => {
      config.voluntary.rewardTiming = rewardTiming;
      config.buyout.allowNegativeBalance = true;
      config.buyout.maximumDebt = 30;
    });
    const instanceId = await createAvailable(version);
    const pickup = await volunteerForTask(depsAt(BEFORE_DEADLINE), {
      householdId: ids.householdId,
      timezone: 'Europe/Berlin',
      memberId: ids.memberId('arthur'),
      instanceId,
    });
    expect(pickup.pointsAwarded).toBe(expectedAward);

    await runAssignmentSweep(depsAt(AFTER_DEADLINE), { householdId: ids.householdId });
    const member = await db.householdMember.findUniqueOrThrow({
      where: { id: ids.memberId('arthur') },
    });
    expect(member.pointsCache).toBe(expectedBalance);
    const transactions = await db.pointTransaction.findMany({
      where: { householdId: ids.householdId, memberId: ids.memberId('arthur') },
      orderBy: { seq: 'asc' },
    });
    expect(transactions).toHaveLength(expectedTransactionCount);
    expect(transactions.at(-1)?.amount).toBe(-7);
    expect(transactions.at(-1)?.type).toBe('PENALTY');
  },
);

test.each([
  ['minimumBalance', false, null, 3, 5, 2, 3],
  ['maximumDebt', true, 4, 0, 0, 4, -4],
  ['already at floor', false, null, 0, 0, 0, 0],
] as const)(
  'caps the penalty at %s',
  async (_label, allowNegative, maximumDebt, minimumBalance, startingBalance, applied, finalBalance) => {
    const version = await installConfig((config) => {
      config.buyout.allowNegativeBalance = allowNegative;
      config.buyout.maximumDebt = maximumDebt;
      config.buyout.minimumBalance = minimumBalance;
    });
    if (startingBalance > 0) await seedPoints('arthur', startingBalance);
    const { instanceId, assignmentId } = await createAssigned('RANDOM', version);

    await runAssignmentSweep(depsAt(AFTER_DEADLINE), { householdId: ids.householdId });
    const member = await db.householdMember.findUniqueOrThrow({
      where: { id: ids.memberId('arthur') },
    });
    expect(member.pointsCache).toBe(finalBalance);
    const penalty = await db.pointTransaction.findFirst({
      where: { taskAssignmentId: assignmentId, type: 'PENALTY' },
    });
    expect(penalty?.amount ?? 0).toBe(applied === 0 ? 0 : -applied);
    const marker = await db.taskHistoryEvent.findFirstOrThrow({
      where: { taskInstanceId: instanceId, type: 'EXPIRY_PENALTY' },
    });
    expect((marker.payload as { amount: number; requestedAmount: number }).amount).toBe(applied);
    expect((marker.payload as { requestedAmount: number }).requestedAmount).toBe(7);
  },
);

test.each(['RANDOM', 'VOLUNTARY'] as const)(
  'expiry.enabled=false preserves terminal EXPIRED + value reset for %s',
  async (kind) => {
    const version = await installConfig((config) => {
      config.expiry.enabled = false;
    });
    await db.taskDefinition.update({
      where: { id: ids.definitionId('chore') },
      data: { carriedValue: 9 },
    });
    const { instanceId } = await createAssigned(kind, version, { currentValue: 9, baseValue: 4 });

    await runAssignmentSweep(depsAt(AFTER_DEADLINE), { householdId: ids.householdId });
    const instance = await db.taskInstance.findUniqueOrThrow({ where: { id: instanceId } });
    expect(instance.status).toBe('EXPIRED');
    expect(instance.currentValue).toBe(4);
    expect(instance.closedAt?.toISOString()).toBe(AFTER_DEADLINE.toISOString());
    expect(await db.pointTransaction.count({ where: { taskInstanceId: instanceId } })).toBe(0);
    expect(await db.notification.count({ where: { taskInstanceId: instanceId } })).toBe(0);
    expect(
      await db.taskHistoryEvent.findMany({ where: { taskInstanceId: instanceId }, orderBy: { seq: 'asc' } }),
    ).toMatchObject([{ type: 'EXPIRED' }, { type: 'VALUE_RESET' }]);
    expect(
      (await db.taskDefinition.findUniqueOrThrow({ where: { id: ids.definitionId('chore') } }))
        .carriedValue,
    ).toBeNull();
  },
);

test('the history marker survives repeated sweeps and lets the re-offer reach a cooldown-aware random draw', async () => {
  const version = await installConfig((config) => {
    config.assignment.strategy = 'PURE_RANDOM';
    config.assignment.preventImmediateReassignment = true;
    config.assignment.reassignmentCooldownCycles = 1;
    config.buyout.allowNegativeBalance = true;
    config.buyout.maximumDebt = 30;
  });
  const { instanceId } = await createAssigned('RANDOM', version);

  await runAssignmentSweep(depsAt(AFTER_DEADLINE), { householdId: ids.householdId });
  const duringOffer = new Date(AFTER_DEADLINE.getTime() + 30 * 60_000);
  await runAssignmentSweep(depsAt(duringOffer), { householdId: ids.householdId });
  expect((await db.taskInstance.findUniqueOrThrow({ where: { id: instanceId } })).status).toBe(
    'AVAILABLE',
  );
  expect(
    await db.taskHistoryEvent.count({ where: { taskInstanceId: instanceId, type: 'EXPIRY_PENALTY' } }),
  ).toBe(1);

  const afterOffer = new Date(AFTER_DEADLINE.getTime() + 61 * 60_000);
  await runAssignmentSweep(depsAt(afterOffer), { householdId: ids.householdId });
  const active = await db.taskAssignment.findFirstOrThrow({
    where: { taskInstanceId: instanceId, status: 'ACTIVE' },
  });
  expect(active.memberId).not.toBe(ids.memberId('arthur'));
  expect((await db.taskInstance.findUniqueOrThrow({ where: { id: instanceId } })).status).toBe(
    'ASSIGNED',
  );

  await runAssignmentSweep(depsAt(new Date(afterOffer.getTime() + 60_000)), {
    householdId: ids.householdId,
  });
  expect((await db.taskInstance.findUniqueOrThrow({ where: { id: instanceId } })).status).toBe(
    'ASSIGNED',
  );
  expect(
    await db.taskHistoryEvent.count({ where: { taskInstanceId: instanceId, type: 'EXPIRY_PENALTY' } }),
  ).toBe(1);
});
