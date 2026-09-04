/**
 * Intake "task-role-based-eligibility-and-preferred-assignee".
 *
 * Two independent additions to the eligibility model, covered end to end:
 *
 *   1. Role-based eligibility (`TaskDefinition.requiredRole`) — a hard rule
 *      alongside rules 1-5, gating both voluntary pickup and the random draw.
 *   2. `minAdminSlots` — a multi-worker admin headcount guarantee that only
 *      reserves the slots it actually needs to, never evicting an
 *      already-filled non-admin slot.
 *   3. Preferred assignee — a soft `WEIGHTED_FAIRNESS` weight bonus, visible
 *      in `/explain` but never a hard exclusion.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import type { SelectionExplanationDto } from '@haushaltsauktion/shared';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
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

const ids = idsFor('test-role-preferred-');

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session; // ADMIN
let arthur: Session; // ADMIN
let paul: Session; // MEMBER
let luise: Session; // MEMBER

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'luise', displayName: 'Luise', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  arthur = await login(app, ids, 'arthur');
  paul = await login(app, ids, 'paul');
  luise = await login(app, ids, 'luise');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'requiredRole: a member is rejected with ROLE_NOT_ELIGIBLE, an admin succeeds',
  async () => {
    const defId = ids.definitionId('steuererklaerung');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Steuererklärung',
        categoryId: ids.categoryId,
        baseValue: 5,
        estimatedMinutes: 60,
        recurrenceType: 'MANUAL',
        requiredRole: 'ADMIN',
      },
    });
    const now = new Date();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 5,
        baseValue: 5,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
      },
      select: { id: true },
    });

    const memberAttempt = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(memberAttempt.statusCode).toBe(403);
    const memberBody = memberAttempt.json() as { error: { code: string; details: { reason: string } } };
    expect(memberBody.error.code).toBe('NOT_ELIGIBLE');
    expect(memberBody.error.details.reason).toBe('ROLE_NOT_ELIGIBLE');

    const adminAttempt = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(elke),
      payload: {},
    });
    expect(adminAttempt.statusCode, JSON.stringify(adminAttempt.json())).toBe(200);

    const row = await db.taskAssignment.findFirst({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true },
    });
    expect(row?.memberId).toBe(elke.memberId);
  },
  30_000,
);

test(
  'minAdminSlots: the first (non-admin) slot is never evicted, but the last slot needed to close the deficit is reserved',
  async () => {
    const defId = ids.definitionId('vereinsvorstand');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Vereinsvorstand einladen',
        categoryId: ids.categoryId,
        baseValue: 3,
        estimatedMinutes: 30,
        recurrenceType: 'MANUAL',
        workerCountMode: 'EXACTLY',
        workerCount: 2,
        minAdminSlots: 1,
      },
    });
    const now = new Date();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 3,
        baseValue: 3,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
      },
      select: { id: true },
    });

    // Slot 1 of 2: deficit (1) is smaller than the two remaining slots, so a
    // plain member may take it — the reservation only ever bites once every
    // remaining slot is needed.
    const paulJoins = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(paulJoins.statusCode, JSON.stringify(paulJoins.json())).toBe(200);

    // The DTO's canVolunteer hint must already reflect the reservation for
    // the now-only-remaining slot — a stale `false` (never reserved) here
    // would show Luise an enabled "Übernehmen" CTA that a POST would then
    // reject with 403, exactly the false-positive this DTO must not produce.
    const luiseDetail = await app.inject({
      method: 'GET',
      url: `/api/tasks/${instance.id}`,
      headers: { cookie: luise.cookie },
    });
    expect(luiseDetail.statusCode).toBe(200);
    const luiseDetailBody = luiseDetail.json() as {
      canVolunteer: boolean;
      ineligibleReason: string | null;
    };
    expect(luiseDetailBody.canVolunteer).toBe(false);
    expect(luiseDetailBody.ineligibleReason).toBe('ADMIN_SLOT_RESERVED');

    // An admin, by contrast, is still shown as eligible for that same slot.
    const arthurDetail = await app.inject({
      method: 'GET',
      url: `/api/tasks/${instance.id}`,
      headers: { cookie: arthur.cookie },
    });
    const arthurDetailBody = arthurDetail.json() as { canVolunteer: boolean };
    expect(arthurDetailBody.canVolunteer).toBe(true);

    // Slot 2 of 2: now the deficit (1) equals the one remaining slot — a
    // second plain member must be rejected...
    const luiseAttempt = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(luise),
      payload: {},
    });
    expect(luiseAttempt.statusCode).toBe(403);
    const luiseBody = luiseAttempt.json() as { error: { code: string; details: { reason: string } } };
    expect(luiseBody.error.code).toBe('NOT_ELIGIBLE');
    expect(luiseBody.error.details.reason).toBe('ADMIN_SLOT_RESERVED');

    // ...while Paul's already-filled non-admin slot 1 is untouched.
    const stillActive = await db.taskAssignment.findFirst({
      where: { taskInstanceId: instance.id, memberId: paul.memberId, status: 'ACTIVE' },
      select: { id: true },
    });
    expect(stillActive).not.toBeNull();

    // ...and an admin closes out the reserved slot.
    const arthurJoins = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(arthur),
      payload: {},
    });
    expect(arthurJoins.statusCode, JSON.stringify(arthurJoins.json())).toBe(200);

    const finalInstance = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(finalInstance.status).toBe('ASSIGNED');
    expect(finalInstance.activeSlotCount).toBe(2);

    const holders = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true },
    });
    expect(new Set(holders.map((h) => h.memberId))).toEqual(
      new Set([paul.memberId, arthur.memberId]),
    );
  },
  30_000,
);

test(
  'minAdminSlots also gates the random draw (runAssignmentSweep), not just voluntary pickup',
  async () => {
    const defId = ids.definitionId('inventur');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Inventur',
        categoryId: ids.categoryId,
        baseValue: 4,
        estimatedMinutes: 30,
        recurrenceType: 'MANUAL',
        workerCountMode: 'EXACTLY',
        workerCount: 2,
        minAdminSlots: 1,
      },
    });
    const now = new Date();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 4,
        baseValue: 4,
        scheduledFor: now,
        publishedAt: now,
        // Already ripe — no need for a second update before the sweep.
        offerExpiresAt: new Date(now.getTime() - 1_000),
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
      },
      select: { id: true },
    });
    // Pre-seed slot 1 with a plain member directly (bypassing the HTTP guard
    // deliberately here — the point of this test is the sweep's own
    // enforcement, already covered from the voluntary side above).
    await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: luise.memberId,
        kind: 'VOLUNTARY',
        status: 'ACTIVE',
        response: 'ACCEPTED',
        slotIndex: 0,
        activeSlotKey: `${instance.id}:0`,
        valueAtAssignment: 4,
        configVersion: 1,
        assignedAt: now,
      },
    });
    await db.taskInstance.update({ where: { id: instance.id }, data: { activeSlotCount: 1 } });

    const report = await runAssignmentSweep(testDeps(db), { householdId: ids.householdId });
    expect(report.assigned).toBeGreaterThan(0);

    const holders = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { memberId: true, kind: true },
    });
    expect(holders).toHaveLength(2);
    // Luise's pre-seeded non-admin slot survives untouched...
    expect(holders.some((h) => h.memberId === luise.memberId)).toBe(true);
    // ...and the second slot the sweep filled went to one of the two admins,
    // never to Paul (the only other eligible non-admin).
    const drawnMemberId = holders.find((h) => h.memberId !== luise.memberId)?.memberId;
    expect([elke.memberId, arthur.memberId]).toContain(drawnMemberId);
    expect(drawnMemberId).not.toBe(paul.memberId);
  },
  30_000,
);

test(
  'preferred assignee: raises WEIGHTED_FAIRNESS weight and is visible in /explain, without excluding anyone',
  async () => {
    const defId = ids.definitionId('rasenmaehen');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Rasen mähen',
        categoryId: ids.categoryId,
        baseValue: 3,
        estimatedMinutes: 30,
        recurrenceType: 'MANUAL',
      },
    });
    await db.taskDefinitionPreferredAssignee.create({
      data: { householdId: ids.householdId, taskDefinitionId: defId, memberId: paul.memberId },
    });
    const now = new Date();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 3,
        baseValue: 3,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() - 1_000),
        configVersion: 1,
      },
      select: { id: true },
    });

    const report = await runAssignmentSweep(testDeps(db), { householdId: ids.householdId });
    expect(report.assigned).toBeGreaterThan(0);

    const assignment = await db.taskAssignment.findFirstOrThrow({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { id: true },
    });

    const explainRes = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignment.id}/explain`,
      headers: { cookie: elke.cookie },
    });
    expect(explainRes.statusCode, JSON.stringify(explainRes.json())).toBe(200);
    const explanation = explainRes.json() as SelectionExplanationDto;

    const paulTrace = explanation.candidates.find((c) => c.memberId === paul.memberId);
    expect(paulTrace).toBeDefined();
    expect(paulTrace?.included).toBe(true);
    expect((paulTrace?.weightTerms as Record<string, number> | null)?.['preferredTerm']).toBeGreaterThan(0);

    // The three non-preferred candidates carry no preferredTerm bonus, and —
    // the point of "soft" — every one of them is still included.
    for (const other of explanation.candidates.filter((c) => c.memberId !== paul.memberId)) {
      expect(other.included).toBe(true);
      expect((other.weightTerms as Record<string, number> | null)?.['preferredTerm'] ?? 0).toBe(0);
    }
  },
  30_000,
);

test(
  'admin API round-trip: requiredRole, minAdminSlots and preferred assignees persist through create, eligibility PUT and GET',
  async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/task-definitions',
      headers: authHeaders(elke),
      payload: {
        title: 'Steuerbescheid prüfen',
        baseValue: 4,
        workerCountMode: 'AT_LEAST',
        workerCount: 2,
        requiredRole: null,
        minAdminSlots: 1,
        recurrence: { type: 'MANUAL' },
      },
    });
    expect(created.statusCode, JSON.stringify(created.json())).toBe(201);
    const createdBody = created.json() as { id: string };

    const eligibilityPut = await app.inject({
      method: 'PUT',
      url: `/api/admin/task-definitions/${createdBody.id}/eligibility`,
      headers: authHeaders(elke),
      payload: { included: [], excluded: [], preferred: [paul.memberId] },
    });
    expect(eligibilityPut.statusCode, JSON.stringify(eligibilityPut.json())).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/admin/task-definitions/${createdBody.id}`,
      headers: authHeaders(elke),
    });
    expect(getRes.statusCode).toBe(200);
    const detail = getRes.json() as {
      minAdminSlots: number | null;
      requiredRole: string | null;
      preferredAssignees: { memberId: string }[];
    };
    expect(detail.minAdminSlots).toBe(1);
    expect(detail.requiredRole).toBeNull();
    expect(detail.preferredAssignees.map((p) => p.memberId)).toEqual([paul.memberId]);

    // A rejected update: minAdminSlots may never exceed workerCount.
    const invalidUpdate = await app.inject({
      method: 'PUT',
      url: `/api/admin/task-definitions/${createdBody.id}`,
      headers: authHeaders(elke),
      payload: {
        title: 'Steuerbescheid prüfen',
        baseValue: 4,
        workerCountMode: 'EXACTLY',
        workerCount: 1,
        requiredRole: null,
        minAdminSlots: 2,
        recurrence: { type: 'MANUAL' },
      },
    });
    expect(invalidUpdate.statusCode).toBe(422);
    const invalidBody = invalidUpdate.json() as { error: { code: string } };
    expect(invalidBody.error.code).toBe('VALIDATION_FAILED');
  },
  30_000,
);
