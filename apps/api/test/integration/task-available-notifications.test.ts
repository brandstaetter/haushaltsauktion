/**
 * `TASK_AVAILABLE` (push-notifications §Architekturvorschlag, Phase 3 —
 * closing a pre-existing gap). Nothing in the codebase ever emitted this
 * `NotificationType` before `runAssignmentSweep.ts`'s T1 (materialize due
 * occurrences) and T2 (publish drafts) sites started doing so, even though
 * both the in-app copy (`apps/web/src/strings/de.ts`) and the push
 * allow-list entry now exist. This file is what proves the emit sites
 * actually fire, fire for the right people, and stay silent for people who
 * are not eligible to volunteer.
 *
 * "Eligible" here means `canVolunteer` (`domain/assignment/eligibility.ts`)
 * — rules 1-5 plus the role/admin-slot additions — never the soft
 * fairness-only rules 6-7 (weekly cap, reassignment cooldown) that gate only
 * the random draw. A member who was just drawn for this same chore last
 * cycle is still shown "verfügbar" if they want to pick it up themselves.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import { dbNotifier, type Deps } from '../../src/app/deps.js';
import { pushNotifier } from '../../src/app/notifications/pushNotifier.js';
import { createHousehold, dropHousehold, idsFor, testDb, testDeps } from './_fixture.js';

const ids = idsFor('test-taskavailable-');

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
    definitions: [
      { key: 'chore', title: 'Bad putzen', baseValue: 6 },
      { key: 'chore2', title: 'Staubsaugen', baseValue: 4 },
    ],
  });
  // Wraps `dbNotifier` the same way `main.ts` does once a household has a
  // VAPID key pair configured — so one sweep call proves both channels at
  // once, exactly like `push-notifier.test.ts` does for the decorator itself.
  sweepDeps = { ...testDeps(db), notifier: pushNotifier(dbNotifier) };
}, 60_000);

afterAll(async () => {
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.pushOutboxItem.deleteMany({ where: { householdId: ids.householdId } });
  await db.notification.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskHistoryEvent.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskAssignment.deleteMany({ where: { householdId: ids.householdId } });
  await db.taskInstance.deleteMany({ where: { householdId: ids.householdId } });
  await db.memberCategoryExclusion.deleteMany({ where: { householdId: ids.householdId } });
  // Both definitions start each test with no auto-materialization pending —
  // each test arms only the one it is about, via its own explicit update.
  await db.taskDefinition.updateMany({
    where: { householdId: ids.householdId },
    data: { nextDueAt: null },
  });
});

test('T1 materializes a due occurrence: TASK_AVAILABLE reaches every eligible member, in-app and via push, but not a category-excluded one', async () => {
  // Luise is excluded from the shared category — she must never see "this
  // chore is available", even though she is otherwise active and unrestricted.
  await db.memberCategoryExclusion.create({
    data: { householdId: ids.householdId, memberId: ids.memberId('luise'), categoryId: ids.categoryId },
  });

  await db.taskDefinition.update({
    where: { id: ids.definitionId('chore') },
    data: { nextDueAt: new Date(Date.now() - 60_000) },
  });

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.materialized).toBeGreaterThanOrEqual(1);

  const instance = await db.taskInstance.findFirstOrThrow({
    where: { householdId: ids.householdId, taskDefinitionId: ids.definitionId('chore'), status: 'AVAILABLE' },
    select: { id: true, currentValue: true },
  });

  const notified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instance.id, type: 'TASK_AVAILABLE' },
    select: { memberId: true, payload: true },
  });
  expect(notified.map((n) => n.memberId).sort()).toEqual(
    [ids.memberId('elke'), ids.memberId('arthur')].sort(),
  );
  for (const n of notified) {
    expect(n.payload).toMatchObject({ taskInstanceId: instance.id, value: instance.currentValue });
  }

  const pushed = await db.pushOutboxItem.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instance.id, type: 'TASK_AVAILABLE' },
    select: { memberId: true },
  });
  expect(pushed.map((p) => p.memberId).sort()).toEqual(
    [ids.memberId('elke'), ids.memberId('arthur')].sort(),
  );
});

test('T2 publishes a due draft: same TASK_AVAILABLE treatment, in-app and via push, excluded member still silent', async () => {
  await db.memberCategoryExclusion.create({
    data: { householdId: ids.householdId, memberId: ids.memberId('luise'), categoryId: ids.categoryId },
  });

  const draft = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore2'),
      status: 'DRAFT',
      currentValue: 4,
      baseValue: 4,
      scheduledFor: new Date(Date.now() - 60_000),
      configVersion: 1,
    },
    select: { id: true },
  });

  const report = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
  expect(report.published).toBeGreaterThanOrEqual(1);

  const published = await db.taskInstance.findUniqueOrThrow({
    where: { id: draft.id },
    select: { status: true },
  });
  expect(published.status).toBe('AVAILABLE');

  const notified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: draft.id, type: 'TASK_AVAILABLE' },
    select: { memberId: true },
  });
  expect(notified.map((n) => n.memberId).sort()).toEqual(
    [ids.memberId('elke'), ids.memberId('arthur')].sort(),
  );

  const pushed = await db.pushOutboxItem.findMany({
    where: { householdId: ids.householdId, taskInstanceId: draft.id, type: 'TASK_AVAILABLE' },
    select: { memberId: true },
  });
  expect(pushed.map((p) => p.memberId).sort()).toEqual(
    [ids.memberId('elke'), ids.memberId('arthur')].sort(),
  );
});

test('T5 regression: ADMIN_NO_CANDIDATES still fires when the random draw finds nobody, unaffected by the TASK_AVAILABLE work', async () => {
  // Every member (including the admin) is excluded from the shared category,
  // so once this already-AVAILABLE instance becomes ripe, T4's draw finds
  // zero eligible candidates and T5 must notify the admin as before.
  await db.memberCategoryExclusion.createMany({
    data: [
      { householdId: ids.householdId, memberId: ids.memberId('elke'), categoryId: ids.categoryId },
      { householdId: ids.householdId, memberId: ids.memberId('arthur'), categoryId: ids.categoryId },
      { householdId: ids.householdId, memberId: ids.memberId('luise'), categoryId: ids.categoryId },
    ],
  });

  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId('chore'),
      status: 'AVAILABLE',
      currentValue: 6,
      baseValue: 6,
      scheduledFor: new Date(Date.now() - 3_600_000),
      publishedAt: new Date(Date.now() - 3_600_000),
      offerExpiresAt: new Date(Date.now() - 1_000),
      configVersion: 1,
    },
    select: { id: true },
  });

  await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });

  const adminNotified = await db.notification.findMany({
    where: { householdId: ids.householdId, taskInstanceId: instance.id, type: 'ADMIN_NO_CANDIDATES' },
    select: { memberId: true },
  });
  expect(adminNotified.map((n) => n.memberId)).toEqual([ids.memberId('elke')]);

  // This instance was already AVAILABLE at the start of the sweep — it never
  // passed through T1/T2 — so no TASK_AVAILABLE draft was ever generated for
  // it. Confirms the new emit sites did not somehow also fire here.
  const availableNotifiedCount = await db.notification.count({
    where: { householdId: ids.householdId, taskInstanceId: instance.id, type: 'TASK_AVAILABLE' },
  });
  expect(availableNotifiedCount).toBe(0);
});
