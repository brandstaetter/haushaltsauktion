/**
 * The household switch (`integrations.todoist.enabled`) and the server's own
 * integration ports (`Deps.todoist` / `Deps.secrets`, gated on
 * `INTEGRATION_ENCRYPTION_KEY` in `main.ts`) are independent knobs. Without a
 * guard at config-write time, an admin can flip the switch on in a deployment
 * that never had the key configured — the write "succeeds", `GET
 * /admin/config` and the Account page both look normal, and every member's
 * connect attempt then fails with `INTEGRATION_DISABLED` with nothing at save
 * time telling the admin why.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { HouseholdConfig } from '@haushaltsauktion/shared';
import type { TodoistPort } from '../../src/app/integrations/ports.js';
import { createSecretBox } from '../../src/infra/integrations/secret-box.js';
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

const fakeTodoist: TodoistPort = {
  createTask: async () => ({ ok: true, value: { kind: 'CREATED', externalTaskId: 'ext-1' } }),
  closeTask: async () => ({ ok: true, value: undefined }),
  listProjects: async () => ({ ok: true, value: [] }),
};
const secrets = createSecretBox(new Map([[1, randomBytes(32)]]));

async function enableTodoist(app: FastifyInstance, session: Session) {
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
        integrations: { todoist: { enabled: true } },
      },
    },
  });
}

describe('a server with no integration ports configured', () => {
  const ids = idsFor('test-todoistavail-none-');
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
    // No `todoist`/`secrets` override — the default testDeps() has neither,
    // mirroring a production server with INTEGRATION_ENCRYPTION_KEY unset.
    app = await buildTestServer(db);
    elke = await login(app, ids, 'elke');
  });

  afterAll(async () => {
    await app?.close();
    await dropHousehold(db, ids);
    await db?.$disconnect();
  });

  test('GET /admin/config reports the integration as unavailable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().integrationsAvailable).toEqual({ todoist: false });
  });

  test('PUT /admin/config rejects turning the household switch on', async () => {
    const res = await enableTodoist(app, elke);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INTEGRATION_NOT_CONFIGURED');

    // The rejection must be real, not cosmetic: no new config version exists,
    // so a member's own connect attempt still sees the switch off.
    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(after.json().version).toBe(1);
    expect((after.json().values as HouseholdConfig).integrations.todoist.enabled).toBe(false);
  });
});

describe('a server with integration ports configured', () => {
  const ids = idsFor('test-todoistavail-some-');
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
    app = await buildTestServer(db, {}, { todoist: fakeTodoist, secrets });
    elke = await login(app, ids, 'elke');
  });

  afterAll(async () => {
    await app?.close();
    await dropHousehold(db, ids);
    await db?.$disconnect();
  });

  test('GET /admin/config reports the integration as available', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    expect(res.json().integrationsAvailable).toEqual({ todoist: true });
  });

  test('PUT /admin/config allows turning the household switch on', async () => {
    const res = await enableTodoist(app, elke);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().version).toBe(2);
    expect((res.json().values as HouseholdConfig).integrations.todoist.enabled).toBe(true);
  });
});
