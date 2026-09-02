/**
 * Daily completion streak (intake "daily-completion-streak-bonus"), over real
 * HTTP against a real Postgres.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 *
 * `test/domain/streak.test.ts` already covers the pure formula and reducer in
 * isolation. This file is the seam: a controllable `FakeClock` (the only
 * `Deps` override — everything else is the real dependency graph, same
 * discipline as `_fixture.ts`'s `testDeps`) drives completions across several
 * household-local days through the real `completeTask` / `rejectCompletion`
 * routes and the real `runStreakSweep`, so the acceptance criteria are
 * checked against the actual ledger and the actual `household_members` row,
 * not a mock of either.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { HouseholdConfig } from '@haushaltsauktion/shared';
import { runStreakSweep } from '../../src/app/streak/runStreakSweep.js';
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

const ids = idsFor('test-streak-');

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
}

let db: PrismaClient;
let app: FastifyInstance;
let clock: FakeClock;
let streakDeps: Deps;
let elke: Session; // ADMIN
let paul: Session; // MEMBER
let maria: Session; // MEMBER
let hannes: Session; // MEMBER — kept isolated from paul/maria's story arcs above

async function setStreakEnabled(enabled: boolean): Promise<void> {
  const current = await app.inject({
    method: 'GET',
    url: '/api/admin/config',
    headers: authHeaders(elke),
  });
  const body = current.json() as { version: number; values: HouseholdConfig };
  const res = await app.inject({
    method: 'PUT',
    url: '/api/admin/config',
    headers: authHeaders(elke),
    payload: {
      expectedVersion: body.version,
      values: { ...body.values, streak: { ...body.values.streak, enabled } },
    },
  });
  expect(res.statusCode).toBe(200);
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

async function balanceOf(session: Session): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/members/me/points',
    headers: { cookie: session.cookie },
  });
  return (response.json() as { balance: number }).balance;
}

async function streakRowOf(memberKey: string): Promise<{
  streakLength: number;
  streakLastActiveDate: string | null;
  streakBonusPaidDate: string | null;
}> {
  return db.householdMember.findUniqueOrThrow({
    where: { id: ids.memberId(memberKey) },
    select: { streakLength: true, streakLastActiveDate: true, streakBonusPaidDate: true },
  });
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
      { key: 'hannes', displayName: 'Hannes', role: 'MEMBER' },
    ],
    definitions: [{ key: 'chore', title: 'Geschirrspüler ausräumen', baseValue: BASE_VALUE }],
  });

  clock = new FakeClock(new Date('2026-09-01T10:00:00Z')); // Berlin: CEST, 12:00 local
  streakDeps = { ...testDeps(db), clock };
  app = await buildTestServer(db, {}, { clock });
  await app.ready();

  elke = await login(app, ids, 'elke');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
  hannes = await login(app, ids, 'hannes');
}, 60_000);

afterAll(async () => {
  const integrity = await verifyLedgerIntegrity(db, { householdId: ids.householdId });
  expect(integrity.ok).toBe(true);

  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

describe('the formula, paid once per day, across a multi-day streak', () => {
  test('day 1 pays 0, day 2 pays floor(0.5*2)=1 — on top of the ordinary reward', async () => {
    clock.set('2026-09-01T10:00:00Z');
    const day1 = await volunteerAndComplete(paul, 'chore', BASE_VALUE);
    expect(day1.pointsAwarded).toBe(BASE_VALUE);
    expect(await balanceOf(paul)).toBe(BASE_VALUE); // no streak row on day 1 (§4.5)

    const rowAfterDay1 = await streakRowOf('paul');
    expect(rowAfterDay1.streakLength).toBe(1);
    expect(rowAfterDay1.streakLastActiveDate).toBe('2026-09-01');
    expect(rowAfterDay1.streakBonusPaidDate).toBeNull();

    clock.set('2026-09-02T10:00:00Z');
    const day2 = await volunteerAndComplete(paul, 'chore', BASE_VALUE);
    expect(day2.pointsAwarded).toBe(BASE_VALUE);
    // 4 (day1) + 4 (day2 reward) + 1 (day2 streak bonus, floor(0.5*2))
    expect(await balanceOf(paul)).toBe(BASE_VALUE + BASE_VALUE + 1);

    const rowAfterDay2 = await streakRowOf('paul');
    expect(rowAfterDay2.streakLength).toBe(2);
    expect(rowAfterDay2.streakLastActiveDate).toBe('2026-09-02');
    expect(rowAfterDay2.streakBonusPaidDate).toBe('2026-09-02');

    // ── REASSIGN_TO_MEMBER, same day: the streak must survive intact ──────
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${day2.instanceId}/reject-completion`,
      headers: authHeaders(elke),
      payload: { outcome: 'REASSIGN_TO_MEMBER' },
    });
    expect(rejected.statusCode).toBe(200);
    const rejectedBody = rejected.json() as { clawedBack: number; newAssignmentId: string | null };
    // reward (4) + this day's streak bonus (1), both reversed together.
    expect(rejectedBody.clawedBack).toBe(BASE_VALUE + 1);
    expect(rejectedBody.newAssignmentId).not.toBeNull();

    // Balance reflects both reversals; the streak's own state is untouched —
    // REASSIGN_TO_MEMBER never breaks length/lastActiveDate directly.
    expect(await balanceOf(paul)).toBe(BASE_VALUE); // back to just day 1's reward
    const rowAfterReject = await streakRowOf('paul');
    expect(rowAfterReject.streakLength).toBe(2); // NOT dropped to 1 or 0
    expect(rowAfterReject.streakLastActiveDate).toBe('2026-09-02');
    expect(rowAfterReject.streakBonusPaidDate).toBeNull(); // cleared, so a redo can pay again

    // ── the redo, same day: reward AND streak bonus both pay again ────────
    const redone = await app.inject({
      method: 'POST',
      url: `/api/tasks/${day2.instanceId}/complete`,
      headers: authHeaders(paul),
      payload: { assignmentId: rejectedBody.newAssignmentId },
    });
    expect(redone.statusCode).toBe(200);
    expect((redone.json() as { pointsAwarded: number }).pointsAwarded).toBe(BASE_VALUE);

    expect(await balanceOf(paul)).toBe(BASE_VALUE + BASE_VALUE + 1);
    const rowAfterRedo = await streakRowOf('paul');
    expect(rowAfterRedo.streakLength).toBe(2); // continued, never broke
    expect(rowAfterRedo.streakBonusPaidDate).toBe('2026-09-02');
  });
});

describe('REOFFER_MARKET breaks the streak unconditionally', () => {
  test('the streak resets to zero even though it had built up over several days', async () => {
    clock.set('2026-09-01T10:00:00Z');
    await volunteerAndComplete(maria, 'chore', BASE_VALUE); // day 1, length 1

    clock.set('2026-09-02T10:00:00Z');
    await volunteerAndComplete(maria, 'chore', BASE_VALUE); // day 2, length 2, bonus 1

    clock.set('2026-09-03T10:00:00Z');
    const day3 = await volunteerAndComplete(maria, 'chore', BASE_VALUE); // day 3, length 3, bonus 1

    const rowBeforeReject = await streakRowOf('maria');
    expect(rowBeforeReject.streakLength).toBe(3);
    const balanceBeforeReject = await balanceOf(maria);
    // 4+4+1 (day1,2) + 4+1 (day3) = 14
    expect(balanceBeforeReject).toBe(14);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${day3.instanceId}/reject-completion`,
      headers: authHeaders(elke),
      payload: { outcome: 'REOFFER_MARKET' },
    });
    expect(rejected.statusCode).toBe(200);
    const rejectedBody = rejected.json() as { clawedBack: number };
    expect(rejectedBody.clawedBack).toBe(BASE_VALUE + 1); // day 3's reward + its streak bonus

    expect(await balanceOf(maria)).toBe(balanceBeforeReject - (BASE_VALUE + 1));

    const rowAfterReject = await streakRowOf('maria');
    expect(rowAfterReject.streakLength).toBe(0);
    expect(rowAfterReject.streakLastActiveDate).toBeNull();
    expect(rowAfterReject.streakBonusPaidDate).toBeNull();
  });
});

describe('a random-only day keeps the streak alive and pays nothing', () => {
  test('a RANDOM completion extends the (broken, then rebuilt) streak with no STREAK_BONUS row', async () => {
    // Continuing from the REOFFER_MARKET test above: maria's streak is 0.
    clock.set('2026-09-04T10:00:00Z');

    const now = clock.now();
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: ids.definitionId('chore'),
        status: 'ASSIGNED',
        currentValue: BASE_VALUE,
        baseValue: BASE_VALUE,
        scheduledFor: now,
        publishedAt: now,
        configVersion: 1,
      },
      select: { id: true },
    });
    const assignment = await db.taskAssignment.create({
      data: {
        householdId: ids.householdId,
        taskInstanceId: instance.id,
        memberId: maria.memberId,
        kind: 'RANDOM',
        status: 'ACTIVE',
        response: 'PENDING',
        activeForInstanceId: instance.id,
        valueAtAssignment: BASE_VALUE,
        configVersion: 1,
        assignedAt: now,
      },
      select: { id: true },
    });

    const balanceBefore = await balanceOf(maria);
    const done = await app.inject({
      method: 'POST',
      url: `/api/admin/instances/${instance.id}/complete`,
      headers: authHeaders(elke),
    });
    expect(done.statusCode).toBe(200);
    expect((done.json() as { pointsAwarded: number }).pointsAwarded).toBe(0); // §7/§44

    // No points moved at all — not the ordinary reward, and not a streak bonus.
    expect(await balanceOf(maria)).toBe(balanceBefore);

    const row = await streakRowOf('maria');
    expect(row.streakLength).toBe(1); // kept alive / restarted, but never paid
    expect(row.streakLastActiveDate).toBe('2026-09-04');
    expect(row.streakBonusPaidDate).toBeNull();

    const streakTx = await db.pointTransaction.findUnique({
      where: { idempotencyKey: `streak:${assignment.id}` },
    });
    expect(streakTx).toBeNull(); // §4.5 — no row at all, not a zero-amount one
  });
});

describe('the idle sweep breaks a streak only after a full idle day', () => {
  test('one day since the last (RANDOM) activity is not stale; two days is', async () => {
    // Continuing from the previous test: maria was active on 2026-09-04.
    clock.set('2026-09-05T09:00:00Z'); // one day later — still within grace
    await runStreakSweep(streakDeps, { householdId: ids.householdId });
    expect((await streakRowOf('maria')).streakLength).toBe(1); // untouched

    clock.set('2026-09-06T09:00:00Z'); // a full idle day (09-05) has now passed
    await runStreakSweep(streakDeps, { householdId: ids.householdId });
    const row = await streakRowOf('maria');
    expect(row.streakLength).toBe(0);
    expect(row.streakLastActiveDate).toBeNull();
    expect(row.streakBonusPaidDate).toBeNull();
  });
});

describe('the idle sweep respects the household streak switch', () => {
  test('does nothing while streak.enabled is false, resumes once turned back on', async () => {
    clock.set('2026-09-10T10:00:00Z');
    await volunteerAndComplete(hannes, 'chore', BASE_VALUE); // day 1, length 1

    clock.set('2026-09-11T10:00:00Z');
    await volunteerAndComplete(hannes, 'chore', BASE_VALUE); // day 2, length 2, bonus 1

    const rowBeforeDisable = await streakRowOf('hannes');
    expect(rowBeforeDisable.streakLength).toBe(2);
    expect(rowBeforeDisable.streakLastActiveDate).toBe('2026-09-11');

    await setStreakEnabled(false);
    try {
      // Two full idle days pass — enough to be well past the stale threshold.
      clock.set('2026-09-13T10:00:00Z');
      await runStreakSweep(streakDeps, { householdId: ids.householdId });

      // `applyCompletionToStreak()`'s documented semantics — state neither
      // advances nor breaks while the mechanism is off — must also hold for
      // the sweep, not just for completions.
      const rowWhileDisabled = await streakRowOf('hannes');
      expect(rowWhileDisabled.streakLength).toBe(2);
      expect(rowWhileDisabled.streakLastActiveDate).toBe('2026-09-11');
    } finally {
      await setStreakEnabled(true);
    }

    // Re-enabled: the same stale state is now acted on normally.
    await runStreakSweep(streakDeps, { householdId: ids.householdId });
    const rowAfterReenable = await streakRowOf('hannes');
    expect(rowAfterReenable.streakLength).toBe(0);
    expect(rowAfterReenable.streakLastActiveDate).toBeNull();
  });
});
