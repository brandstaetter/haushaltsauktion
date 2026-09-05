/**
 * `GET /admin/audit-events` server-side filtering, over real HTTP against a
 * real Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db` and `npm run db:migrate`.
 *
 * Regression coverage for the "Zuweisungslauf ausgeführt drowns out
 * everything else" bug: `ASSIGNMENT_SWEEP_RUN` (a `SYSTEM`-actor event
 * written on every sweep tick, `runAssignmentSweep.ts`) can fill the route's
 * top-100 `seq desc` window on its own. Filtering used to happen only in the
 * frontend against that one already-capped fetch, so a filtered-in action
 * could still be invisible if enough sweep-run noise pushed it out of the
 * page before the client ever saw it. The fix moves `actions`/`actors`
 * filtering into the query itself — this test seeds more `ASSIGNMENT_SWEEP_RUN`
 * rows than the page size and asserts a real member action still surfaces
 * once it's the only thing selected.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import {
  buildTestServer,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-adminauditevents-');

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
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');

  // Flood the top-100 window with SYSTEM-actor sweep-run noise, then write one
  // real member action. Ordering is `seq desc`, so without a query-level
  // filter the sweep runs alone would fill an unfiltered page long before a
  // 101-row-deep fetch ever reached the member action.
  for (let i = 0; i < 120; i++) {
    await db.auditEvent.create({
      data: {
        householdId: ids.householdId,
        actorType: 'SYSTEM',
        action: 'ASSIGNMENT_SWEEP_RUN',
        entityType: 'Household',
        entityId: ids.householdId,
        payload: { materialized: 0, published: 0, assigned: 0, expired: 0, skipped: 0 },
      },
    });
  }
  await db.auditEvent.create({
    data: {
      householdId: ids.householdId,
      actorType: 'ADMIN',
      actorMemberId: ids.memberId('elke'),
      action: 'ROLE_CHANGED',
      entityType: 'HouseholdMember',
      entityId: ids.memberId('paul'),
      payload: { before: 'MEMBER', after: 'ADMIN' },
    },
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test('ohne Filter verdrängt Zuweisungslauf-Rauschen die echte Mitgliederaktion aus den Top 100', async () => {
  const unfiltered = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-events?limit=100',
    headers: { cookie: elke.cookie },
  });
  expect(unfiltered.statusCode).toBe(200);
  const unfilteredItems = (unfiltered.json() as { items: { action: string }[] }).items;
  expect(unfilteredItems).toHaveLength(100);
  expect(unfilteredItems.every((i) => i.action === 'ASSIGNMENT_SWEEP_RUN')).toBe(true);
});

test('mit actions-Filter in der Query erscheint die Mitgliederaktion trotz des Rauschens', async () => {
  const filtered = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-events?limit=100&actions=ROLE_CHANGED',
    headers: { cookie: elke.cookie },
  });
  expect(filtered.statusCode).toBe(200);
  const items = (filtered.json() as { items: { action: string; actorMemberId: string | null }[] }).items;
  expect(items).toHaveLength(1);
  expect(items[0]!.action).toBe('ROLE_CHANGED');
  expect(items[0]!.actorMemberId).toBe(ids.memberId('elke'));
});

test('actors-Filter mit dem SYSTEM-Sentinel wählt nur systemgenerierte Einträge, ein Mitglieds-Filter nur dessen eigene', async () => {
  const systemOnly = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-events?limit=100&actors=SYSTEM',
    headers: { cookie: elke.cookie },
  });
  const systemItems = (systemOnly.json() as { items: { actorType: string }[] }).items;
  expect(systemItems.length).toBeGreaterThan(0);
  expect(systemItems.every((i) => i.actorType === 'SYSTEM')).toBe(true);

  const memberOnly = await app.inject({
    method: 'GET',
    url: `/api/admin/audit-events?limit=100&actors=${ids.memberId('elke')}`,
    headers: { cookie: elke.cookie },
  });
  const memberItems = (memberOnly.json() as { items: { action: string }[] }).items;
  expect(memberItems).toHaveLength(1);
  expect(memberItems[0]!.action).toBe('ROLE_CHANGED');
});

test('ein Mitglied ohne Admin-Rolle bekommt keinen Zugriff auf den Audit-Log-Endpunkt', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-events',
    headers: { cookie: paul.cookie },
  });
  expect(response.statusCode).toBe(403);
});
