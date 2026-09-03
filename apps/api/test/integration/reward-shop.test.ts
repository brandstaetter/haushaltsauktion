/**
 * Punkte-Shop (intake "points-shop-real-life-rewards"), over real HTTP
 * against a real Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * Covers the acceptance criteria: catalog CRUD, purchase debits through the
 * ledger with a new `PointTransactionType`, insufficient-balance rejection,
 * the admin fulfillment queue, and the fulfillment race (CLAUDE.md §35 —
 * "genau einer darf erfolgreich sein", the same class of race as the
 * volunteer-race case).
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { verifyLedgerIntegrity } from '../../src/app/points/verifyLedgerIntegrity.js';
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

const ids = idsFor('test-reward-shop-');

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session; // ADMIN
let paul: Session; // MEMBER
let maria: Session; // MEMBER

async function balanceOf(session: Session): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/members/me/points',
    headers: { cookie: session.cookie },
  });
  return (response.json() as { balance: number }).balance;
}

async function grantPoints(memberId: string, amount: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/members/${memberId}/points/adjust`,
    headers: authHeaders(elke),
    payload: { amount, reason: 'Test-Zuschuss' },
  });
  expect(res.statusCode).toBe(200);
}

async function createReward(
  body: { title: string; description?: string | null; cost: number; isActive?: boolean },
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/rewards',
    headers: authHeaders(elke),
    payload: {
      title: body.title,
      description: body.description ?? null,
      cost: body.cost,
      isActive: body.isActive ?? true,
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
}, 60_000);

afterAll(async () => {
  const integrity = await verifyLedgerIntegrity(db, { householdId: ids.householdId });
  expect(integrity.ok).toBe(true);

  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'catalog CRUD: admin creates a reward, an inactive one never reaches the member shop',
  async () => {
    const activeId = await createReward({ title: 'Filmabend aussuchen', cost: 5 });
    const inactiveId = await createReward({
      title: 'Ausschlafen am Samstag',
      cost: 8,
      isActive: false,
    });

    const adminList = await app.inject({
      method: 'GET',
      url: '/api/admin/rewards',
      headers: authHeaders(elke),
    });
    expect(adminList.statusCode).toBe(200);
    const adminItems = (adminList.json() as { items: { id: string }[] }).items;
    expect(adminItems.map((i) => i.id)).toEqual(expect.arrayContaining([activeId, inactiveId]));

    const shop = await app.inject({
      method: 'GET',
      url: '/api/rewards',
      headers: { cookie: paul.cookie },
    });
    expect(shop.statusCode).toBe(200);
    const shopItems = (shop.json() as { items: { id: string; cost: number }[] }).items;
    expect(shopItems.map((i) => i.id)).toContain(activeId);
    expect(shopItems.map((i) => i.id)).not.toContain(inactiveId);
  },
  30_000,
);

test(
  'purchase with sufficient points succeeds and the ledger balance matches',
  async () => {
    const rewardId = await createReward({ title: 'Filmabend aussuchen', cost: 6 });
    await grantPoints(paul.memberId, 10);
    expect(await balanceOf(paul)).toBe(10);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/purchase`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { redemptionId: string; cost: number; balanceAfter: number };
    expect(body.cost).toBe(6);
    expect(body.balanceAfter).toBe(4);
    expect(await balanceOf(paul)).toBe(4);

    const tx = await db.pointTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `reward-redemption:${body.redemptionId}` },
      select: { type: true, amount: true, rewardRedemptionId: true },
    });
    expect(tx.type).toBe('REWARD_REDEMPTION');
    expect(tx.amount).toBe(-6);
    expect(tx.rewardRedemptionId).toBe(body.redemptionId);

    const redemption = await db.rewardRedemption.findUniqueOrThrow({
      where: { id: body.redemptionId },
      select: { status: true, costAtPurchase: true, memberId: true },
    });
    expect(redemption.status).toBe('PENDING');
    expect(redemption.costAtPurchase).toBe(6);
    expect(redemption.memberId).toBe(paul.memberId);
  },
  30_000,
);

test(
  'purchase with insufficient points is rejected per the configured negative-balance rule',
  async () => {
    const rewardId = await createReward({ title: 'Teures Extra', cost: 50 });
    const before = await balanceOf(maria);
    expect(before).toBeLessThan(50);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/purchase`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_POINTS');
    expect(await balanceOf(maria)).toBe(before);
  },
  30_000,
);

test(
  'the admin fulfillment queue lists pending redemptions and a fulfill action clears it for everyone',
  async () => {
    const rewardId = await createReward({ title: 'Küche fegen lassen', cost: 3 });
    await grantPoints(paul.memberId, 3);
    const purchase = await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/purchase`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(purchase.statusCode).toBe(200);
    const redemptionId = (purchase.json() as { redemptionId: string }).redemptionId;

    const pendingBefore = await app.inject({
      method: 'GET',
      url: '/api/admin/rewards/redemptions?status=PENDING',
      headers: authHeaders(elke),
    });
    expect(pendingBefore.statusCode).toBe(200);
    const pendingIds = (pendingBefore.json() as { items: { id: string }[] }).items.map((i) => i.id);
    expect(pendingIds).toContain(redemptionId);

    const fulfilled = await app.inject({
      method: 'POST',
      url: `/api/admin/rewards/redemptions/${redemptionId}/fulfill`,
      headers: authHeaders(elke),
    });
    expect(fulfilled.statusCode).toBe(200);
    expect((fulfilled.json() as { status: string }).status).toBe('FULFILLED');

    const pendingAfter = await app.inject({
      method: 'GET',
      url: '/api/admin/rewards/redemptions?status=PENDING',
      headers: authHeaders(elke),
    });
    const idsAfter = (pendingAfter.json() as { items: { id: string }[] }).items.map((i) => i.id);
    expect(idsAfter).not.toContain(redemptionId);
  },
  30_000,
);

test(
  'two concurrent fulfillments of the same redemption resolve to exactly one FULFILLED transition',
  async () => {
    const rewardId = await createReward({ title: 'Doppel-Fulfill-Test', cost: 2 });
    await grantPoints(maria.memberId, 2);
    const purchase = await app.inject({
      method: 'POST',
      url: `/api/rewards/${rewardId}/purchase`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(purchase.statusCode).toBe(200);
    const redemptionId = (purchase.json() as { redemptionId: string }).redemptionId;

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/admin/rewards/redemptions/${redemptionId}/fulfill`,
        headers: authHeaders(elke),
      }),
      app.inject({
        method: 'POST',
        url: `/api/admin/rewards/redemptions/${redemptionId}/fulfill`,
        headers: authHeaders(elke),
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    // The loser's error detail must reflect what actually closed the
    // redemption, not a stale read from before the race — a naive
    // `existing.status` captured before the guarded `updateMany` would report
    // the PENDING it started from instead of the FULFILLED the winner produced.
    const loser = first.statusCode === 409 ? first : second;
    expect((loser.json() as { error: { details: { currentStatus: string } } }).error.details.currentStatus).toBe(
      'FULFILLED',
    );

    const row = await db.rewardRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
      select: { status: true },
    });
    expect(row.status).toBe('FULFILLED');
  },
  30_000,
);

test(
  'the shop switch: browsing and purchasing while rewards.enabled is false are both rejected',
  async () => {
    const rewardId = await createReward({ title: 'Ausgeschalteter Shop', cost: 1 });
    await grantPoints(paul.memberId, 5);

    const current = await app.inject({
      method: 'GET',
      url: '/api/admin/config',
      headers: authHeaders(elke),
    });
    const body = current.json() as { version: number; values: Record<string, unknown> };
    const disabled = await app.inject({
      method: 'PUT',
      url: '/api/admin/config',
      headers: authHeaders(elke),
      payload: {
        expectedVersion: body.version,
        values: { ...body.values, rewards: { ...(body.values['rewards'] as object), enabled: false } },
      },
    });
    expect(disabled.statusCode).toBe(200);

    try {
      // The list route is the browse half of the same switch, not just the
      // buy half — a disabled shop must not leak its catalog either.
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/rewards',
        headers: { cookie: paul.cookie },
      });
      expect(listRes.statusCode).toBe(403);
      expect((listRes.json() as { error: { code: string } }).error.code).toBe('REWARDS_DISABLED');

      const res = await app.inject({
        method: 'POST',
        url: `/api/rewards/${rewardId}/purchase`,
        headers: authHeaders(paul),
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect((res.json() as { error: { code: string } }).error.code).toBe('REWARDS_DISABLED');
    } finally {
      const latest = await app.inject({
        method: 'GET',
        url: '/api/admin/config',
        headers: authHeaders(elke),
      });
      const latestBody = latest.json() as { version: number; values: Record<string, unknown> };
      await app.inject({
        method: 'PUT',
        url: '/api/admin/config',
        headers: authHeaders(elke),
        payload: {
          expectedVersion: latestBody.version,
          values: {
            ...latestBody.values,
            rewards: { ...(latestBody.values['rewards'] as object), enabled: true },
          },
        },
      });
    }
  },
  30_000,
);
