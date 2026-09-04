/**
 * Bugfix — "Multi-Worker-Aufgabe erscheint erst in 'Meine Aufgaben', wenn
 * alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält"
 * (.planning/intake/multi-worker-task-not-in-my-tasks-until-fully-staffed.md).
 *
 * `listAssignedToMe()` used to filter hard on `status: 'ASSIGNED'`, so an
 * `EXACTLY(2)` (or `AT_LEAST(2)`) instance never showed up under "Meine
 * Aufgaben" for its first volunteer — the instance stays `AVAILABLE` until
 * `minRequired` is actually crossed, even though that volunteer already
 * holds a real `ACTIVE` assignment. This file locks in the fix: a still-
 * recruiting instance the viewer has joined shows up in
 * `/tasks/assigned-to-me` right away, and — the mirror case —
 * `EXACTLY(1)` is unaffected, since its one join always crosses
 * `minRequired` immediately.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  authHeaders,
  buildTestServer,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-multiworker-assigned-to-me-');

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
  'EXACTLY(2): erster Freiwilliger erscheint sofort in /tasks/assigned-to-me, obwohl die Instanz noch AVAILABLE ist',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('umzugshilfe-exactly-2');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Umzugshilfe',
        categoryId: ids.categoryId,
        baseValue: 6,
        estimatedMinutes: 90,
        recurrenceType: 'MANUAL',
        workerCountMode: 'EXACTLY',
        workerCount: 2,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 6,
        baseValue: 6,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 2,
        activeSlotCount: 0,
      },
      select: { id: true },
    });

    // Paul volunteers first — EXACTLY(2) needs a second joiner before
    // minRequired is crossed, so the instance stays AVAILABLE.
    const paulVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(paulVolunteer.statusCode, JSON.stringify(paulVolunteer.json())).toBe(200);

    const afterPaul = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterPaul.status).toBe('AVAILABLE');
    expect(afterPaul.activeSlotCount).toBe(1);

    // Paul must see the instance under /tasks/assigned-to-me right away —
    // this is the bug: it used to require status === 'ASSIGNED'.
    const paulAssigned = await app.inject({
      method: 'GET',
      url: '/api/tasks/assigned-to-me',
      headers: authHeaders(paul),
    });
    expect(paulAssigned.statusCode).toBe(200);
    const paulRow = (paulAssigned.json() as { items: Array<Record<string, unknown>> }).items.find(
      (i) => i.id === instance.id,
    );
    expect(
      paulRow,
      'a still-recruiting instance the viewer already joined must appear in /tasks/assigned-to-me',
    ).toBeDefined();
    expect(paulRow).toMatchObject({ status: 'AVAILABLE', viewerHasActiveSlot: true });

    // Maria, who has not joined, must not see it there.
    const mariaAssigned = await app.inject({
      method: 'GET',
      url: '/api/tasks/assigned-to-me',
      headers: authHeaders(maria),
    });
    expect(
      (mariaAssigned.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === instance.id),
      'a member with no active slot on the instance must not see it under assigned-to-me',
    ).toBe(false);

    // It must still be reachable under /tasks/available for the still-open
    // second slot — the already-fixed sibling behavior must not regress.
    const mariaAvailable = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: authHeaders(maria),
    });
    expect(
      (mariaAvailable.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === instance.id),
      'must still be joinable by others while a slot remains open',
    ).toBe(true);

    // Maria joins the second slot — now the instance crosses minRequired.
    const mariaVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(mariaVolunteer.statusCode, JSON.stringify(mariaVolunteer.json())).toBe(200);

    const afterMaria = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterMaria.status).toBe('ASSIGNED');
    expect(afterMaria.activeSlotCount).toBe(2);

    // Both Paul and Maria now see it under assigned-to-me.
    const bothAssigned = await Promise.all(
      [paul, maria].map((session) =>
        app.inject({
          method: 'GET',
          url: '/api/tasks/assigned-to-me',
          headers: authHeaders(session),
        }),
      ),
    );
    for (const response of bothAssigned) {
      expect(
        (response.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === instance.id),
        'once fully staffed, every active holder must see it under assigned-to-me',
      ).toBe(true);
    }
  },
  60_000,
);

test(
  'EXACTLY(1) (Normalfall): sofort in /tasks/assigned-to-me und mit status ASSIGNED — unverändertes Verhalten',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('geschirr-exactly-1');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Geschirrspüler ausräumen',
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
        status: 'AVAILABLE',
        currentValue: 2,
        baseValue: 2,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'EXACTLY',
        workerCount: 1,
        activeSlotCount: 0,
      },
      select: { id: true },
    });

    const volunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(anna),
      payload: {},
    });
    expect(volunteer.statusCode, JSON.stringify(volunteer.json())).toBe(200);

    const afterVolunteer = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true },
    });
    expect(afterVolunteer.status).toBe('ASSIGNED');

    const annaAssigned = await app.inject({
      method: 'GET',
      url: '/api/tasks/assigned-to-me',
      headers: authHeaders(anna),
    });
    const annaRow = (annaAssigned.json() as { items: Array<Record<string, unknown>> }).items.find(
      (i) => i.id === instance.id,
    );
    expect(annaRow).toMatchObject({ status: 'ASSIGNED' });
  },
  60_000,
);
