/**
 * **The operator-dashboard campaign's one genuinely load-bearing correctness
 * test** — CLAUDE.md §36 territory.
 *
 * A household `Session` and an `OperatorSession` are structurally separate
 * (different tables, different cookies, different context types — see
 * `operatorContext.ts`'s module doc), but "structurally separate" is only a
 * guarantee if nothing regresses it. This suite proves both directions with a
 * real HTTP request over a real cookie, not by reading the code and trusting
 * it: a household session must never reach `/api/operator/*`, and an operator
 * session must never reach an ordinary household route.
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
  createOperatorAccount,
  dropHousehold,
  dropOperatorAccount,
  idsFor,
  login,
  operatorLogin,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('opiso-');
const operatorAccountId = `${ids.prefix}operator`;
const operatorEmail = `operator@${ids.prefix}test.invalid`;

let db: PrismaClient;
let app: FastifyInstance;
let memberSession: Session;
let operatorSession: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await dropOperatorAccount(db, operatorAccountId);

  await createHousehold(db, ids, {
    members: [{ key: 'anna', displayName: 'Anna', role: 'MEMBER' }],
    definitions: [],
  });
  await createOperatorAccount(db, operatorAccountId, operatorEmail);

  app = await buildTestServer(db);
  memberSession = await login(app, ids, 'anna');
  operatorSession = await operatorLogin(app, operatorEmail);
});

afterAll(async () => {
  await app.close();
  await dropHousehold(db, ids);
  await dropOperatorAccount(db, operatorAccountId);
  await db.$disconnect();
});

test('a household session cannot reach /api/operator/metrics', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/operator/metrics',
    headers: authHeaders(memberSession),
  });
  expect([401, 403]).toContain(response.statusCode);
  const body = response.json() as { error?: { code?: string } };
  expect(body.error?.code).not.toBe(undefined);
  // Never the metrics shape — a household session must not even partially
  // see cross-household data.
  expect(response.json()).not.toHaveProperty('households');
});

test('an operator session cannot reach an ordinary household route', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: authHeaders(operatorSession),
  });
  expect([401, 403]).toContain(response.statusCode);
  expect(response.json()).not.toHaveProperty('household');
});

test('an operator session cannot reach /api/tasks/available either', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/tasks/available',
    headers: authHeaders(operatorSession),
  });
  expect([401, 403]).toContain(response.statusCode);
});

test('a valid operator session reaches /api/operator/metrics and gets the metrics shape', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/operator/metrics',
    headers: authHeaders(operatorSession),
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as {
    households: { total: number; active: number };
    users: { total: number; active: number; activeLast24h: number; activeLast7d: number };
  };
  expect(typeof body.households.total).toBe('number');
  expect(typeof body.households.active).toBe('number');
  expect(typeof body.users.total).toBe('number');
});
