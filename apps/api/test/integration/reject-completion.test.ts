/**
 * Admin rejection of an unsatisfactory completion, over real HTTP against a
 * real Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * The point, as in `happy-path.test.ts`, is the seam: rejection must reverse
 * a paid reward through the real ledger writer, and — unlike an ordinary
 * event, which the domain suite still proves can never touch a `COMPLETED`
 * instance — the admin's own two reopen outcomes must actually put the chore
 * back in play: reassigned straight back to the member (who can then redo it
 * and earn the normal reward), or back on the market for anyone.
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

const ids = idsFor('test-rejectcompletion-');

const BASE_VALUE = 4;

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session; // ADMIN
let paul: Session; // MEMBER

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
    ],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: BASE_VALUE }],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'Admin lehnt ab und bietet erneut auf dem Markt an — die Belohnung wird zurückgebucht',
  async () => {
    const instanceId = await createAvailableInstance(db, ids, 'bad', BASE_VALUE);

    const taken = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(taken.statusCode).toBe(200);
    const assignmentId = (taken.json() as { assignment: { id: string } }).assignment.id;

    const done = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/complete`,
      headers: authHeaders(paul),
      payload: { assignmentId },
    });
    expect(done.statusCode).toBe(200);

    const balanceAfterCompletion = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: paul.cookie },
    });
    expect((balanceAfterCompletion.json() as { balance: number }).balance).toBe(BASE_VALUE);

    // ── the rejection itself ─────────────────────────────────────────────
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/reject-completion`,
      headers: authHeaders(elke),
      payload: { reason: 'nicht gründlich genug', outcome: 'REOFFER_MARKET' },
    });
    expect(rejected.statusCode).toBe(200);
    const rejectedBody = rejected.json() as {
      instanceId: string;
      assignmentId: string;
      memberId: string;
      clawedBack: number;
      outcome: string;
      status: string;
      newAssignmentId: string | null;
    };
    expect(rejectedBody.clawedBack).toBe(BASE_VALUE);
    expect(rejectedBody.assignmentId).toBe(assignmentId);
    expect(rejectedBody.memberId).toBe(paul.memberId);
    expect(rejectedBody.outcome).toBe('REOFFER_MARKET');
    expect(rejectedBody.status).toBe('AVAILABLE');
    expect(rejectedBody.newAssignmentId).toBeNull();

    // ── the points are actually gone, through the real ledger ───────────
    const balanceAfterRejection = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: paul.cookie },
    });
    expect((balanceAfterRejection.json() as { balance: number }).balance).toBe(0);

    // ── the chore is genuinely back in play, not stuck as COMPLETED ──────
    const instanceRow = await db.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      select: {
        status: true,
        offerExpiresAt: true,
        completedAt: true,
        completedByMemberId: true,
        closedAt: true,
      },
    });
    expect(instanceRow.status).toBe('AVAILABLE');
    expect(instanceRow.offerExpiresAt).not.toBeNull();
    expect(instanceRow.completedAt).toBeNull();
    expect(instanceRow.completedByMemberId).toBeNull();
    expect(instanceRow.closedAt).toBeNull();

    const assignmentRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { status: true },
    });
    expect(assignmentRow.status).toBe('REJECTED');

    // ── it is genuinely re-offered: the board shows it as available again ─
    const board = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: { cookie: paul.cookie },
    });
    const boardItem = (board.json() as { items: { id: string; canVolunteer: boolean }[] }).items.find(
      (i) => i.id === instanceId,
    );
    expect(boardItem?.canVolunteer).toBe(true);

    // ── §22: the family timeline carries all three events ───────────────
    const history = await app.inject({
      method: 'GET',
      url: `/api/tasks/${instanceId}/history`,
      headers: { cookie: elke.cookie },
    });
    const historyTypes = (history.json() as { items: { type: string }[] }).items.map(
      (e) => e.type,
    );
    expect(historyTypes).toContain('COMPLETION_REJECTED');
    expect(historyTypes).toContain('POINTS_CLAWED_BACK');
    expect(historyTypes).toContain('RE_OFFERED');

    // ── §23: the admin audit trail carries it too ────────────────────────
    const audit = await app.inject({
      method: 'GET',
      url: `/api/admin/audit-events?entityId=${instanceId}&action=TASK_COMPLETION_REJECTED`,
      headers: { cookie: elke.cookie },
    });
    expect(audit.statusCode).toBe(200);
    const auditItems = (audit.json() as { items: { payload: { reason: string | null } }[] }).items;
    expect(auditItems).toHaveLength(1);
    expect(auditItems[0]!.payload.reason).toBe('nicht gründlich genug');

    // ── rejecting the same (now closed) assignment again is refused ─────
    const rejectedAgain = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instanceId}/reject-completion`,
      headers: authHeaders(elke),
      payload: { outcome: 'REOFFER_MARKET' },
    });
    expect(rejectedAgain.statusCode).toBe(404);

    // ── and the balance was not touched a second time ────────────────────
    const balanceFinal = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: paul.cookie },
    });
    expect((balanceFinal.json() as { balance: number }).balance).toBe(0);
  },
  60_000,
);

test(
  'Admin lehnt ab und weist direkt an den Zugewiesenen zurück — eine ordentliche Nacherledigung zahlt normal aus (§7, §44)',
  async () => {
    const now = new Date();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: ids.definitionId('bad'),
        status: 'ASSIGNED',
        currentValue: BASE_VALUE,
        baseValue: BASE_VALUE,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
      },
      select: { id: true },
    });
    const assignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: paul.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: instance.id,
        valueAtAssignment: BASE_VALUE,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });

    // Admin completes on the assignee's behalf — the same seam
    // `POST /admin/instances/:id/complete` already covers.
    const done = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instance.id}/complete`,
      headers: authHeaders(elke),
    });
    expect(done.statusCode).toBe(200);
    // A RANDOM completion earns nothing (§7, §44) — the baseline this test
    // exists to contrast with the redo below.
    expect((done.json() as { pointsAwarded: number }).pointsAwarded).toBe(0);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instance.id}/reject-completion`,
      headers: authHeaders(elke),
      payload: { outcome: 'REASSIGN_TO_MEMBER' },
    });
    expect(rejected.statusCode).toBe(200);
    const rejectedBody = rejected.json() as {
      clawedBack: number;
      outcome: string;
      status: string;
      newAssignmentId: string | null;
    };
    expect(rejectedBody.clawedBack).toBe(0);
    expect(rejectedBody.outcome).toBe('REASSIGN_TO_MEMBER');
    expect(rejectedBody.status).toBe('ASSIGNED');
    expect(rejectedBody.newAssignmentId).not.toBeNull();
    expect(rejectedBody.newAssignmentId).not.toBe(assignment.id);
    const newAssignmentId = rejectedBody.newAssignmentId!;

    const originalRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      select: { status: true },
    });
    expect(originalRow.status).toBe('REJECTED');

    const newRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: newAssignmentId },
      select: { status: true, kind: true, memberId: true },
    });
    expect(newRow.status).toBe('ACTIVE');
    // §44's headline invariant applies going forward too: only a VOLUNTARY
    // assignment can ever pay, which is why the redo must be one — this is
    // what makes the reward below legal at all, not a workaround of it.
    expect(newRow.kind).toBe('VOLUNTARY');
    expect(newRow.memberId).toBe(paul.memberId);

    const instanceRow = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, completedAt: true, completedByMemberId: true },
    });
    expect(instanceRow.status).toBe('ASSIGNED');
    expect(instanceRow.completedAt).toBeNull();
    expect(instanceRow.completedByMemberId).toBeNull();

    const history = await app.inject({
      method: 'GET',
      url: `/api/tasks/${instance.id}/history`,
      headers: { cookie: elke.cookie },
    });
    const historyTypes = (history.json() as { items: { type: string }[] }).items.map(
      (e) => e.type,
    );
    expect(historyTypes).toContain('COMPLETION_REJECTED');
    expect(historyTypes).not.toContain('POINTS_CLAWED_BACK');
    expect(historyTypes).toContain('REOPENED_TO_ASSIGNEE');

    // ── the redo, done properly this time, pays the normal reward ───────
    const redone = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/complete`,
      headers: authHeaders(paul),
      payload: { assignmentId: newAssignmentId },
    });
    expect(redone.statusCode).toBe(200);
    expect((redone.json() as { pointsAwarded: number }).pointsAwarded).toBe(BASE_VALUE);

    const balanceAfterRedo = await app.inject({
      method: 'GET',
      url: '/api/members/me/points',
      headers: { cookie: paul.cookie },
    });
    expect((balanceAfterRedo.json() as { balance: number }).balance).toBe(BASE_VALUE);
  },
  60_000,
);

test('Nicht-Admin darf keine Erledigung ablehnen', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', BASE_VALUE);
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/reject-completion`,
    headers: authHeaders(paul),
    payload: { outcome: 'REOFFER_MARKET' },
  });
  expect(response.statusCode).toBe(403);
});

test('Ablehnen einer nicht abgeschlossenen Aufgabe liefert 404', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', BASE_VALUE);
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/reject-completion`,
    headers: authHeaders(elke),
    payload: { outcome: 'REOFFER_MARKET' },
  });
  expect(response.statusCode).toBe(404);
});

test('Ablehnen ohne outcome liefert einen Validierungsfehler', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', BASE_VALUE);
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/instances/${instanceId}/reject-completion`,
    headers: authHeaders(elke),
    payload: {},
  });
  expect(response.statusCode).toBe(422);
});
