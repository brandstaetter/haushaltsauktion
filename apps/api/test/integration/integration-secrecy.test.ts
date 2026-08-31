/**
 * **Phase 6's exit gate: the Todoist token must never appear in an API response.**
 *
 * A personal Todoist token is unscopeable and grants full access to that
 * member's account (§36), so a leak here is not a cosmetic bug. The credential
 * is stored as AES-256-GCM ciphertext and the read projection
 * (`integrationReads.ts`) never selects the token columns — but "never selects"
 * is a property of code that someone can undo with one careless `include`.
 * This suite is what makes that undoing fail loudly.
 *
 * The assertions run against the **raw response body string**, not parsed
 * fields. Checking `body.token === undefined` would only prove the leak is not
 * where you looked; a substring scan catches it wherever it hides — nested in a
 * DTO, echoed in an error message, or serialized into an audit payload.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

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

const ids = idsFor('test-secrecy-');

/** Distinctive enough that a substring scan cannot produce a false negative. */
const TOKEN = 'tdst-SECRETVALUE-0123456789abcdef-DONOTLEAK-a3f9';

const KEY = randomBytes(32);
const secrets = createSecretBox(new Map([[1, KEY]]));

/** Always succeeds: this suite is about what we return, not about Todoist. */
const fakeTodoist: TodoistPort = {
  createTask: async () => ({ ok: true, value: { kind: 'CREATED', externalTaskId: 'ext-1' } }),
  closeTask: async () => ({ ok: true, value: undefined }),
  listProjects: async () => ({
    ok: true,
    value: [
      { id: 'proj-1', name: 'Haushalt' },
      { id: 'proj-2', name: 'Privat' },
    ],
  }),
};

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;

/** Every member-facing route that could conceivably carry the credential. */
async function allResponseBodies(): Promise<{ label: string; body: string }[]> {
  const calls: { label: string; method: 'GET' | 'POST'; url: string }[] = [
    { label: 'GET /integrations/todoist', method: 'GET', url: '/api/integrations/todoist' },
    { label: 'GET projects', method: 'GET', url: '/api/integrations/todoist/projects' },
    { label: 'POST test', method: 'POST', url: '/api/integrations/todoist/test' },
    { label: 'GET /config/public', method: 'GET', url: '/api/config/public' },
    { label: 'GET /members/me', method: 'GET', url: '/api/members/me' },
    { label: 'GET /notifications', method: 'GET', url: '/api/notifications' },
    { label: 'GET /history', method: 'GET', url: '/api/history' },
  ];
  const out: { label: string; body: string }[] = [];
  for (const call of calls) {
    const res = await app.inject({ method: call.method, url: call.url, headers: authHeaders(elke) });
    out.push({ label: `${call.label} (${res.statusCode})`, body: res.body });
  }
  return out;
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [{ key: 'elke', displayName: 'Elke', role: 'ADMIN' }],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: 6 }],
  });

  // The household switch must be on, or connecting is refused by design.
  const config = await db.householdConfiguration.findFirstOrThrow({
    where: { householdId: ids.householdId },
    orderBy: { version: 'desc' },
    select: { id: true, values: true },
  });
  const values = config.values as Record<string, unknown>;
  await db.householdConfiguration.update({
    where: { id: config.id },
    data: { values: { ...values, integrations: { todoist: { enabled: true } } } as never },
  });

  app = await buildTestServer(db, {}, { todoist: fakeTodoist, secrets });
  elke = await login(app, ids, 'elke');
});

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
});

test('connecting stores ciphertext, never the plaintext token', async () => {
  const connected = await app.inject({
    method: 'PUT',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { token: TOKEN },
  });
  expect(connected.statusCode, connected.body).toBe(200);

  // The PUT's own response is the first place a leak would show.
  expect(connected.body).not.toContain(TOKEN);
  expect(connected.json()).toMatchObject({ connected: true, status: 'ACTIVE', tokenHint: 'a3f9' });

  const row = await db.memberIntegration.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
    select: {
      tokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
      tokenKeyVersion: true,
      tokenHint: true,
    },
  });

  // Not vacuous: something really was stored, and it really is encrypted.
  expect(row.tokenCiphertext).not.toBeNull();
  expect(row.tokenKeyVersion).toBe(1);
  expect(Buffer.from(row.tokenCiphertext!).toString('utf8')).not.toContain(TOKEN);
  expect(Buffer.from(row.tokenCiphertext!).toString('base64')).not.toContain(TOKEN);

  // …and it round-trips, so the ciphertext is the token and not junk.
  expect(
    secrets.open({
      ciphertext: row.tokenCiphertext!,
      iv: row.tokenIv!,
      authTag: row.tokenAuthTag!,
      keyVersion: row.tokenKeyVersion!,
    }),
  ).toBe(TOKEN);

  // The hint is a display affordance, not a partial credential.
  expect(row.tokenHint).toBe('a3f9');
  expect(row.tokenHint!.length).toBe(4);
});

test('no member-facing route echoes the token, its ciphertext, or its key material', async () => {
  const row = await db.memberIntegration.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
    select: { tokenCiphertext: true, tokenIv: true, tokenAuthTag: true },
  });
  const cipherB64 = Buffer.from(row.tokenCiphertext!).toString('base64');
  const cipherHex = Buffer.from(row.tokenCiphertext!).toString('hex');
  const ivB64 = Buffer.from(row.tokenIv!).toString('base64');
  const tagB64 = Buffer.from(row.tokenAuthTag!).toString('base64');
  const keyB64 = KEY.toString('base64');

  const forbidden: [string, string][] = [
    ['plaintext token', TOKEN],
    ['ciphertext (base64)', cipherB64],
    ['ciphertext (hex)', cipherHex],
    ['iv', ivB64],
    ['auth tag', tagB64],
    ['encryption key', keyB64],
  ];

  for (const { label, body } of await allResponseBodies()) {
    for (const [what, needle] of forbidden) {
      expect(body, `${label} leaked the ${what}`).not.toContain(needle);
    }
  }
});

test('the audit trail records the connection without recording the credential', async () => {
  // Audit payloads are a classic leak path: they are written by hand, they are
  // rarely reviewed, and they are readable by an admin.
  const events = await db.auditEvent.findMany({
    where: { householdId: ids.householdId, entityType: 'MemberIntegration' },
    select: { action: true, payload: true },
  });
  expect(events.length).toBeGreaterThan(0);

  const serialized = JSON.stringify(events);
  expect(serialized).not.toContain(TOKEN);
  // Not even the hint: an audit row is not a place that needs it.
  expect(serialized).not.toContain('a3f9');
});

test('settings changes and disconnect keep the token out of their responses', async () => {
  const patched = await app.inject({
    method: 'PATCH',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { projectId: 'proj-1', triggers: { VOLUNTARY: true, RANDOM: false } },
  });
  expect(patched.statusCode, patched.body).toBe(200);
  expect(patched.body).not.toContain(TOKEN);
  expect(patched.json().triggers).toEqual({ VOLUNTARY: true, RANDOM: false });

  const disconnected = await app.inject({
    method: 'DELETE',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
  });
  expect(disconnected.statusCode, disconnected.body).toBe(200);
  expect(disconnected.body).not.toContain(TOKEN);
  expect(disconnected.json()).toMatchObject({ connected: false, tokenHint: null });

  // Disconnect scrubs rather than deletes: the row survives so foreign keys
  // stay valid, but every piece of key material is gone.
  const row = await db.memberIntegration.findFirstOrThrow({
    where: { householdId: ids.householdId, memberId: ids.memberId('elke') },
    select: {
      status: true,
      tokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
      tokenKeyVersion: true,
      tokenHint: true,
    },
  });
  expect(row).toEqual({
    status: 'DISABLED',
    tokenCiphertext: null,
    tokenIv: null,
    tokenAuthTag: null,
    tokenKeyVersion: null,
    tokenHint: null,
  });
});

test('a PATCH with lowercase trigger keys is rejected, not silently ignored', async () => {
  // The key-case bug that once made the whole feature inert: lowercase keys
  // read as `undefined` downstream, so nothing would ever be desired. A 422 is
  // far better than a feature that quietly does nothing.
  await app.inject({
    method: 'PUT',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { token: TOKEN },
  });

  const bad = await app.inject({
    method: 'PATCH',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { triggers: { voluntary: true, random: true } },
  });
  expect(bad.statusCode).toBe(422);
  expect(bad.body).not.toContain(TOKEN);
});
