/**
 * Admin-initiated instance cancellation (intake
 * "admin-cancel-or-sync-open-instances-on-definition-change").
 *
 * Extends the pre-existing `POST /admin/instances/:id/cancel` (previously
 * only legal for `DRAFT`/`AVAILABLE`/`PAUSED`) to also close an `ASSIGNED`
 * instance's active assignment(s) — with the same `ON_ACCEPT` clawback rule
 * `revoke-assignment` uses — and always ends the instance `CANCELLED`
 * (terminal), never reopened for a new offer cycle.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { verifyLedgerIntegrity } from '../../src/app/points/verifyLedgerIntegrity.js';
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

const ids = idsFor('test-cancel-instance-');

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
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
}, 60_000);

afterAll(async () => {
  const integrity = await verifyLedgerIntegrity(db, { householdId: ids.householdId });
  expect(integrity.ok).toBe(true);

  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'cancelling a plain AVAILABLE instance (no assignments) still works exactly as before',
  async () => {
    const instanceId = await createAvailableInstance(db, ids, 'bad', 6);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/cancel`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json() as { status: string; revokedAssignments: number };
    expect(body.status).toBe('CANCELLED');
    expect(body.revokedAssignments).toBe(0);

    const row = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: { status: true, closedAt: true },
    });
    expect(row.status).toBe('CANCELLED');
    expect(row.closedAt).not.toBeNull();
  },
  30_000,
);

test(
  'cancelling an ASSIGNED instance revokes the active assignment and ends the instance CANCELLED, not reopened',
  async () => {
    const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
    const volunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(volunteer.statusCode, JSON.stringify(volunteer.json())).toBe(200);
    const assignmentId = (volunteer.json() as { assignment: { id: string } }).assignment.id;

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/cancel`,
      headers: authHeaders(elke),
      payload: { reason: 'Aufgabendefinition wurde geändert' },
    });
    expect(cancelRes.statusCode, JSON.stringify(cancelRes.json())).toBe(200);
    const body = cancelRes.json() as { status: string; revokedAssignments: number };
    expect(body.status).toBe('CANCELLED');
    expect(body.revokedAssignments).toBe(1);

    const instanceRow = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: { status: true, currentValue: true, baseValue: true },
    });
    expect(instanceRow.status).toBe('CANCELLED');
    expect(instanceRow.currentValue).toBe(instanceRow.baseValue);

    const assignmentRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { status: true },
    });
    expect(assignmentRow.status).toBe('REVOKED');
  },
  30_000,
);

test(
  'cancelling reverses an ON_ACCEPT reward already paid, exactly like a single revoke-assignment does',
  async () => {
    const current = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    const currentBody = current.json() as { version: number; values: Record<string, unknown> };
    const setTiming = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: authHeaders(elke),
      payload: {
        expectedVersion: currentBody.version,
        values: {
          ...currentBody.values,
          voluntary: { ...(currentBody.values['voluntary'] as object), rewardTiming: 'ON_ACCEPT' },
        },
      },
    });
    expect(setTiming.statusCode).toBe(200);

    try {
      const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
      const before = await app.inject({
        method: 'GET',
        url: '/api/members/me/points',
        headers: { cookie: maria.cookie },
      });
      const balanceBefore = (before.json() as { balance: number }).balance;

      const volunteer = await app.inject({
        method: 'POST',
        url: `/api/tasks/${instanceId}/volunteer`,
        headers: authHeaders(maria),
        payload: {},
      });
      expect(volunteer.statusCode, JSON.stringify(volunteer.json())).toBe(200);
      const paid = (volunteer.json() as { pointsAwarded: number }).pointsAwarded;
      expect(paid).toBe(6);

      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/admin/instances/${instanceId}/cancel`,
        headers: authHeaders(elke),
        payload: {},
      });
      expect(cancelRes.statusCode, JSON.stringify(cancelRes.json())).toBe(200);
      expect((cancelRes.json() as { clawedBack: number }).clawedBack).toBe(6);

      const after = await app.inject({
        method: 'GET',
        url: '/api/members/me/points',
        headers: { cookie: maria.cookie },
      });
      expect((after.json() as { balance: number }).balance).toBe(balanceBefore);
    } finally {
      const latest = await app.inject({
        method: 'GET',
        url: '/api/admin/config',
        headers: authHeaders(elke),
      });
      const latestBody = latest.json() as { version: number; values: Record<string, unknown> };
      await app.inject({
        method: 'PUT',
        url: '/api/admin/config',
        headers: authHeaders(elke),
        payload: {
          expectedVersion: latestBody.version,
          values: {
            ...latestBody.values,
            voluntary: { ...(latestBody.values['voluntary'] as object), rewardTiming: 'ON_COMPLETE' },
          },
        },
      });
    }
  },
  30_000,
);

test(
  'cancelling a multi-worker ASSIGNED instance closes every active slot',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('multi-cancel');
    await db.taskDefinition.create({
      data: {
        id: defId,
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
    for (const [session, slotIndex] of [
      [paul, 0],
      [maria, 1],
    ] as const) {
      await db.taskAssignment.create({
        data: {
          householdId: ids.householdId,
          taskInstanceId: instance.id,
          memberId: session.memberId,
          kind: 'VOLUNTARY',
          status: 'ACTIVE',
          response: 'ACCEPTED',
          activeForInstanceId: slotIndex === 0 ? instance.id : null,
          slotIndex,
          activeSlotKey: `${instance.id}:${slotIndex}`,
          valueAtAssignment: 6,
          configVersion: 1,
          assignedAt: now,
          respondedAt: now,
        },
      });
    }

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instance.id}/cancel`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(cancelRes.statusCode, JSON.stringify(cancelRes.json())).toBe(200);
    expect((cancelRes.json() as { revokedAssignments: number }).revokedAssignments).toBe(2);

    const finalInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(finalInstance.status).toBe('CANCELLED');
    expect(finalInstance.activeSlotCount).toBe(0);

    const assignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id },
      select: { status: true },
    });
    expect(assignments).toHaveLength(2);
    expect(assignments.every((a) => a.status === 'REVOKED')).toBe(true);
  },
  30_000,
);

test(
  'cancelling an already-cancelled instance is rejected as an illegal transition',
  async () => {
    const instanceId = await createAvailableInstance(db, ids, 'bad', 6);
    const first = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/cancel`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/cancel`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: { code: string } }).error.code).toBe('ILLEGAL_TRANSITION');
  },
  30_000,
);

test(
  'bulk-cancelling a definition\'s open instances cancels every open one and reports the count',
  async () => {
    const defId = ids.definitionId('bulk-cancel');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Staubsaugen',
        categoryId: ids.categoryId,
        baseValue: 4,
        estimatedMinutes: 15,
        recurrenceType: 'MANUAL',
      },
    });
    const now = new Date();
    const available = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 4,
        baseValue: 4,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
      },
      select: { id: true },
    });
    const assigned = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
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
        taskInstanceId: assigned.id,
        memberId: paul.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        activeForInstanceId: assigned.id,
        slotIndex: 0,
        activeSlotKey: `${assigned.id}:0`,
        valueAtAssignment: 4,
        configVersion: 1,
        assignedAt: now,
        respondedAt: now,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/task-definitions/${defId}/cancel-open-instances`,
      headers: authHeaders(elke),
      payload: { reason: 'Definition wurde grundlegend geändert' },
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json() as { cancelled: number; skipped: number };
    expect(body.cancelled).toBe(2);
    expect(body.skipped).toBe(0);

    const rows = await db.taskInstance.findMany({
      where: { id: { in: [available.id, assigned.id] } },
      select: { status: true },
    });
    expect(rows.every((r) => r.status === 'CANCELLED')).toBe(true);
  },
  30_000,
);
