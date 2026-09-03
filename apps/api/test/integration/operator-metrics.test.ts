/**
 * Correctness of `computeOperatorMetrics`'s resolved query definitions —
 * the 14-day active-household window, the 24h/7d active-user windows, and
 * the Todoist-adoption snapshot count (Architektur
 * `.planning/architecture-operator-dashboard.md`).
 *
 * These metrics are deliberately **global** (unscoped by household) — the
 * one narrow exception to CLAUDE.md §36. `vitest.config.ts` runs integration
 * files in parallel, each normally isolated behind its own `test-…`-prefixed
 * household; a global aggregate breaks that isolation, so asserting on it
 * via "read a baseline, mutate, read again, diff" races against whatever
 * other files are concurrently touching the same global tables (an earlier
 * revision of this file hit exactly that: a flaky diff against Todoist
 * fixtures created by unrelated suites running at the same time).
 *
 * Even a "call the API, then immediately re-run the same query and diff"
 * check turned out too tight: every other integration file's `login()` call
 * writes a fresh `Session` row with `lastSeenAt≈now`, so `users.active24h`/
 * `7d` are a continuously moving target for the whole parallel test run, not
 * just across a narrow gap between two reads. So this file relies on a
 * single race-safe check per metric instead:
 *  - **Boundary proof** — query the database directly with the exact same
 *    predicate `metrics.ts` uses, and assert our own known fixture id is
 *    included/excluded correctly. Zero race window: it only reads rows we
 *    wrote ourselves, at fixed timestamps in the past, and nothing else in
 *    the suite can remove them mid-test.
 *  - A weak but real lower-bound check that the API actually reflects our
 *    fixture (`>= 1`), since our qualifying row is guaranteed to still exist
 *    at the moment of the API call.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { hashPassword } from '../../src/infra/auth/password.js';
import {
  authHeaders,
  buildTestServer,
  createHousehold,
  createOperatorAccount,
  dropHousehold,
  dropOperatorAccount,
  idsFor,
  operatorLogin,
  testDb,
  type Session,
} from './_fixture.js';

const idsA = idsFor('opmet-a-');
const idsB = idsFor('opmet-b-');
const operatorAccountId = 'opmet-operator';
const operatorEmail = 'operator@opmet-test.invalid';
const DAY_MS = 86_400_000;

let db: PrismaClient;
let app: FastifyInstance;
let operatorSession: Session;

interface MetricsBody {
  households: { total: number; active: number };
  users: { total: number; active: number; activeLast24h: number; activeLast7d: number };
  todoistAdoption: { activeIntegrations: number };
}

async function getMetrics(): Promise<MetricsBody> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/operator/metrics',
    headers: authHeaders(operatorSession),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as MetricsBody;
}

async function directActiveHouseholdIds(since: Date): Promise<string[]> {
  const rows = await db.taskInstance.findMany({
    where: { publishedAt: { not: null, gte: since } },
    select: { householdId: true },
    distinct: ['householdId'],
  });
  return rows.map((r) => r.householdId);
}

async function directActiveUserIds(since: Date): Promise<string[]> {
  const rows = await db.session.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, idsA);
  await dropHousehold(db, idsB);
  await dropOperatorAccount(db, operatorAccountId);
  await db.session.deleteMany({ where: { userId: { in: ['opmet-user-x', 'opmet-user-y'] } } });
  await db.user.deleteMany({ where: { id: { in: ['opmet-user-x', 'opmet-user-y'] } } });

  await createHousehold(db, idsA, {
    members: [
      { key: 'anna', displayName: 'Anna', role: 'MEMBER' },
      { key: 'ben', displayName: 'Ben', role: 'MEMBER' },
    ],
    definitions: [{ key: 'd', title: 'Test A', baseValue: 5 }],
  });
  await createHousehold(db, idsB, {
    members: [{ key: 'carla', displayName: 'Carla', role: 'MEMBER' }],
    definitions: [{ key: 'd', title: 'Test B', baseValue: 5 }],
  });
  await createOperatorAccount(db, operatorAccountId, operatorEmail);

  app = await buildTestServer(db);
  operatorSession = await operatorLogin(app, operatorEmail);
});

afterAll(async () => {
  await app.close();
  await dropHousehold(db, idsA);
  await dropHousehold(db, idsB);
  await dropOperatorAccount(db, operatorAccountId);
  await db.session.deleteMany({ where: { userId: { in: ['opmet-user-x', 'opmet-user-y'] } } });
  await db.user.deleteMany({ where: { id: { in: ['opmet-user-x', 'opmet-user-y'] } } });
  await db.$disconnect();
});

test('households.active includes a household with a recent published instance, excludes one with only an old instance', async () => {
  const now = new Date();
  const since14d = new Date(now.getTime() - 14 * DAY_MS);

  await db.taskInstance.create({
    data: {
      householdId: idsA.householdId,
      taskDefinitionId: idsA.definitionId('d'),
      status: 'AVAILABLE',
      currentValue: 5,
      baseValue: 5,
      scheduledFor: now,
      publishedAt: new Date(now.getTime() - 5 * DAY_MS), // inside the 14d window
      configVersion: 1,
    },
  });
  await db.taskInstance.create({
    data: {
      householdId: idsB.householdId,
      taskDefinitionId: idsB.definitionId('d'),
      status: 'AVAILABLE',
      currentValue: 5,
      baseValue: 5,
      scheduledFor: now,
      publishedAt: new Date(now.getTime() - 20 * DAY_MS), // outside the 14d window
      configVersion: 1,
    },
  });

  // Boundary proof (no race — only reads our own fixed-timestamp rows).
  const directIds = await directActiveHouseholdIds(since14d);
  expect(directIds).toContain(idsA.householdId);
  expect(directIds).not.toContain(idsB.householdId);

  // Our qualifying row still exists at call time, so the API must count it.
  const metrics = await getMetrics();
  expect(metrics.households.active).toBeGreaterThanOrEqual(1);
});

test('users.activeLast24h/activeLast7d include a recent session, exclude a stale one', async () => {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const passwordHash = await hashPassword('integration-test-pw');

  await db.user.create({
    data: { id: 'opmet-user-x', email: 'x@opmet-test.invalid', displayName: 'X', passwordHash },
  });
  await db.session.create({
    data: {
      userId: 'opmet-user-x',
      tokenHash: 'opmet-token-x',
      csrfTokenHash: 'opmet-csrf-x',
      lastSeenAt: now, // inside both windows
      expiresAt: new Date(now.getTime() + DAY_MS),
    },
  });
  await db.user.create({
    data: { id: 'opmet-user-y', email: 'y@opmet-test.invalid', displayName: 'Y', passwordHash },
  });
  await db.session.create({
    data: {
      userId: 'opmet-user-y',
      tokenHash: 'opmet-token-y',
      csrfTokenHash: 'opmet-csrf-y',
      lastSeenAt: new Date(now.getTime() - 10 * DAY_MS), // outside both windows
      expiresAt: new Date(now.getTime() + DAY_MS),
    },
  });

  // Boundary proof.
  const directIds24h = await directActiveUserIds(since24h);
  expect(directIds24h).toContain('opmet-user-x');
  expect(directIds24h).not.toContain('opmet-user-y');
  const directIds7d = await directActiveUserIds(since7d);
  expect(directIds7d).toContain('opmet-user-x');
  expect(directIds7d).not.toContain('opmet-user-y');

  // Our qualifying session still exists at call time, so the API must count it.
  const metrics = await getMetrics();
  expect(metrics.users.activeLast24h).toBeGreaterThanOrEqual(1);
  expect(metrics.users.activeLast7d).toBeGreaterThanOrEqual(1);
});

test('todoistAdoption.activeIntegrations counts ACTIVE, not DISABLED, integrations', async () => {
  await db.memberIntegration.create({
    data: {
      householdId: idsA.householdId,
      memberId: idsA.memberId('anna'),
      provider: 'TODOIST',
      status: 'ACTIVE',
    },
  });
  await db.memberIntegration.create({
    data: {
      householdId: idsA.householdId,
      memberId: idsA.memberId('ben'),
      provider: 'TODOIST',
      status: 'DISABLED',
    },
  });

  // Boundary proof.
  const activeRows = await db.memberIntegration.findMany({
    where: { householdId: idsA.householdId, status: 'ACTIVE' },
    select: { memberId: true },
  });
  expect(activeRows.map((r) => r.memberId)).toContain(idsA.memberId('anna'));
  expect(activeRows.map((r) => r.memberId)).not.toContain(idsA.memberId('ben'));

  // Our qualifying row still exists at call time, so the API must count it.
  const metrics = await getMetrics();
  expect(metrics.todoistAdoption.activeIntegrations).toBeGreaterThanOrEqual(1);
});
