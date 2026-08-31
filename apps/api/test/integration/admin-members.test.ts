/**
 * `POST /api/admin/members` and `POST /api/admin/members/:id/reset-password`.
 *
 * Requires a live Postgres, same as the rest of `test/integration/` —
 * `docker compose up -d db && npm run db:migrate`.
 *
 * Regression coverage for two bugs reported together: creating a member with
 * no password silently generated one that was never shown anywhere, and there
 * was no way for an admin to give an existing member a new password at all.
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

const ids = idsFor('test-adminmembers-');

/** Like `login()` from the fixture, but for an email/password not tied to a fixture member key. */
async function loginWithCredentials(
  server: FastifyInstance,
  email: string,
  password: string,
): Promise<Session> {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login für ${email} fehlgeschlagen: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof raw !== 'string') throw new Error('Login lieferte kein Session-Cookie.');
  const body = response.json() as { csrfToken: string; member: { id: string } };
  return {
    cookie: raw.split(';')[0] ?? '',
    csrfToken: body.csrfToken,
    memberId: body.member.id,
  };
}

let db: PrismaClient;
let app: FastifyInstance;
let admin: Session;
let bob: Session;

let emailCounter = 0;
function uniqueEmail(): string {
  emailCounter += 1;
  return `admin-members-${Date.now()}-${emailCounter}@${ids.prefix}test.invalid`;
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'admin', displayName: 'Admin', role: 'ADMIN' },
      { key: 'bob', displayName: 'Bob', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  admin = await login(app, ids, 'admin');
  bob = await login(app, ids, 'bob');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test('creating a member with no password returns a working temporary password', async () => {
  const email = uniqueEmail();
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/members',
    headers: authHeaders(admin),
    payload: { email, displayName: 'Neu Ohne Passwort', role: 'MEMBER' },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string; temporaryPassword: string | null };
  expect(typeof body.temporaryPassword).toBe('string');
  expect(body.temporaryPassword!.length).toBeGreaterThanOrEqual(8);

  // The audit trail records the creation but never the plaintext password.
  const auditEvents = await db.auditEvent.findMany({
    where: { householdId: ids.householdId, action: 'MEMBER_CREATED', entityId: body.id },
  });
  expect(auditEvents).toHaveLength(1);
  expect(JSON.stringify(auditEvents[0]!.payload)).not.toContain(body.temporaryPassword);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: body.temporaryPassword },
  });
  expect(loginResponse.statusCode).toBe(200);
});

test('creating a member with an explicit password does not surface a temporary one', async () => {
  const email = uniqueEmail();
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/members',
    headers: authHeaders(admin),
    payload: {
      email,
      displayName: 'Neu Mit Passwort',
      password: 'a-chosen-password',
      role: 'MEMBER',
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string; temporaryPassword: string | null };
  expect(body.temporaryPassword).toBeNull();

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'a-chosen-password' },
  });
  expect(loginResponse.statusCode).toBe(200);
});

test('a non-admin cannot create members', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/members',
    headers: authHeaders(bob),
    payload: { email: uniqueEmail(), displayName: 'Sollte Nicht Existieren', role: 'MEMBER' },
  });
  expect(response.statusCode).toBe(403);
});

// These two tests each make 2-3 `/auth/login` calls for one email, which is
// safely under that route's own 5-per-5-minutes budget — but that budget is a
// single in-memory bucket for the life of one Fastify instance, and the tests
// above already spent some of it during this file's run (same rationale as
// register.test.ts). A dedicated instance keeps each test's login accounting
// independent of run order and of how many tests precede it.
test('admin resets a member password: old password and old sessions stop working, new password logs in', async () => {
  const freshApp = await buildTestServer(db);
  await freshApp.ready();
  try {
    const email = uniqueEmail();
    const created = await freshApp.inject({
      method: 'POST',
      url: '/api/admin/members',
      headers: authHeaders(admin),
      payload: { email, displayName: 'Wird Zurückgesetzt', password: 'original-password', role: 'MEMBER' },
    });
    expect(created.statusCode).toBe(201);
    const { id: memberId } = created.json() as { id: string };

    const oldSession = await loginWithCredentials(freshApp, email, 'original-password');
    const stillWorking = await freshApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: oldSession.cookie },
    });
    expect(stillWorking.statusCode).toBe(200);

    const reset = await freshApp.inject({
      method: 'POST',
      url: `/api/admin/members/${memberId}/reset-password`,
      headers: authHeaders(admin),
      payload: {},
    });
    expect(reset.statusCode).toBe(200);
    const resetBody = reset.json() as { id: string; temporaryPassword: string };
    expect(resetBody.id).toBe(memberId);
    expect(resetBody.temporaryPassword.length).toBeGreaterThanOrEqual(8);

    // The audit trail records the reset but never the plaintext password.
    const auditEvents = await db.auditEvent.findMany({
      where: { householdId: ids.householdId, action: 'PASSWORD_RESET', entityId: memberId },
    });
    expect(auditEvents).toHaveLength(1);
    expect(JSON.stringify(auditEvents[0]!.payload)).not.toContain(resetBody.temporaryPassword);

    // Old password no longer authenticates.
    const oldPasswordLogin = await freshApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'original-password' },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    // The session issued under the old password is dead too.
    const revoked = await freshApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: oldSession.cookie },
    });
    expect(revoked.statusCode).toBe(401);

    // The new, generated password works.
    const newPasswordLogin = await freshApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: resetBody.temporaryPassword },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
  } finally {
    await freshApp.close();
  }
});

test('admin can set a specific new password on reset, instead of generating one', async () => {
  const freshApp = await buildTestServer(db);
  await freshApp.ready();
  try {
    const email = uniqueEmail();
    const created = await freshApp.inject({
      method: 'POST',
      url: '/api/admin/members',
      headers: authHeaders(admin),
      payload: { email, displayName: 'Explizit Zurückgesetzt', password: 'original-password-2', role: 'MEMBER' },
    });
    const { id: memberId } = created.json() as { id: string };

    const reset = await freshApp.inject({
      method: 'POST',
      url: `/api/admin/members/${memberId}/reset-password`,
      headers: authHeaders(admin),
      payload: { password: 'admin-chosen-new-password' },
    });
    expect(reset.statusCode).toBe(200);
    const resetBody = reset.json() as { id: string; temporaryPassword: string };
    expect(resetBody.temporaryPassword).toBe('admin-chosen-new-password');

    const loginResponse = await freshApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'admin-chosen-new-password' },
    });
    expect(loginResponse.statusCode).toBe(200);
  } finally {
    await freshApp.close();
  }
});

test('a non-admin cannot reset another member\'s password', async () => {
  const email = uniqueEmail();
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/members',
    headers: authHeaders(admin),
    payload: { email, displayName: 'Geschützt', password: 'some-password-123', role: 'MEMBER' },
  });
  const { id: memberId } = created.json() as { id: string };

  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/members/${memberId}/reset-password`,
    headers: authHeaders(bob),
    payload: {},
  });
  expect(response.statusCode).toBe(403);
});

test('resetting a password for a member of another household is a 404, not a leak', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/members/does-not-belong-to-this-household/reset-password',
    headers: authHeaders(admin),
    payload: {},
  });
  expect(response.statusCode).toBe(404);
});
