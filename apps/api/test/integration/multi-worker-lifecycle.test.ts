/**
 * Multi-worker-tasks Phase 2 — end-to-end slot lifecycle
 * (.planning/architecture-multi-worker-tasks.md, Phase 2 end conditions):
 *
 *   - the sweep fills every open slot up to `minRequired` for an
 *     under-staffed ripe instance in one pass, excluding members who already
 *     hold a slot on that instance;
 *   - a per-slot buyout releases only that slot, bumps `currentValue`,
 *     reopens exactly that slot, and leaves co-assignees' active assignments
 *     and the instance's `ASSIGNED` status untouched when still adequately
 *     staffed — and behaves like today's single-slot buyout when the release
 *     drops the instance below `minRequired`;
 *   - a per-slot completion pays full value to a `VOLUNTARY` slot-holder and
 *     zero to a `RANDOM` one, and only the LAST active slot completing
 *     triggers the instance-level `COMPLETED` + value reset + recurrence
 *     advance.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * Every scenario below creates its `TaskDefinition`/`TaskInstance`/
 * `TaskAssignment` rows directly (bypassing `volunteerForTask`/the sweep for
 * the *starting* state), the same way `concurrency.test.ts`'s buyout
 * describe-block and `reject-completion.test.ts`'s second test already do —
 * it is the only way to construct a specific multi-slot starting position
 * without first driving the whole system through it.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { releaseOrRevokeAssignment } from '../../src/app/assignment/reopen.js';
import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import { postTransaction } from '../../src/app/points/postTransaction.js';
import { withTransaction } from '../../src/app/tx.js';

import {
  authHeaders,
  buildTestServer,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  testDeps,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-multiworker-lifecycle-');

let db: PrismaClient;
let app: FastifyInstance;
let anna: Session; // ADMIN
let paul: Session;
let maria: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'anna', displayName: 'Anna', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  anna = await login(app, ids, 'anna');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'Sweep füllt jeden offenen Slot bis minRequired in einem Durchlauf, schließt bereits Besetzte aus',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('sweep-fill');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Gartenarbeit',
        categoryId: ids.categoryId,
        baseValue: 5,
        estimatedMinutes: 15,
        recurrenceType: 'MANUAL',
        workerCountMode: 'AT_LEAST',
        workerCount: 3,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 5,
        baseValue: 5,
        scheduledFor: now,
        publishedAt: now,
        // Ripe: the offer window already closed.
        offerExpiresAt: new Date(now.getTime() - 1000),
        configVersion: 1,
        workerCountMode: 'AT_LEAST',
        workerCount: 3,
        activeSlotCount: 1,
      },
      select: { id: true },
    });
    // Anna already volunteered for one of the three required slots.
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: anna.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: instance.id,
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 5,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
    });

    // Only paul and maria remain as candidates for the other two slots —
    // deterministic: the sweep MUST pick exactly both of them, and must NOT
    // pick anna again.
    const report = await runAssignmentSweep(testDeps(db), { householdId: ids.householdId });
    expect(report.assigned).toBeGreaterThanOrEqual(1);
    expect(report.skipped).toBe(0);

    const active = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true, kind: true, slotIndex: true, activeSlotKey: true },
    });
    expect(active).toHaveLength(3);
    expect(active.map((a) => a.slotIndex).sort()).toEqual([0, 1, 2]);
    expect(new Set(active.map((a) => a.activeSlotKey)).size).toBe(3);
    // Anna holds exactly her original slot — never redrawn.
    expect(active.filter((a) => a.memberId === anna.memberId)).toHaveLength(1);
    expect(active.find((a) => a.memberId === anna.memberId)?.kind).toBe('VOLUNTARY');
    // Both remaining household members were drawn, each exactly once.
    const randomHolders = active.filter((a) => a.kind === 'RANDOM').map((a) => a.memberId);
    expect(new Set(randomHolders)).toEqual(new Set([paul.memberId, maria.memberId]));

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(updatedInstance.status).toBe('ASSIGNED');
    expect(updatedInstance.activeSlotCount).toBe(3);

    const history = await db.taskHistoryEvent.findMany({
      where: { taskInstanceId: instance.id },
      select: { type: true },
    });
    expect(history.filter((h) => h.type === 'RANDOMLY_ASSIGNED')).toHaveLength(2);
  },
  60_000,
);

test(
  'Freikauf eines Slots bei weiterhin ausreichender Besetzung lässt Mitbesetzte und ASSIGNED unangetastet, der frei gewordene Slot bleibt besetzbar',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('buyout-staffed');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Keller aufräumen',
        categoryId: ids.categoryId,
        baseValue: 6,
        estimatedMinutes: 30,
        recurrenceType: 'MANUAL',
        buyoutEnabled: true,
        workerCountMode: 'AT_MOST',
        workerCount: 3,
      },
    });
    // AT_MOST(3): min = 1, max = 3. Losing one of three still leaves 2 ≥ 1.
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
        workerCountMode: 'AT_MOST',
        workerCount: 3,
        activeSlotCount: 3,
      },
      select: { id: true },
    });
    const randomAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: paul.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: instance.id,
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 6,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: anna.memberId,
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
    });
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: maria.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: null,
        slotIndex: 2,
        activeSlotKey: `${instance.id}:2`,
        valueAtAssignment: 6,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
    });

    await withTransaction(testDeps(db), (tx) =>
      postTransaction(tx, {
        householdId: ids.householdId,
        memberId: paul.memberId,
        amount: 20,
        type: 'MANUAL_ADJUSTMENT',
        initiatorMemberId: anna.memberId,
        initiatorType: 'ADMIN',
        description: 'Integrationstest-Startguthaben',
      }),
    );

    const quoteResp = await app.inject({
      method: 'GET',
      url: `/api/assignments/${randomAssignment.id}/buyout-quote`,
      headers: { cookie: paul.cookie },
    });
    expect(quoteResp.statusCode).toBe(200);
    const quote = quoteResp.json() as { cost: number; taskValueAfter: number };
    // §39 defaults: cost = currentValue, new value = ceil(6 × 1.5).
    expect(quote.cost).toBe(6);
    expect(quote.taskValueAfter).toBe(9);

    const buyoutResp = await app.inject({
      method: 'POST',
      url: `/api/assignments/${randomAssignment.id}/buyout`,
      headers: authHeaders(paul),
      payload: { acceptedCost: quote.cost, acceptedNewValue: quote.taskValueAfter },
    });
    expect(buyoutResp.statusCode, JSON.stringify(buyoutResp.json())).toBe(200);

    const closedAssignment = await db.taskAssignment.findUniqueOrThrow({
      where: { id: randomAssignment.id },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(closedAssignment.status).toBe('BOUGHT_OUT');
    expect(closedAssignment.activeForInstanceId).toBeNull();
    expect(closedAssignment.activeSlotKey).toBeNull();

    // Co-assignees untouched.
    const coAssignees = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true, slotIndex: true },
    });
    expect(coAssignees).toHaveLength(2);
    expect(new Set(coAssignees.map((a) => a.memberId))).toEqual(
      new Set([anna.memberId, maria.memberId]),
    );

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, currentValue: true, activeSlotCount: true, buyoutCount: true },
    });
    // Still adequately staffed (2 ≥ min 1 for AT_MOST(3)) — stays ASSIGNED,
    // not reopened as a whole.
    expect(updatedInstance.status).toBe('ASSIGNED');
    expect(updatedInstance.currentValue).toBe(9);
    expect(updatedInstance.activeSlotCount).toBe(2);
    expect(updatedInstance.buyoutCount).toBe(1);

    const historyTypes = (
      await db.taskHistoryEvent.findMany({
        where: { taskInstanceId: instance.id },
        select: { type: true },
      })
    ).map((h) => h.type);
    expect(historyTypes).toContain('BOUGHT_OUT');
    expect(historyTypes).toContain('VALUE_INCREASED');
    // Nothing was "re-offered" — the instance never left ASSIGNED.
    expect(historyTypes).not.toContain('RE_OFFERED');

    // The freed slot is fillable again — independent of `status` staying
    // ASSIGNED (architecture: "activeSlotCount < max, checked independently
    // of status"). Paul, who just closed his own RANDOM assignment, is free
    // to rejoin voluntarily.
    const rejoin = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(rejoin.statusCode, JSON.stringify(rejoin.json())).toBe(200);

    const afterRejoin = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true, slotIndex: true, kind: true },
    });
    expect(afterRejoin).toHaveLength(3);
    const paulRow = afterRejoin.find((a) => a.memberId === paul.memberId);
    expect(paulRow?.kind).toBe('VOLUNTARY');
    expect(paulRow?.slotIndex).toBe(0);

    const finalInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(finalInstance.status).toBe('ASSIGNED');
    expect(finalInstance.activeSlotCount).toBe(3);
  },
  60_000,
);

test(
  'Freikauf, der activeSlotCount unter minRequired drückt, gibt die Aufgabe wie im Einzel-Slot-Fall wieder frei',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('buyout-drops');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Fenster putzen',
        categoryId: ids.categoryId,
        baseValue: 4,
        estimatedMinutes: 20,
        recurrenceType: 'MANUAL',
        buyoutEnabled: true,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'ASSIGNED',
        currentValue: 4,
        baseValue: 4,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
        activeSlotCount: 2,
      },
      select: { id: true },
    });
    const randomAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: maria.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: instance.id,
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 4,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: anna.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: null,
        slotIndex: 1,
        activeSlotKey: `${instance.id}:1`,
        valueAtAssignment: 4,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
    });

    await withTransaction(testDeps(db), (tx) =>
      postTransaction(tx, {
        householdId: ids.householdId,
        memberId: maria.memberId,
        amount: 10,
        type: 'MANUAL_ADJUSTMENT',
        initiatorMemberId: anna.memberId,
        initiatorType: 'ADMIN',
        description: 'Integrationstest-Startguthaben',
      }),
    );

    const quoteResp = await app.inject({
      method: 'GET',
      url: `/api/assignments/${randomAssignment.id}/buyout-quote`,
      headers: { cookie: maria.cookie },
    });
    const quote = quoteResp.json() as { cost: number; taskValueAfter: number };
    expect(quote.cost).toBe(4);
    expect(quote.taskValueAfter).toBe(6);

    const buyoutResp = await app.inject({
      method: 'POST',
      url: `/api/assignments/${randomAssignment.id}/buyout`,
      headers: authHeaders(maria),
      payload: { acceptedCost: quote.cost, acceptedNewValue: quote.taskValueAfter },
    });
    expect(buyoutResp.statusCode, JSON.stringify(buyoutResp.json())).toBe(200);

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, currentValue: true, activeSlotCount: true, offerExpiresAt: true },
    });
    // min = max = 2 for EXACTLY(2): one release always drops below min —
    // behaves exactly like today's single-slot buyout.
    expect(updatedInstance.status).toBe('AVAILABLE');
    expect(updatedInstance.currentValue).toBe(6);
    expect(updatedInstance.activeSlotCount).toBe(1);
    expect(updatedInstance.offerExpiresAt).not.toBeNull();

    const historyTypes = (
      await db.taskHistoryEvent.findMany({
        where: { taskInstanceId: instance.id },
        select: { type: true },
      })
    ).map((h) => h.type);
    expect(historyTypes).toContain('RE_OFFERED');
  },
  60_000,
);

test(
  'Erledigung pro Slot: VOLUNTARY zahlt voll, RANDOM zahlt 0 — erst der letzte Slot schließt die Instanz ab',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('complete-multi');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Wäsche waschen',
        categoryId: ids.categoryId,
        baseValue: 5,
        estimatedMinutes: 15,
        recurrenceType: 'DAILY',
        workerCountMode: 'EXACTLY',
        workerCount: 2,
      },
    });
    // currentValue (8) deliberately above baseValue (5) — as if a prior
    // buyout cycle had already escalated it — so the eventual reset is
    // observable and distinct from "value never changed".
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'ASSIGNED',
        currentValue: 8,
        baseValue: 5,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
        activeSlotCount: 2,
      },
      select: { id: true },
    });
    const voluntaryAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: anna.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: instance.id,
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 8,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
      select: { id: true },
    });
    const randomAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: paul.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: null,
        slotIndex: 1,
        activeSlotKey: `${instance.id}:1`,
        valueAtAssignment: 8,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });

    // ── first (non-last) slot completes: VOLUNTARY, pays full current value ──
    const firstDone = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/complete`,
      headers: authHeaders(anna),
      payload: { assignmentId: voluntaryAssignment.id },
    });
    expect(firstDone.statusCode, JSON.stringify(firstDone.json())).toBe(200);
    const firstBody = firstDone.json() as { pointsAwarded: number };
    expect(firstBody.pointsAwarded).toBe(8);

    const afterFirst = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, currentValue: true, completedAt: true },
    });
    // Instance-level effects gated on the LAST slot — not this one.
    expect(afterFirst.status).toBe('ASSIGNED');
    expect(afterFirst.activeSlotCount).toBe(1);
    expect(afterFirst.currentValue).toBe(8);
    expect(afterFirst.completedAt).toBeNull();

    const defAfterFirst = await db.taskDefinition.findUniqueOrThrow({
      where: { id: defId },
      select: { lastCompletedAt: true, nextDueAt: true },
    });
    expect(defAfterFirst.lastCompletedAt).toBeNull();

    // ── second (last) slot completes: RANDOM, pays 0, closes the instance ──
    const secondDone = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/complete`,
      headers: authHeaders(paul),
      payload: { assignmentId: randomAssignment.id },
    });
    expect(secondDone.statusCode, JSON.stringify(secondDone.json())).toBe(200);
    const secondBody = secondDone.json() as { pointsAwarded: number };
    expect(secondBody.pointsAwarded).toBe(0);

    const afterSecond = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, currentValue: true, completedAt: true },
    });
    expect(afterSecond.status).toBe('COMPLETED');
    expect(afterSecond.activeSlotCount).toBe(0);
    // Reset to baseValue only now, on the last slot.
    expect(afterSecond.currentValue).toBe(5);
    expect(afterSecond.completedAt).not.toBeNull();

    const defAfterSecond = await db.taskDefinition.findUniqueOrThrow({
      where: { id: defId },
      select: { lastCompletedAt: true, nextDueAt: true },
    });
    expect(defAfterSecond.lastCompletedAt).not.toBeNull();
    expect(defAfterSecond.nextDueAt).not.toBeNull();

    const history = await db.taskHistoryEvent.findMany({
      where: { taskInstanceId: instance.id },
      select: { type: true, payload: true },
    });
    const completedEvents = history.filter((h) => h.type === 'COMPLETED');
    expect(completedEvents).toHaveLength(2);
    for (const event of completedEvents) {
      expect((event.payload as Record<string, unknown>)['slotsRemainingAfter']).toBeTypeOf(
        'number',
      );
    }
    // Value reset fires exactly once — on the last slot only.
    expect(history.filter((h) => h.type === 'VALUE_RESET')).toHaveLength(1);

    const closedAssignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(closedAssignments.every((a) => a.status === 'COMPLETED')).toBe(true);
    expect(closedAssignments.every((a) => a.activeForInstanceId === null)).toBe(true);
    expect(closedAssignments.every((a) => a.activeSlotKey === null)).toBe(true);
  },
  60_000,
);

test(
  'Freigabe eines Slots bei weiterhin ausreichender Besetzung lässt Mitbesetzte und ASSIGNED unangetastet (releaseOrRevokeAssignment-Bugfix)',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('release-staffed');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Garten mähen',
        categoryId: ids.categoryId,
        baseValue: 6,
        estimatedMinutes: 30,
        recurrenceType: 'MANUAL',
        workerCountMode: 'AT_MOST',
        workerCount: 3,
      },
    });
    // AT_MOST(3): min = 1, max = 3. Releasing one of three still leaves 2 ≥ 1.
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
        workerCountMode: 'AT_MOST',
        workerCount: 3,
        activeSlotCount: 3,
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
    const annaAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: anna.memberId,
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
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: maria.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: null,
        slotIndex: 2,
        activeSlotKey: `${instance.id}:2`,
        valueAtAssignment: 6,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
      select: { id: true },
    });

    const result = await releaseOrRevokeAssignment(testDeps(db), {
      householdId: ids.householdId,
      timezone: 'Europe/Vienna',
      actorMemberId: paul.memberId,
      actorIsAdmin: false,
      instanceId: instance.id,
      assignmentId: paulAssignment.id,
      mode: 'RELEASE',
    });
    expect(result.status).toBe('ASSIGNED');
    expect(result.clawedBack).toBe(0);

    const releasedRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: paulAssignment.id },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(releasedRow.status).toBe('RELEASED');
    expect(releasedRow.activeForInstanceId).toBeNull();
    expect(releasedRow.activeSlotKey).toBeNull();

    // Co-assignees untouched — the bug this test guards against had the
    // whole instance flip to AVAILABLE, but their rows stayed ACTIVE while
    // the instance no longer claimed to be ASSIGNED.
    const coAssignees = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true },
    });
    expect(coAssignees).toHaveLength(2);
    expect(new Set(coAssignees.map((a) => a.memberId))).toEqual(
      new Set([anna.memberId, maria.memberId]),
    );

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, offerExpiresAt: true },
    });
    // Still adequately staffed (2 ≥ min 1 for AT_MOST(3)) — stays ASSIGNED,
    // not reopened as a whole. This is the exact scenario the bug broke.
    expect(updatedInstance.status).toBe('ASSIGNED');
    expect(updatedInstance.activeSlotCount).toBe(2);

    const historyTypes = (
      await db.taskHistoryEvent.findMany({
        where: { taskInstanceId: instance.id },
        select: { type: true },
      })
    ).map((h) => h.type);
    expect(historyTypes).toContain('RELEASED');
    // Nothing was "re-offered" — the instance never left ASSIGNED.
    expect(historyTypes).not.toContain('RE_OFFERED');

    // The freed slot is fillable again, independent of `status` staying
    // ASSIGNED — Paul, who just released his own slot, may rejoin.
    const rejoined = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(rejoined.statusCode, JSON.stringify(rejoined.json())).toBe(200);

    // Sanity: Anna's own (untouched) assignment id still matches.
    const annaRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: annaAssignment.id },
      select: { status: true },
    });
    expect(annaRow.status).toBe('ACTIVE');
  },
  60_000,
);

test(
  'Freigabe des einzigen Slots auf einer noch AVAILABLE (unter minRequired) rekrutierenden AT_LEAST-Instanz bleibt AVAILABLE (releaseOrRevokeAssignment-Korrektur, Phase 5 Live-Check)',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('release-still-recruiting');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Gartenpflege',
        categoryId: ids.categoryId,
        baseValue: 5,
        estimatedMinutes: 20,
        recurrenceType: 'MANUAL',
        workerCountMode: 'AT_LEAST',
        workerCount: 2,
      },
    });
    // AT_LEAST(2): a single volunteer never reaches minRequired, so the
    // instance stays AVAILABLE (volunteerForTask.ts) — this is the exact
    // state the pre-fix `releaseOrRevokeAssignment` could not handle: its
    // top-level guard required `status === 'ASSIGNED'`, so this volunteer
    // could never back out of their own free slot while still recruiting.
    const originalOfferExpiresAt = new Date(now.getTime() + 3600_000);
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 5,
        baseValue: 5,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: originalOfferExpiresAt,
        configVersion: 1,
        workerCountMode: 'AT_LEAST',
        workerCount: 2,
        activeSlotCount: 1,
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
        valueAtAssignment: 5,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
      select: { id: true },
    });

    const result = await releaseOrRevokeAssignment(testDeps(db), {
      householdId: ids.householdId,
      timezone: 'Europe/Vienna',
      actorMemberId: paul.memberId,
      actorIsAdmin: false,
      instanceId: instance.id,
      assignmentId: paulAssignment.id,
      mode: 'RELEASE',
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.clawedBack).toBe(0);

    const releasedRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: paulAssignment.id },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(releasedRow.status).toBe('RELEASED');
    expect(releasedRow.activeForInstanceId).toBeNull();
    expect(releasedRow.activeSlotKey).toBeNull();

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, offerExpiresAt: true },
    });
    // Stays AVAILABLE — there never was an ASSIGNED state to leave, so no
    // state-machine transition fires and the original offer window survives
    // untouched (nothing was "re-offered": the offer never stopped).
    expect(updatedInstance.status).toBe('AVAILABLE');
    expect(updatedInstance.activeSlotCount).toBe(0);
    expect(updatedInstance.offerExpiresAt?.getTime()).toBe(originalOfferExpiresAt.getTime());

    const historyTypes = (
      await db.taskHistoryEvent.findMany({
        where: { taskInstanceId: instance.id },
        select: { type: true },
      })
    ).map((h) => h.type);
    expect(historyTypes).toContain('RELEASED');
    expect(historyTypes).not.toContain('RE_OFFERED');

    // The now-empty slot is still volunteerable — Paul may rejoin freely.
    const rejoined = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(rejoined.statusCode, JSON.stringify(rejoined.json())).toBe(200);
  },
  60_000,
);

test(
  'EXACTLY(1)-Parität: Rücknahme (revoke) einer einzigen aktiven Zuweisung gibt die Aufgabe wie bisher komplett frei',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('revoke-single');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Müll hinausbringen',
        categoryId: ids.categoryId,
        baseValue: 2,
        estimatedMinutes: 5,
        recurrenceType: 'MANUAL',
        workerCountMode: 'EXACTLY',
        workerCount: 1,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'ASSIGNED',
        currentValue: 2,
        baseValue: 2,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 1,
        activeSlotCount: 1,
      },
      select: { id: true },
    });
    const soleAssignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: maria.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: instance.id,
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 2,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });

    const result = await releaseOrRevokeAssignment(testDeps(db), {
      householdId: ids.householdId,
      timezone: 'Europe/Vienna',
      actorMemberId: anna.memberId,
      actorIsAdmin: true,
      instanceId: instance.id,
      assignmentId: soleAssignment.id,
      mode: 'REVOKE',
    });
    // EXACTLY(1): min = max = 1, so remainingAfterRelease (0) is always
    // below min — behaves exactly like today's single-slot revoke.
    expect(result.status).toBe('AVAILABLE');

    const updatedInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, offerExpiresAt: true },
    });
    expect(updatedInstance.status).toBe('AVAILABLE');
    expect(updatedInstance.activeSlotCount).toBe(0);
    expect(updatedInstance.offerExpiresAt).not.toBeNull();

    const historyTypes = (
      await db.taskHistoryEvent.findMany({
        where: { taskInstanceId: instance.id },
        select: { type: true },
      })
    ).map((h) => h.type);
    expect(historyTypes).toContain('REVOKED');
    expect(historyTypes).toContain('RE_OFFERED');
  },
  60_000,
);
