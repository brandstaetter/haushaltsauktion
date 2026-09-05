/**
 * Smoke test for the Phase 1 Web Push subscription routes
 * (push-notifications §Architekturvorschlag). No delivery in this phase —
 * just: a member can register a subscription, it upserts by endpoint, and a
 * member can never delete another member's subscription (§36).
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

const ids = idsFor('test-pushsub-');

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;
let arthur: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  arthur = await login(app, ids, 'arthur');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test('a member can register a push subscription', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(elke),
    payload: {
      endpoint: 'https://push.example/endpoint-elke',
      keys: { p256dh: 'p256dh-elke', auth: 'auth-elke' },
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const body = response.json() as { id: string };
  expect(typeof body.id).toBe('string');

  const row = await db.pushSubscription.findUniqueOrThrow({
    where: { endpoint: 'https://push.example/endpoint-elke' },
    select: { memberId: true, p256dh: true, auth: true },
  });
  expect(row.memberId).toBe(elke.memberId);
  expect(row.p256dh).toBe('p256dh-elke');
  expect(row.auth).toBe('auth-elke');
});

test('resubscribing with the same endpoint upserts rather than duplicating', async () => {
  const first = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(arthur),
    payload: {
      endpoint: 'https://push.example/endpoint-shared',
      keys: { p256dh: 'p256dh-v1', auth: 'auth-v1' },
    },
  });
  expect(first.statusCode, first.body).toBe(201);
  const firstId = (first.json() as { id: string }).id;

  const second = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(arthur),
    payload: {
      endpoint: 'https://push.example/endpoint-shared',
      keys: { p256dh: 'p256dh-v2', auth: 'auth-v2' },
    },
  });
  expect(second.statusCode, second.body).toBe(201);
  expect((second.json() as { id: string }).id).toBe(firstId);

  const count = await db.pushSubscription.count({
    where: { endpoint: 'https://push.example/endpoint-shared' },
  });
  expect(count).toBe(1);

  const row = await db.pushSubscription.findUniqueOrThrow({
    where: { endpoint: 'https://push.example/endpoint-shared' },
    select: { p256dh: true, auth: true },
  });
  expect(row).toEqual({ p256dh: 'p256dh-v2', auth: 'auth-v2' });
});

test('rejects a malformed body with 422', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(elke),
    payload: { endpoint: 'https://push.example/malformed' }, // missing `keys`
  });
  expect(response.statusCode).toBe(422);
});

test('a member can delete their own subscription', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(elke),
    payload: {
      endpoint: 'https://push.example/endpoint-to-delete',
      keys: { p256dh: 'p256dh-del', auth: 'auth-del' },
    },
  });
  const { id } = created.json() as { id: string };

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/members/me/push-subscription/${id}`,
    headers: authHeaders(elke),
  });
  expect(deleted.statusCode, deleted.body).toBe(204);

  const row = await db.pushSubscription.findUnique({ where: { id } });
  expect(row).toBeNull();
});

test('a member cannot delete another member\'s subscription (§36)', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/members/me/push-subscription',
    headers: authHeaders(elke),
    payload: {
      endpoint: 'https://push.example/endpoint-owned-by-elke',
      keys: { p256dh: 'p256dh-owned', auth: 'auth-owned' },
    },
  });
  const { id } = created.json() as { id: string };

  // Arthur tries to delete Elke's subscription by id.
  const attempt = await app.inject({
    method: 'DELETE',
    url: `/api/members/me/push-subscription/${id}`,
    headers: authHeaders(arthur),
  });
  expect(attempt.statusCode).toBe(404);

  // Still there, unaffected.
  const row = await db.pushSubscription.findUnique({ where: { id } });
  expect(row).not.toBeNull();
  expect(row?.memberId).toBe(elke.memberId);
});

test('deleting a non-existent subscription id returns 404', async () => {
  const response = await app.inject({
    method: 'DELETE',
    url: '/api/members/me/push-subscription/does-not-exist',
    headers: authHeaders(elke),
  });
  expect(response.statusCode).toBe(404);
});
