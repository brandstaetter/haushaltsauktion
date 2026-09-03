/**
 * Virtuelle Gamification-Items (intake "points-shop-virtual-gamification-items"),
 * über echtes HTTP gegen ein echtes Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * Mirrors `streak.test.ts`'s seam: a controllable `FakeClock` (the only `Deps`
 * override) drives purchases, sweeps and completions across an effect's
 * window, so "excluded during the window, not after" and "exactly N charges,
 * not N+1" are checked against the real `runAssignmentSweep` / `completeTask`
 * paths and the real `member_effects` row, not a mock of either.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';
import type { Clock, Deps } from '../../src/app/deps.js';
import { verifyLedgerIntegrity } from '../../src/app/points/verifyLedgerIntegrity.js';
import {
  authHeaders,
  buildTestServer,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  testDeps,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-virtual-effects-');

const BASE_VALUE = 4;

/** A controllable `Clock` — the only seam this file moves (§7.2). */
class FakeClock implements Clock {
  private current: Date;
  constructor(start: Date) {
    this.current = start;
  }
  now(): Date {
    return this.current;
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

let db: PrismaClient;
let app: FastifyInstance;
let clock: FakeClock;
let sweepDeps: Deps;
let elke: Session; // ADMIN
let paul: Session; // MEMBER
let maria: Session; // MEMBER

async function grantPoints(memberId: string, amount: number): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/members/${memberId}/points/adjust`,
    headers: authHeaders(elke),
    payload: { amount, reason: 'Test-Zuschuss' },
  });
  expect(res.statusCode).toBe(200);
}

async function balanceOf(session: Session): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/members/me/points',
    headers: { cookie: session.cookie },
  });
  return (response.json() as { balance: number }).balance;
}

interface EffectItemInput {
  title: string;
  cost: number;
  effectType: 'IMMUNITY' | 'MULTIPLIER';
  effectDurationMinutes: number;
  effectCharges?: number | null;
  effectMultiplier?: number | null;
}

async function createVirtualEffectReward(input: EffectItemInput): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/rewards',
    headers: authHeaders(elke),
    payload: {
      title: input.title,
      description: null,
      cost: input.cost,
      isActive: true,
      kind: 'VIRTUAL_EFFECT',
      effectType: input.effectType,
      effectDurationMinutes: input.effectDurationMinutes,
      effectCharges: input.effectCharges ?? null,
      effectMultiplier: input.effectMultiplier ?? null,
    },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

interface PurchaseResult {
  redemptionId: string;
  balanceAfter: number;
  activatedEffect: { id: string; type: string; chargesRemaining: number | null } | null;
}

async function purchase(session: Session, rewardId: string): Promise<PurchaseResult> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/rewards/${rewardId}/purchase`,
    headers: authHeaders(session),
    payload: {},
  });
  expect(res.statusCode).toBe(200);
  return res.json() as PurchaseResult;
}

/** A fresh AVAILABLE instance whose offer is already ripe for the sweep. */
async function createRipeInstance(definitionKey: string, value: number): Promise<string> {
  const now = clock.now();
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId(definitionKey),
      status: 'AVAILABLE',
      currentValue: value,
      baseValue: value,
      scheduledFor: now,
      publishedAt: now,
      offerExpiresAt: now, // already <= now: ripe immediately
      configVersion: 1,
    },
    select: { id: true },
  });
  return instance.id;
}

async function volunteerAndComplete(
  session: Session,
  definitionKey: string,
  value: number,
): Promise<{ instanceId: string; assignmentId: string; pointsAwarded: number }> {
  const now = clock.now();
  const instance = await db.taskInstance.create({
    data: {
      householdId: ids.householdId,
      taskDefinitionId: ids.definitionId(definitionKey),
      status: 'AVAILABLE',
      currentValue: value,
      baseValue: value,
      scheduledFor: now,
      publishedAt: now,
      offerExpiresAt: new Date(now.getTime() + 3_600_000),
      configVersion: 1,
    },
    select: { id: true },
  });

  const taken = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instance.id}/volunteer`,
    headers: authHeaders(session),
    payload: {},
  });
  expect(taken.statusCode).toBe(200);
  const assignmentId = (taken.json() as { assignment: { id: string } }).assignment.id;

  const done = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instance.id}/complete`,
    headers: authHeaders(session),
    payload: { assignmentId },
  });
  expect(done.statusCode).toBe(200);
  const body = done.json() as { pointsAwarded: number };
  return { instanceId: instance.id, assignmentId, pointsAwarded: body.pointsAwarded };
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
    definitions: [{ key: 'chore', title: 'Geschirrspüler ausräumen', baseValue: BASE_VALUE }],
  });

  clock = new FakeClock(new Date('2026-09-01T10:00:00Z'));
  sweepDeps = { ...testDeps(db), clock };
  app = await buildTestServer(db, {}, { clock });
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
  'purchasing an immunity item excludes the buyer from the sweep during the window and no longer excludes them after expiry',
  async () => {
    clock.set('2026-09-01T12:00:00Z');
    // Absent so she never competes with paul for the draw during this test —
    // isolates the assertion to "was paul excluded", not "who got picked".
    await db.memberAbsence.create({
      data: {
        householdId: ids.householdId,
        memberId: ids.memberId('maria'),
        startsAt: new Date('2026-09-01T00:00:00Z'),
        endsAt: new Date('2026-09-03T00:00:00Z'),
        reason: 'Test-Isolation',
      },
    });

    const rewardId = await createVirtualEffectReward({
      title: 'Immunitätstrank (60 Min.)',
      cost: 3,
      effectType: 'IMMUNITY',
      effectDurationMinutes: 60,
    });
    await grantPoints(paul.memberId, 3);
    const result = await purchase(paul, rewardId);
    expect(result.activatedEffect?.type).toBe('IMMUNITY');

    const row = await db.memberEffect.findUniqueOrThrow({
      where: { id: result.activatedEffect!.id },
      select: { type: true, expiresAt: true, memberId: true },
    });
    expect(row.type).toBe('IMMUNITY');
    expect(row.memberId).toBe(paul.memberId);
    expect(row.expiresAt.toISOString()).toBe('2026-09-01T13:00:00.000Z');

    const instanceId = await createRipeInstance('chore', BASE_VALUE);

    // Still within the 60-minute window: paul is excluded, elke (the only
    // other eligible candidate) is the sole possible pick — a REAL (non-dry)
    // sweep proves the exclusion in the actual assignment path. (Other ripe
    // instances from earlier tests may also get swept in the same call —
    // this instance's own outcome is what we check, not the report total.)
    await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
    const assignment = await db.taskAssignment.findFirstOrThrow({
      where: { householdId: ids.householdId, taskInstanceId: instanceId, status: 'ACTIVE' },
      select: { id: true, memberId: true, kind: true },
    });
    expect(assignment.memberId).toBe(elke.memberId);
    expect(assignment.kind).toBe('RANDOM');

    // Release it back to AVAILABLE and ripe again for the second check.
    await db.taskAssignment.updateMany({
      where: { id: assignment.id },
      data: { status: 'RELEASED', closedAt: clock.now(), activeForInstanceId: null },
    });
    await db.taskInstance.update({
      where: { id: instanceId },
      data: { status: 'AVAILABLE', offerExpiresAt: clock.now(), version: { increment: 1 } },
    });

    // Past the 60-minute window: paul must no longer be excluded. Checked via
    // a dry-run trace (deterministic — the draw between two eligible people
    // is not) rather than by observing who gets picked.
    clock.advanceMinutes(61);
    const dry = await runAssignmentSweep(sweepDeps, { householdId: ids.householdId, dryRun: true });
    const trace = dry.traces.find((t) => t.taskInstanceId === instanceId);
    expect(trace).toBeDefined();
    const paulTrace = trace!.trace.candidates.find((c) => c.memberId === paul.memberId);
    expect(paulTrace?.exclusionReason).not.toBe('MEMBER_IMMUNE');

    // Cleanup: cancel the instance so it does not linger as an extra ripe
    // candidate for later tests' own sweep calls (dry runs never mutated it,
    // so it is still AVAILABLE at this point).
    await db.taskInstance.update({ where: { id: instanceId }, data: { status: 'CANCELLED' } });
    await db.memberAbsence.deleteMany({ where: { householdId: ids.householdId, memberId: ids.memberId('maria') } });
  },
  30_000,
);

test(
  'a multiplier item scales exactly N voluntary completions, not the (N+1)th, and stops applying once the window elapses even with charges left',
  async () => {
    clock.set('2026-09-02T09:00:00Z');

    const rewardId = await createVirtualEffectReward({
      title: 'Multiplikatortrank (×1.5, 3 Ladungen, 5h)',
      cost: 2,
      effectType: 'MULTIPLIER',
      effectDurationMinutes: 5 * 60,
      effectCharges: 3,
      effectMultiplier: 1.5,
    });
    await grantPoints(paul.memberId, 2);
    const result = await purchase(paul, rewardId);
    expect(result.activatedEffect?.type).toBe('MULTIPLIER');
    expect(result.activatedEffect?.chargesRemaining).toBe(3);
    const effectId = result.activatedEffect!.id;

    // round(4 * 1.5) = 6, for exactly 3 completions.
    for (let i = 0; i < 3; i++) {
      const outcome = await volunteerAndComplete(paul, 'chore', BASE_VALUE);
      expect(outcome.pointsAwarded).toBe(6);
      const row = await db.memberEffect.findUniqueOrThrow({
        where: { id: effectId },
        select: { chargesRemaining: true, consumedAt: true },
      });
      expect(row.chargesRemaining).toBe(2 - i);
      if (i === 2) expect(row.consumedAt).not.toBeNull();
    }

    // 4th completion: no charges left, falls back to the un-multiplied award.
    const fourth = await volunteerAndComplete(paul, 'chore', BASE_VALUE);
    expect(fourth.pointsAwarded).toBe(BASE_VALUE);
    const exhausted = await db.memberEffect.findUniqueOrThrow({
      where: { id: effectId },
      select: { chargesRemaining: true },
    });
    expect(exhausted.chargesRemaining).toBe(0);

    // A second potion whose time window elapses before its charges do.
    clock.advanceMinutes(1);
    const shortRewardId = await createVirtualEffectReward({
      title: 'Multiplikatortrank (×2, 3 Ladungen, 10 Min.)',
      cost: 1,
      effectType: 'MULTIPLIER',
      effectDurationMinutes: 10,
      effectCharges: 3,
      effectMultiplier: 2,
    });
    await grantPoints(maria.memberId, 1);
    const shortResult = await purchase(maria, shortRewardId);
    const shortEffectId = shortResult.activatedEffect!.id;

    clock.advanceMinutes(11); // past the 10-minute window, charges untouched
    const late = await volunteerAndComplete(maria, 'chore', BASE_VALUE);
    expect(late.pointsAwarded).toBe(BASE_VALUE); // not doubled
    const untouched = await db.memberEffect.findUniqueOrThrow({
      where: { id: shortEffectId },
      select: { chargesRemaining: true },
    });
    expect(untouched.chargesRemaining).toBe(3); // never consulted, never consumed
  },
  30_000,
);

test(
  'a RANDOM completion by a member holding an active multiplier still awards exactly 0 (§7, §44)',
  async () => {
    clock.set('2026-09-02T15:00:00Z');

    // Isolate the draw to maria alone, the same absence technique as the
    // immunity test — paul and elke sit this one out.
    await db.memberAbsence.create({
      data: {
        householdId: ids.householdId,
        memberId: ids.memberId('paul'),
        startsAt: new Date('2026-09-02T00:00:00Z'),
        endsAt: new Date('2026-09-03T00:00:00Z'),
        reason: 'Test-Isolation',
      },
    });
    await db.memberAbsence.create({
      data: {
        householdId: ids.householdId,
        memberId: ids.memberId('elke'),
        startsAt: new Date('2026-09-02T00:00:00Z'),
        endsAt: new Date('2026-09-03T00:00:00Z'),
        reason: 'Test-Isolation',
      },
    });

    const rewardId = await createVirtualEffectReward({
      title: 'Multiplikatortrank für RANDOM-Test',
      cost: 1,
      effectType: 'MULTIPLIER',
      effectDurationMinutes: 120,
      effectCharges: 5,
      effectMultiplier: 1.5,
    });
    await grantPoints(maria.memberId, 1);
    const result = await purchase(maria, rewardId);
    const effectId = result.activatedEffect!.id;

    const instanceId = await createRipeInstance('chore', BASE_VALUE);
    await runAssignmentSweep(sweepDeps, { householdId: ids.householdId });
    const assignment = await db.taskAssignment.findFirstOrThrow({
      where: { householdId: ids.householdId, taskInstanceId: instanceId, status: 'ACTIVE' },
      select: { id: true, memberId: true, kind: true },
    });
    expect(assignment.memberId).toBe(maria.memberId);
    expect(assignment.kind).toBe('RANDOM');

    const before = await balanceOf(maria);
    const done = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instanceId}/complete`,
      headers: authHeaders(maria),
      payload: { assignmentId: assignment.id },
    });
    expect(done.statusCode).toBe(200);
    expect((done.json() as { pointsAwarded: number }).pointsAwarded).toBe(0);
    expect(await balanceOf(maria)).toBe(before);

    // The multiplier was never consulted for a RANDOM completion — its
    // charges are untouched.
    const row = await db.memberEffect.findUniqueOrThrow({
      where: { id: effectId },
      select: { chargesRemaining: true },
    });
    expect(row.chargesRemaining).toBe(5);

    await db.memberAbsence.deleteMany({
      where: { householdId: ids.householdId, memberId: { in: [ids.memberId('paul'), ids.memberId('elke')] } },
    });
  },
  30_000,
);

test(
  'two concurrent completions racing to consume the last charge: exactly one gets the multiplier, the count never goes negative',
  async () => {
    clock.set('2026-09-02T18:00:00Z');

    const rewardId = await createVirtualEffectReward({
      title: 'Multiplikatortrank (1 Ladung, Race-Test)',
      cost: 1,
      effectType: 'MULTIPLIER',
      effectDurationMinutes: 120,
      effectCharges: 1,
      effectMultiplier: 2,
    });
    await grantPoints(paul.memberId, 1);
    const result = await purchase(paul, rewardId);
    const effectId = result.activatedEffect!.id;

    const now = clock.now();
    const makeInstance = () =>
      db.taskInstance.create({
        data: {
          householdId: ids.householdId,
          taskDefinitionId: ids.definitionId('chore'),
          status: 'AVAILABLE',
          currentValue: BASE_VALUE,
          baseValue: BASE_VALUE,
          scheduledFor: now,
          publishedAt: now,
          offerExpiresAt: new Date(now.getTime() + 3_600_000),
          configVersion: 1,
        },
        select: { id: true },
      });

    const [instanceA, instanceB] = await Promise.all([makeInstance(), makeInstance()]);

    const volunteer = async (instanceId: string) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${instanceId}/volunteer`,
        headers: authHeaders(paul),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { assignment: { id: string } }).assignment.id;
    };
    const assignmentA = await volunteer(instanceA.id);
    const assignmentB = await volunteer(instanceB.id);

    const complete = (instanceId: string, assignmentId: string) =>
      app.inject({
        method: 'POST',
        url: `/api/tasks/${instanceId}/complete`,
        headers: authHeaders(paul),
        payload: { assignmentId },
      });

    const [resA, resB] = await Promise.all([
      complete(instanceA.id, assignmentA),
      complete(instanceB.id, assignmentB),
    ]);
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    const awards = [
      (resA.json() as { pointsAwarded: number }).pointsAwarded,
      (resB.json() as { pointsAwarded: number }).pointsAwarded,
    ].sort((a, b) => a - b);
    // One completion got the ×2 (8), the other the plain award (4) — never
    // both multiplied, since only one charge existed.
    expect(awards).toEqual([BASE_VALUE, BASE_VALUE * 2]);

    const row = await db.memberEffect.findUniqueOrThrow({
      where: { id: effectId },
      select: { chargesRemaining: true },
    });
    expect(row.chargesRemaining).toBe(0);
    expect(row.chargesRemaining).toBeGreaterThanOrEqual(0);
  },
  30_000,
);
