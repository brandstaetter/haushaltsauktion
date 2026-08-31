/**
 * `POST /api/register` — household self-onboarding (Architektur "Admin
 * Onboarding" Phase 1).
 *
 * Requires a live Postgres, same as the rest of `test/integration/` —
 * `docker compose up -d db && npm run db:migrate`.
 *
 * Each test that needs the route enabled builds its **own** Fastify instance
 * with a fixed `SETUP_TOKEN`, so the route's per-IP rate limiter (an
 * in-memory store scoped to the Fastify instance) never accumulates state
 * across unrelated tests — the rate-limit test in particular depends on
 * starting from an empty bucket.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildTestServer, testDb } from './_fixture.js';

const SETUP_TOKEN = 'integration-test-setup-token-000001';
const WRONG_TOKEN = 'integration-test-setup-token-WRONG01';

let db: PrismaClient;
const createdHouseholdIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(() => {
  db = testDb();
});

afterAll(async () => {
  // FK-safe order: AuditEvent has no cascade to Household, HouseholdMember/
  // HouseholdConfiguration cascade from Household, Session cascades from User
  // — but HouseholdMember.user is `onDelete: Restrict`, so Household (and
  // its members) must go before the Users they point at.
  if (createdHouseholdIds.length > 0) {
    await db.auditEvent.deleteMany({ where: { householdId: { in: createdHouseholdIds } } });
    await db.household.deleteMany({ where: { id: { in: createdHouseholdIds } } });
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await db.$disconnect();
}, 60_000);

let emailCounter = 0;
function uniqueEmail(): string {
  emailCounter += 1;
  return `register-${Date.now()}-${emailCounter}@register-test.invalid`;
}

async function buildApp(setupToken?: string): Promise<FastifyInstance> {
  const app = await buildTestServer(
    db,
    setupToken === undefined ? {} : { SETUP_TOKEN: setupToken },
  );
  await app.ready();
  return app;
}

async function householdAndUserCount(householdName: string, email: string) {
  const [households, users] = await Promise.all([
    db.household.count({ where: { name: householdName } }),
    db.user.count({ where: { email } }),
  ]);
  return { households, users };
}

describe('POST /api/register', () => {
  test('SETUP_TOKEN unset → 404 (the route genuinely does not exist)', async () => {
    const app = await buildApp(undefined);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: {
          setupToken: 'anything',
          householdName: 'Should Not Exist',
          adminEmail: uniqueEmail(),
          adminDisplayName: 'Nobody',
          adminPassword: 'irrelevant-pw',
        },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test(
    'correct token + new email → creates Household+Config(v1)+User+Member(ADMIN), ' +
      'sets a session cookie, and audits HOUSEHOLD_REGISTERED without the raw token',
    async () => {
      const app = await buildApp(SETUP_TOKEN);
      try {
        const email = uniqueEmail();
        const householdName = `Register Happy Path ${Date.now()}`;

        const response = await app.inject({
          method: 'POST',
          url: '/api/register',
          payload: {
            setupToken: SETUP_TOKEN,
            householdName,
            adminEmail: email,
            adminDisplayName: 'Founding Admin',
            adminPassword: 'a-strong-password',
          },
        });

        expect([200, 201]).toContain(response.statusCode);
        const body = response.json() as {
          user: { id: string; email: string; displayName: string };
          member: { id: string; role: string };
          household: { id: string; name: string };
          csrfToken: string;
        };
        expect(body.user.email).toBe(email);
        expect(body.member.role).toBe('ADMIN');
        expect(body.household.name).toBe(householdName);
        expect(typeof body.csrfToken).toBe('string');
        expect(body.csrfToken.length).toBeGreaterThan(0);

        createdHouseholdIds.push(body.household.id);
        createdUserIds.push(body.user.id);

        const setCookie = response.headers['set-cookie'];
        const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
        expect(typeof raw).toBe('string');
        expect(raw).toContain('hh_session=');

        // ── all four rows exist ──────────────────────────────────────────
        const household = await db.household.findUnique({ where: { id: body.household.id } });
        expect(household).not.toBeNull();

        const config = await db.householdConfiguration.findFirst({
          where: { householdId: body.household.id, version: 1 },
        });
        expect(config).not.toBeNull();

        const user = await db.user.findUnique({ where: { id: body.user.id } });
        expect(user).not.toBeNull();
        expect(user?.email).toBe(email);

        const member = await db.householdMember.findFirst({
          where: { householdId: body.household.id, userId: body.user.id },
        });
        expect(member).not.toBeNull();
        expect(member?.role).toBe('ADMIN');

        // ── exactly one audit event, and it never carries the raw token ──
        const auditEvents = await db.auditEvent.findMany({
          where: { householdId: body.household.id, action: 'HOUSEHOLD_REGISTERED' },
        });
        expect(auditEvents).toHaveLength(1);
        expect(auditEvents[0]!.entityId).toBe(body.household.id);
        expect(auditEvents[0]!.entityType).toBe('Household');
        const payloadJson = JSON.stringify(auditEvents[0]!.payload);
        expect(payloadJson).not.toContain(SETUP_TOKEN);

        // ── the session actually works ────────────────────────────────────
        const me = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: (raw as string).split(';')[0]! },
        });
        expect(me.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    },
  );

  test('wrong token → 403, zero new rows', async () => {
    const app = await buildApp(SETUP_TOKEN);
    try {
      const email = uniqueEmail();
      const householdName = `Register Wrong Token ${Date.now()}`;
      const before = await householdAndUserCount(householdName, email);

      const response = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: {
          setupToken: WRONG_TOKEN,
          householdName,
          adminEmail: email,
          adminDisplayName: 'Should Not Be Created',
          adminPassword: 'a-strong-password',
        },
      });

      expect(response.statusCode).toBe(403);
      const after = await householdAndUserCount(householdName, email);
      expect(after.households).toBe(before.households);
      expect(after.users).toBe(before.users);
    } finally {
      await app.close();
    }
  });

  test('duplicate email → same conflict shape as POST /admin/members', async () => {
    const app = await buildApp(SETUP_TOKEN);
    try {
      const email = uniqueEmail();

      const first = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: {
          setupToken: SETUP_TOKEN,
          householdName: `Register Dup 1 ${Date.now()}`,
          adminEmail: email,
          adminDisplayName: 'First',
          adminPassword: 'a-strong-password',
        },
      });
      expect([200, 201]).toContain(first.statusCode);
      const firstBody = first.json() as { household: { id: string }; user: { id: string } };
      createdHouseholdIds.push(firstBody.household.id);
      createdUserIds.push(firstBody.user.id);

      const second = await app.inject({
        method: 'POST',
        url: '/api/register',
        payload: {
          setupToken: SETUP_TOKEN,
          householdName: `Register Dup 2 ${Date.now()}`,
          adminEmail: email,
          adminDisplayName: 'Second',
          adminPassword: 'a-strong-password',
        },
      });
      expect(second.statusCode).toBe(409);
      const secondBody = second.json() as { error: { code: string } };
      expect(secondBody.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    } finally {
      await app.close();
    }
  });

  test('rate limit trips at the 6th request within 5 minutes from one IP', async () => {
    const app = await buildApp(SETUP_TOKEN);
    try {
      const attempt = () =>
        app.inject({
          method: 'POST',
          url: '/api/register',
          payload: {
            setupToken: WRONG_TOKEN,
            householdName: 'Rate Limit Probe',
            adminEmail: uniqueEmail(),
            adminDisplayName: 'Probe',
            adminPassword: 'a-strong-password',
          },
        });

      for (let i = 0; i < 5; i++) {
        const response = await attempt();
        expect(response.statusCode).toBe(403);
      }
      const sixth = await attempt();
      expect(sixth.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});
