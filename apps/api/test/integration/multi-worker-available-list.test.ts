/**
 * Bugfix — "Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen
 * Volunteer-Listen, sobald der erste Freiwillige übernimmt"
 * (.planning/intake/multi-worker-task-vanishes-from-available-list-after-first-volunteer.md).
 *
 * `listAvailableTasks()` used to filter hard on `status: 'AVAILABLE'`, so an
 * `AT_LEAST`/`AT_MOST` instance dropped out of every volunteer-facing list
 * (`/tasks/available`, `/tasks/board`, dashboard `openTasks`) the moment the
 * first join crossed `minRequired` and flipped it to `ASSIGNED` — even though
 * `activeSlotCount < maxAllowed(...)` still held and a second volunteer could
 * legally join (`volunteerForTask.ts`'s guard was always correct; only the
 * read side was broken). This file locks in the fix: an `ASSIGNED` instance
 * with a free slot stays listed and joinable; one that is actually full does
 * not; `EXACTLY` is unaffected.
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

const ids = idsFor('test-multiworker-available-list-');

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
  'AT_LEAST(1) mit offenem Slot bleibt nach dem ersten Freiwilligen in /tasks/available und /tasks/board sichtbar und übernehmbar',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('gartenpflege-at-least');
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
        workerCount: 1,
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
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'AT_LEAST',
        workerCount: 1,
        activeSlotCount: 0,
      },
      select: { id: true },
    });

    // Paul volunteers — AT_LEAST(1) crosses minRequired immediately, so the
    // instance flips to ASSIGNED even though max is unbounded.
    const volunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(volunteer.statusCode, JSON.stringify(volunteer.json())).toBe(200);

    const afterPaul = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterPaul.status).toBe('ASSIGNED');
    expect(afterPaul.activeSlotCount).toBe(1);

    // Maria never joined — she must still see the instance in /tasks/available,
    // now ASSIGNED but still recruiting.
    const mariaAvailable = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: authHeaders(maria),
    });
    expect(mariaAvailable.statusCode).toBe(200);
    const mariaRow = (mariaAvailable.json() as { items: Array<Record<string, unknown>> }).items.find(
      (i) => i.id === instance.id,
    );
    expect(mariaRow, 'ASSIGNED-with-open-slot instance must not vanish from /tasks/available').toBeDefined();
    expect(mariaRow).toMatchObject({
      status: 'ASSIGNED',
      activeSlotCount: 1,
      canVolunteer: true,
      viewerHasActiveSlot: false,
    });

    // The dashboard's family panel (`/tasks/board`'s `open` field) is the same
    // underlying query — it must not lag behind /tasks/available.
    const mariaBoard = await app.inject({
      method: 'GET',
      url: '/api/tasks/board',
      headers: authHeaders(maria),
    });
    expect(mariaBoard.statusCode).toBe(200);
    const boardRow = (mariaBoard.json() as { open: Array<Record<string, unknown>> }).open.find(
      (i) => i.id === instance.id,
    );
    expect(boardRow, '/tasks/board must show the same open instance as /tasks/available').toBeDefined();
    expect(boardRow).toMatchObject({ status: 'ASSIGNED', canVolunteer: true });

    // Paul, who already holds the only current slot, must not be re-offered
    // it as something he can volunteer for again.
    const paulAvailable = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: authHeaders(paul),
    });
    const paulRow = (paulAvailable.json() as { items: Array<Record<string, unknown>> }).items.find(
      (i) => i.id === instance.id,
    );
    expect(paulRow).toBeDefined();
    expect(paulRow).toMatchObject({ canVolunteer: false, viewerHasActiveSlot: true });

    // Maria actually joins the still-open slot through the real CTA path.
    const mariaVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(mariaVolunteer.statusCode, JSON.stringify(mariaVolunteer.json())).toBe(200);

    const afterMaria = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { activeSlotCount: true },
    });
    expect(afterMaria.activeSlotCount).toBe(2);
  },
  60_000,
);

test(
  'AT_MOST(2), voll besetzt: verschwindet korrekt aus /tasks/available (unverändertes Verhalten)',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('kueche-at-most');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Küche gründlich reinigen',
        categoryId: ids.categoryId,
        baseValue: 7,
        estimatedMinutes: 40,
        recurrenceType: 'MANUAL',
        workerCountMode: 'AT_MOST',
        workerCount: 2,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 7,
        baseValue: 7,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'AT_MOST',
        workerCount: 2,
        activeSlotCount: 0,
      },
      select: { id: true },
    });

    // AT_MOST floors minRequired at 1 (worker-slots.ts), so the first join
    // already flips it to ASSIGNED while a second slot remains open.
    const paulVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(paulVolunteer.statusCode, JSON.stringify(paulVolunteer.json())).toBe(200);

    const midway = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: authHeaders(anna),
    });
    expect(
      (midway.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === instance.id),
      'AT_MOST(2) with one free slot must still be listed',
    ).toBe(true);

    const mariaVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(mariaVolunteer.statusCode, JSON.stringify(mariaVolunteer.json())).toBe(200);

    const full = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { activeSlotCount: true },
    });
    expect(full.activeSlotCount).toBe(2);

    const afterFull = await app.inject({
      method: 'GET',
      url: '/api/tasks/available',
      headers: authHeaders(anna),
    });
    expect(
      (afterFull.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === instance.id),
      'a fully-staffed AT_MOST instance must still disappear from /tasks/available',
    ).toBe(false);
  },
  60_000,
);
