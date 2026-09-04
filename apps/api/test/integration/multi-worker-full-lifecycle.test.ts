/**
 * Multi-worker-tasks Phase 5 — the campaign's own end condition ("Manual
 * smoke test: create an AT_LEAST(2) task, two members volunteer, one buys
 * back out, sweep fills the gap, both complete — full ledger + history trace
 * matches expectations end to end") turned into a regression test instead of
 * a one-off click-through, per .planning/campaigns/multi-worker-tasks.md.
 *
 * This is the single continuous narrative Phases 1-4's tests only ever
 * exercised in isolated fragments (one mechanic per test, starting each from
 * a hand-built DB row). Driving the whole loop end to end through the real
 * HTTP routes and the real sweep is exactly the kind of gap that let the
 * `reopen.ts` whole-instance-reopen regression slip through Phase 2's own
 * review undetected (see the campaign's Decision Log, 2026-09-04) — that bug
 * only showed up once a release happened *after* a co-assignee already held
 * a slot, which no single-mechanic test staged.
 *
 * One correction to the campaign brief's literal narrative, worth recording
 * here rather than silently "fixing the test": for `AT_LEAST(2)`,
 * `minRequired` is 2 (worker-slots.ts), so a *single* volunteer never crosses
 * the state-machine threshold — the instance stays `AVAILABLE` with
 * `activeSlotCount: 1` until the second join reaches `min`. Only then does it
 * become `ASSIGNED`. That is the whole point of `AT_LEAST` recruiting rather
 * than an off-by-one; the brief's "first volunteer → ASSIGNED" was written
 * with `EXACTLY(1)` intuition and does not hold once `min > 1`.
 *
 * The second correction: the brief's "one buys back out" is `executeBuyout`
 * language, but `reopen.ts`'s own docstring is explicit that a `VOLUNTARY`
 * slot is *released*, never bought out (§3B) — buyout is for `RANDOM`
 * assignments only, and `releaseOrRevokeAssignment` throws `NOT_VOLUNTARY`
 * the other way around. Both volunteers here are `VOLUNTARY`, so the
 * narrative uses `POST /tasks/:id/release`, which is the mechanism that
 * actually exercises the "drops below min, instance reopens" branch of
 * `releaseOrRevokeAssignment` — the release-side counterpart of the buyout
 * bug already covered by `multi-worker-lifecycle.test.ts`.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { runAssignmentSweep } from '../../src/app/assignment/runAssignmentSweep.js';

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

const ids = idsFor('test-multiworker-full-lifecycle-');

let db: PrismaClient;
let app: FastifyInstance;
let anna: Session; // ADMIN
let paul: Session;
let maria: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'anna', displayName: 'Anna', role: 'ADMIN' },
      { key: 'paul', displayName: 'Paul', role: 'MEMBER' },
      { key: 'maria', displayName: 'Maria', role: 'MEMBER' },
    ],
    definitions: [],
  });
  app = await buildTestServer(db);
  await app.ready();
  anna = await login(app, ids, 'anna');
  paul = await login(app, ids, 'paul');
  maria = await login(app, ids, 'maria');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
}, 60_000);

test(
  'AT_LEAST(2)-Gesamtablauf: zwei Freiwillige, eine Freigabe, Sweep füllt die Lücke, beide erledigen — vollständige Historie und Punkte-Ledger',
  async () => {
    const now = new Date();
    const defId = ids.definitionId('gartenpflege');
    await db.taskDefinition.create({
      data: {
        id: defId,
        householdId: ids.householdId,
        title: 'Gartenpflege',
        categoryId: ids.categoryId,
        baseValue: 5,
        estimatedMinutes: 20,
        recurrenceType: 'MANUAL',
        workerCountMode: 'AT_LEAST',
        workerCount: 2,
      },
    });
    const instance = await db.taskInstance.create({
      data: {
        householdId: ids.householdId,
        taskDefinitionId: defId,
        status: 'AVAILABLE',
        currentValue: 5,
        baseValue: 5,
        scheduledFor: now,
        publishedAt: now,
        offerExpiresAt: new Date(now.getTime() + 3600_000),
        configVersion: 1,
        workerCountMode: 'AT_LEAST',
        workerCount: 2,
        activeSlotCount: 0,
      },
      select: { id: true },
    });

    // ── Step 1 ────────────────────────────────────────────────────────────
    const initial = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(initial.status).toBe('AVAILABLE');
    expect(initial.activeSlotCount).toBe(0);

    // ── Step 2: Paul volunteers for the first slot ──────────────────────────
    const paulVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(paul),
      payload: {},
    });
    expect(paulVolunteer.statusCode, JSON.stringify(paulVolunteer.json())).toBe(200);

    // AT_LEAST(2): minRequired is 2 (worker-slots.ts), so ONE join never
    // crosses the threshold — the instance stays AVAILABLE, still recruiting.
    const afterPaul = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterPaul.status).toBe('AVAILABLE');
    expect(afterPaul.activeSlotCount).toBe(1);

    const afterPaulAssignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { id: true, memberId: true, kind: true, slotIndex: true },
    });
    expect(afterPaulAssignments).toHaveLength(1);
    expect(afterPaulAssignments[0]?.memberId).toBe(paul.memberId);
    expect(afterPaulAssignments[0]?.kind).toBe('VOLUNTARY');
    const paulAssignmentId = afterPaulAssignments[0]!.id;

    // ── Step 3: Maria volunteers for the second slot — reaches minRequired ──
    const mariaVolunteer = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/volunteer`,
      headers: authHeaders(maria),
      payload: {},
    });
    expect(mariaVolunteer.statusCode, JSON.stringify(mariaVolunteer.json())).toBe(200);

    const afterMaria = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterMaria.status).toBe('ASSIGNED');
    expect(afterMaria.activeSlotCount).toBe(2);

    const afterMariaAssignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { id: true, memberId: true, kind: true, slotIndex: true },
    });
    expect(afterMariaAssignments).toHaveLength(2);
    expect(new Set(afterMariaAssignments.map((a) => a.memberId))).toEqual(
      new Set([paul.memberId, maria.memberId]),
    );
    expect(afterMariaAssignments.every((a) => a.kind === 'VOLUNTARY')).toBe(true);
    expect(new Set(afterMariaAssignments.map((a) => a.slotIndex))).toEqual(new Set([0, 1]));
    const mariaAssignmentId = afterMariaAssignments.find((a) => a.memberId === maria.memberId)!.id;

    // ── Step 4: Paul releases his VOLUNTARY slot (not a buyout — reopen.ts's
    //    NOT_VOLUNTARY guard is exactly why: only RANDOM assignments are
    //    bought out). Dropping to 1 active slot is below AT_LEAST(2)'s min,
    //    so the instance reopens with a fresh offer window — the exact branch
    //    the campaign's reopen.ts corrective fix (Phase 4) exists to cover. ──
    const release = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/release`,
      headers: authHeaders(paul),
      payload: { assignmentId: paulAssignmentId },
    });
    expect(release.statusCode, JSON.stringify(release.json())).toBe(200);
    expect((release.json() as { clawedBack: number }).clawedBack).toBe(0);

    const releasedRow = await db.taskAssignment.findUniqueOrThrow({
      where: { id: paulAssignmentId },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(releasedRow.status).toBe('RELEASED');
    expect(releasedRow.activeForInstanceId).toBeNull();
    expect(releasedRow.activeSlotKey).toBeNull();

    // Maria's own slot is completely untouched by Paul's release.
    const mariaRowAfterRelease = await db.taskAssignment.findUniqueOrThrow({
      where: { id: mariaAssignmentId },
      select: { status: true },
    });
    expect(mariaRowAfterRelease.status).toBe('ACTIVE');

    const afterRelease = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, offerExpiresAt: true },
    });
    expect(afterRelease.status).toBe('AVAILABLE');
    expect(afterRelease.activeSlotCount).toBe(1);
    expect(afterRelease.offerExpiresAt).not.toBeNull();

    // ── Step 5: ripen the fresh offer window and run the sweep. It must fill
    //    the one open slot via a RANDOM draw, bringing the instance back to
    //    fully staffed. Only Anna or Paul may be drawn — Maria already holds
    //    a slot and is excluded (candidates.ts's instanceId exclusion). ──
    await db.taskInstance.update({
      where: { id: instance.id },
      data: { offerExpiresAt: new Date(Date.now() - 1_000) },
    });

    const sweepReport = await runAssignmentSweep(testDeps(db), { householdId: ids.householdId });
    expect(sweepReport.assigned).toBeGreaterThanOrEqual(1);

    const afterSweep = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true },
    });
    expect(afterSweep.status).toBe('ASSIGNED');
    expect(afterSweep.activeSlotCount).toBe(2);

    const afterSweepAssignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id, status: 'ACTIVE' },
      select: { id: true, memberId: true, kind: true, slotIndex: true },
    });
    expect(afterSweepAssignments).toHaveLength(2);
    const randomRow = afterSweepAssignments.find((a) => a.kind === 'RANDOM');
    const voluntaryRow = afterSweepAssignments.find((a) => a.kind === 'VOLUNTARY');
    expect(randomRow).toBeDefined();
    expect(voluntaryRow).toBeDefined();
    expect(voluntaryRow?.id).toBe(mariaAssignmentId);
    expect([anna.memberId, paul.memberId]).toContain(randomRow?.memberId);
    expect(new Set(afterSweepAssignments.map((a) => a.slotIndex))).toEqual(new Set([0, 1]));

    const randomHolder =
      randomRow?.memberId === anna.memberId ? anna : randomRow?.memberId === paul.memberId ? paul : null;
    expect(randomHolder).not.toBeNull();
    const randomAssignmentId = randomRow!.id;

    // ── Step 6: both remaining slot-holders complete independently. Maria
    //    (VOLUNTARY) completes first — the instance must stay ASSIGNED, only
    //    the denormalized slot count moves. Then the RANDOM holder completes
    //    last, closing the instance, paying 0, and resetting the value. ──
    const mariaComplete = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/complete`,
      headers: authHeaders(maria),
      payload: { assignmentId: mariaAssignmentId },
    });
    expect(mariaComplete.statusCode, JSON.stringify(mariaComplete.json())).toBe(200);
    const mariaCompleteBody = mariaComplete.json() as { pointsAwarded: number };
    expect(mariaCompleteBody.pointsAwarded).toBe(5);

    const afterMariaComplete = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, currentValue: true, completedAt: true },
    });
    expect(afterMariaComplete.status).toBe('ASSIGNED');
    expect(afterMariaComplete.activeSlotCount).toBe(1);
    expect(afterMariaComplete.currentValue).toBe(5);
    expect(afterMariaComplete.completedAt).toBeNull();

    const randomComplete = await app.inject({
      method: 'POST',
      url: `/api/tasks/${instance.id}/complete`,
      headers: authHeaders(randomHolder!),
      payload: { assignmentId: randomAssignmentId },
    });
    expect(randomComplete.statusCode, JSON.stringify(randomComplete.json())).toBe(200);
    const randomCompleteBody = randomComplete.json() as { pointsAwarded: number };
    // §7 / §44 — the campaign's central invariant: a RANDOM completion pays
    // exactly 0, no admin setting can change that.
    expect(randomCompleteBody.pointsAwarded).toBe(0);

    const afterRandomComplete = await db.taskInstance.findUniqueOrThrow({
      where: { id: instance.id },
      select: { status: true, activeSlotCount: true, currentValue: true, completedAt: true },
    });
    expect(afterRandomComplete.status).toBe('COMPLETED');
    expect(afterRandomComplete.activeSlotCount).toBe(0);
    expect(afterRandomComplete.currentValue).toBe(5); // reset to baseValue (unchanged here, never escalated)
    expect(afterRandomComplete.completedAt).not.toBeNull();

    // ── Step 7a: the full history trace, in order ───────────────────────────
    const history = await db.taskHistoryEvent.findMany({
      where: { taskInstanceId: instance.id },
      orderBy: { seq: 'asc' },
      select: { type: true, memberId: true, payload: true },
    });
    expect(history.map((h) => h.type)).toEqual([
      'VOLUNTEERED', // Paul
      'VOLUNTEERED', // Maria
      'RELEASED', // Paul
      'RE_OFFERED', // instance drops below min, reopens
      'NO_VOLUNTEER', // sweep sees the ripe, still-under-min instance
      'RANDOMLY_ASSIGNED', // sweep fills the gap
      'COMPLETED', // Maria — not the last slot
      'POINTS_AWARDED', // Maria's voluntary reward
      'COMPLETED', // random holder — the last slot
      'VALUE_RESET', // fires exactly once, on the last slot
    ]);
    expect(history[0]?.memberId).toBe(paul.memberId);
    expect(history[1]?.memberId).toBe(maria.memberId);
    expect(history[2]?.memberId).toBe(paul.memberId);

    // ── Step 7b: the point ledger balances exactly — absence, not a zero row,
    //    is how a RANDOM completion's non-reward is represented (§8.2 step 1,
    //    Decision Log convention already used by the Phase 2 tests). ──
    const transactions = await db.pointTransaction.findMany({
      where: { taskInstanceId: instance.id },
      select: { memberId: true, amount: true, type: true, balanceBefore: true, balanceAfter: true },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      memberId: maria.memberId,
      amount: 5,
      type: 'VOLUNTARY_TASK_REWARD',
      balanceBefore: 0,
      balanceAfter: 5,
    });

    const mariaMember = await db.householdMember.findUniqueOrThrow({
      where: { id: maria.memberId },
      select: { pointsCache: true },
    });
    expect(mariaMember.pointsCache).toBe(5);

    const paulMember = await db.householdMember.findUniqueOrThrow({
      where: { id: paul.memberId },
      select: { pointsCache: true },
    });
    expect(paulMember.pointsCache).toBe(0);

    const annaMember = await db.householdMember.findUniqueOrThrow({
      where: { id: anna.memberId },
      select: { pointsCache: true },
    });
    expect(annaMember.pointsCache).toBe(0);

    // Every assignment on this instance ends up closed, with no dangling
    // sentinel/slot-key left behind for a future volunteer to collide with.
    const finalAssignments = await db.taskAssignment.findMany({
      where: { taskInstanceId: instance.id },
      select: { status: true, activeForInstanceId: true, activeSlotKey: true },
    });
    expect(finalAssignments).toHaveLength(3); // Paul's released one + Maria's + the random one
    expect(finalAssignments.every((a) => a.activeForInstanceId === null)).toBe(true);
    expect(finalAssignments.every((a) => a.activeSlotKey === null)).toBe(true);
  },
  60_000,
);
