/**
 * The household switch (`notifications.pushEnabled`) and the server's own
 * push port (`Deps.push`, gated on `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` in
 * `main.ts`) are independent knobs. Without a guard at config-write time, an
 * admin can flip the switch on in a deployment that never had VAPID keys
 * configured — the write "succeeds", `GET /admin/config` and the Account
 * page both look normal, and no push ever arrives with nothing at save time
 * telling the admin why.
 *
 * Mirrors `todoist-config-availability.test.ts`'s structure exactly.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { HouseholdConfig } from '@haushaltsauktion/shared';
import type { PushSender } from '../../src/app/integrations/ports.js';
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

const fakePush: PushSender = {
  send: async () => ({ ok: true }),
};

async function enablePush(app: FastifyInstance, session: Session) {
  const current = await app.inject({
    method: 'GET',
    url: '/api/admin/config',
    headers: authHeaders(session),
  });
  const body = current.json() as { version: number; values: HouseholdConfig };
  return app.inject({
    method: 'PUT',
    url: '/api/admin/config',
    headers: authHeaders(session),
    payload: {
      expectedVersion: body.version,
      values: {
        ...body.values,
        notifications: { ...body.values.notifications, pushEnabled: true },
      },
    },
  });
}

describe('a server with no push port configured', () => {
  const ids = idsFor('test-pushavail-none-');
  let db: PrismaClient;
  let app: FastifyInstance;
  let elke: Session;

  beforeAll(async () => {
    db = testDb();
    await dropHousehold(db, ids);
    await createHousehold(db, ids, {
      members: [{ key: 'elke', displayName: 'Elke', role: 'ADMIN' }],
      definitions: [],
    });
    // No `push` override — the default testDeps() has none, mirroring a
    // production server with VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY unset.
    app = await buildTestServer(db);
    elke = await login(app, ids, 'elke');
  });

  afterAll(async () => {
    await app?.close();
    await dropHousehold(db, ids);
    await db?.$disconnect();
  });

  test('GET /admin/config reports push as unavailable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notificationsAvailable).toEqual({ push: false });
  });

  test('PUT /admin/config rejects turning the household switch on', async () => {
    const res = await enablePush(app, elke);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PUSH_NOT_CONFIGURED');

    // The rejection must be real, not cosmetic: no new config version
    // exists, so the switch stays off.
    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(after.json().version).toBe(1);
    expect((after.json().values as HouseholdConfig).notifications.pushEnabled).toBe(false);
  });
});

describe('a server with the push port configured', () => {
  const ids = idsFor('test-pushavail-some-');
  let db: PrismaClient;
  let app: FastifyInstance;
  let elke: Session;

  beforeAll(async () => {
    db = testDb();
    await dropHousehold(db, ids);
    await createHousehold(db, ids, {
      members: [{ key: 'elke', displayName: 'Elke', role: 'ADMIN' }],
      definitions: [],
    });
    app = await buildTestServer(db, {}, { push: fakePush });
    elke = await login(app, ids, 'elke');
  });

  afterAll(async () => {
    await app?.close();
    await dropHousehold(db, ids);
    await db?.$disconnect();
  });

  test('GET /admin/config reports push as available', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(res.json().notificationsAvailable).toEqual({ push: true });
  });

  test('PUT /admin/config allows turning the household switch on', async () => {
    const res = await enablePush(app, elke);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().version).toBe(2);
    expect((res.json().values as HouseholdConfig).notifications.pushEnabled).toBe(true);
  });
});
