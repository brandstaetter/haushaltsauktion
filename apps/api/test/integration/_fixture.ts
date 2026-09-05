/**
 * Shared scaffolding for the HTTP integration suite.
 *
 * These tests need a live Postgres — `docker compose up -d db` plus
 * `npm run db:migrate` before `npm test -w apps/api`.
 *
 * Everything here builds an **isolated** household with `test-…`-prefixed ids.
 * The seed's household is deliberately untouched: a race test that competed
 * with the demo data would be neither reproducible nor safe to run twice.
 * `dropHousehold` is called both before and after a run, in the same idempotent
 * spirit as `prisma/seed.ts`, so a crashed run leaves nothing behind for the
 * next one to trip over.
 */

import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { DEFAULT_CONFIG, parseConfig } from '@haushaltsauktion/shared';

import {
  cryptoRng,
  nullNotifier,
  silentLogger,
  systemClock,
  type Deps,
} from '../../src/app/deps.js';
import { loadEnv, type AppEnv } from '../../src/config.js';
import { hashPassword } from '../../src/infra/auth/password.js';
import { buildServer } from '../../src/infra/http/server.js';

/**
 * The dev/compose database. `DATABASE_URL` wins when it is set (CI, or a
 * developer with a different local port); the fallback is exactly the URL
 * `docker-compose.yml` provisions, so no credentials are hard-coded that the
 * compose file does not already publish as its defaults.
 */
export const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://haushalt:haushalt@localhost:5432/haushaltsauktion';

export const TEST_PASSWORD = 'integration-test-pw';

export interface FixtureMember {
  key: string;
  displayName: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface FixtureIds {
  prefix: string;
  householdId: string;
  categoryId: string;
  configId: string;
  memberId(key: string): string;
  userId(key: string): string;
  email(key: string): string;
  definitionId(key: string): string;
}

export function idsFor(prefix: string): FixtureIds {
  return {
    prefix,
    householdId: `${prefix}household`,
    categoryId: `${prefix}category`,
    configId: `${prefix}config-v1`,
    memberId: (key) => `${prefix}member-${key}`,
    userId: (key) => `${prefix}user-${key}`,
    // `.invalid` is reserved by RFC 2606 and can never be a real address.
    email: (key) => `${key}@${prefix}test.invalid`,
    definitionId: (key) => `${prefix}task-${key}`,
  };
}

/** A dedicated client for fixture setup, teardown and post-hoc DB assertions. */
export function testDb(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
}

/**
 * @param overrides Extra env vars for one test's server — e.g. `{ SETUP_TOKEN:
 *   '…' }` for the registration suite. Omitted entirely by default, so every
 *   existing caller gets exactly the env it always did.
 */
export function testEnv(overrides: Record<string, string> = {}): AppEnv {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL,
    SESSION_SECRET: 'integration-test-session-secret',
    // The cookie must not be `Secure`, or `inject()`'s plain-HTTP request would
    // never send it back.
    COOKIE_SECURE: 'false',
    LOG_LEVEL: 'silent',
    SWEEP_INTERVAL_SECONDS: '0',
    ...overrides,
  });
}

/**
 * The production dependency graph, with only the two seams §7.2 allows a test
 * to move: a silent logger and a null notifier. Clock, RNG, database and every
 * use-case are the real ones — the point of these tests is that the shipped
 * locking code works, so nothing on the write path is substituted.
 */
export function testDeps(db: PrismaClient): Deps {
  return {
    db,
    clock: systemClock,
    rng: cryptoRng,
    logger: silentLogger,
    notifier: nullNotifier,
  };
}

export async function buildTestServer(
  db: PrismaClient,
  envOverrides: Record<string, string> = {},
  /** Lets a test inject hostile ports — see `todoist-isolation.test.ts`. */
  depsOverrides: Partial<Deps> = {},
): Promise<FastifyInstance> {
  return buildServer({
    env: testEnv(envOverrides),
    deps: { ...testDeps(db), ...depsOverrides },
  });
}

/**
 * Delete everything belonging to one test household, in foreign-key order.
 *
 * Not `household.delete()`: the cascade from `households` would race the
 * `Restrict` edges `task_instances → task_definitions` and
 * `household_members → users`, whose order Postgres does not define.
 */
export async function dropHousehold(db: PrismaClient, ids: FixtureIds): Promise<void> {
  const householdId = ids.householdId;
  // Integration rows first: both carry FKs to task_instances and
  // household_members, so they must go before the rows they point at.
  await db.integrationOutbox.deleteMany({ where: { householdId } });
  await db.integrationTaskLink.deleteMany({ where: { householdId } });
  await db.memberIntegration.deleteMany({ where: { householdId } });
  await db.pushOutboxItem.deleteMany({ where: { householdId } });
  await db.notification.deleteMany({ where: { householdId } });
  await db.auditEvent.deleteMany({ where: { householdId } });
  await db.taskHistoryEvent.deleteMany({ where: { householdId } });
  await db.pointTransaction.deleteMany({ where: { householdId } });
  // Virtuelle Gamification-Items: member_effects reference reward_redemptions
  // (Restrict) — must go before them, same reasoning as reward_redemptions
  // before reward_definitions below.
  await db.memberEffect.deleteMany({ where: { householdId } });
  // Punkte-Shop: redemptions must go before their reward definitions
  // (Restrict), and after point_transactions (which reference them, Restrict).
  await db.rewardRedemption.deleteMany({ where: { householdId } });
  await db.rewardDefinition.deleteMany({ where: { householdId } });
  await db.taskAssignment.deleteMany({ where: { householdId } });
  await db.taskInstance.deleteMany({ where: { householdId } });
  await db.taskDefinitionEligibility.deleteMany({ where: { householdId } });
  await db.taskDefinitionPreferredAssignee.deleteMany({ where: { householdId } });
  await db.memberCategoryExclusion.deleteMany({ where: { householdId } });
  await db.memberAbsence.deleteMany({ where: { householdId } });
  await db.taskDefinition.deleteMany({ where: { householdId } });
  await db.taskCategory.deleteMany({ where: { householdId } });
  await db.householdConfiguration.deleteMany({ where: { householdId } });
  await db.householdMember.deleteMany({ where: { householdId } });
  // Sessions cascade from the user rows.
  await db.user.deleteMany({ where: { id: { startsWith: `${ids.prefix}user-` } } });
  await db.household.deleteMany({ where: { id: householdId } });
}

export interface CreateHouseholdOptions {
  members: readonly FixtureMember[];
  /** One definition per entry; the instances are created per test. */
  definitions: readonly { key: string; title: string; baseValue: number }[];
}

/** Household + config v1 + users/members + category + definitions. */
export async function createHousehold(
  db: PrismaClient,
  ids: FixtureIds,
  options: CreateHouseholdOptions,
): Promise<void> {
  await db.household.create({
    data: { id: ids.householdId, name: `Integration ${ids.prefix}`, timezone: 'Europe/Berlin' },
  });

  // Validated through the same schema `PUT /admin/config` uses, so the fixture
  // provably runs against a legal configuration rather than a hand-written blob.
  await db.householdConfiguration.create({
    data: {
      id: ids.configId,
      householdId: ids.householdId,
      version: 1,
      values: parseConfig(DEFAULT_CONFIG) as never,
    },
  });

  // One hash, reused: argon2id is deliberately slow, and hashing it per member
  // would dominate the suite's runtime for no added coverage.
  const passwordHash = await hashPassword(TEST_PASSWORD);

  for (const member of options.members) {
    await db.user.create({
      data: {
        id: ids.userId(member.key),
        email: ids.email(member.key),
        displayName: member.displayName,
        passwordHash,
      },
    });
    await db.householdMember.create({
      data: {
        id: ids.memberId(member.key),
        householdId: ids.householdId,
        userId: ids.userId(member.key),
        displayName: member.displayName,
        role: member.role,
      },
    });
  }

  await db.taskCategory.create({
    data: { id: ids.categoryId, householdId: ids.householdId, name: 'Integration', sortOrder: 1 },
  });

  for (const definition of options.definitions) {
    await db.taskDefinition.create({
      data: {
        id: ids.definitionId(definition.key),
        householdId: ids.householdId,
        title: definition.title,
        categoryId: ids.categoryId,
        baseValue: definition.baseValue,
        estimatedMinutes: 10,
        recurrenceType: 'MANUAL',
      },
    });
  }
}

/** A fresh `AVAILABLE` instance of one definition. */
export async function createAvailableInstance(
  db: PrismaClient,
  ids: FixtureIds,
  definitionKey: string,
  value: number,
): Promise<string> {
  const now = new Date();
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId(definitionKey),
      status: 'AVAILABLE',
      currentValue: value,
      baseValue: value,
      scheduledFor: now,
      publishedAt: now,
      offerExpiresAt: new Date(now.getTime() + 3600_000),
      configVersion: 1,
    },
    select: { id: true },
  });
  return instance.id;
}

export interface Session {
  cookie: string;
  csrfToken: string;
  memberId: string;
}

/** `POST /api/auth/login` through the real route, so the session is a real one. */
export async function login(
  app: FastifyInstance,
  ids: FixtureIds,
  memberKey: string,
): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: ids.email(memberKey), password: TEST_PASSWORD },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login für ${memberKey} fehlgeschlagen: ${response.statusCode} ${response.body}`);
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

export function authHeaders(session: Session): Record<string, string> {
  return { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
}

// ───────────────────────── operator fixtures ─────────────────────────

/** Creates an `OperatorAccount` directly (no HTTP round trip needed to seed one). */
export async function createOperatorAccount(
  db: PrismaClient,
  id: string,
  email: string,
): Promise<void> {
  await db.operatorAccount.create({
    data: { id, email, passwordHash: await hashPassword(TEST_PASSWORD) },
  });
}

export async function dropOperatorAccount(db: PrismaClient, id: string): Promise<void> {
  // OperatorSession cascades from OperatorAccount.
  await db.operatorAccount.deleteMany({ where: { id } });
}

/** `POST /api/operator/login` through the real route — mirrors `login()` above. */
export async function operatorLogin(app: FastifyInstance, email: string): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/operator/login',
    payload: { email, password: TEST_PASSWORD },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Operator-Login für ${email} fehlgeschlagen: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof raw !== 'string') throw new Error('Operator-Login lieferte kein Session-Cookie.');
  const body = response.json() as { csrfToken: string; operator: { id: string } };
  return {
    cookie: raw.split(';')[0] ?? '',
    csrfToken: body.csrfToken,
    memberId: body.operator.id,
  };
}
