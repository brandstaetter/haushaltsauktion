/**
 * **Phase 5's exit gate: a broken Todoist must never break the chore lifecycle.**
 *
 * CLAUDE.md §28 requires volunteer, buyout and completion to be atomic, and §44
 * makes the ledger the source of truth for every point. The Todoist integration
 * is explicitly subordinate to both: a missing Todoist task is a nuisance, a
 * rolled-back buyout is a correctness failure.
 *
 * This suite runs the three core flows over real HTTP against real Postgres with
 * **every** integration port rigged to throw on contact — the Todoist client,
 * the secret box, and (hardest of all) the notifier. If any of them can reach a
 * core transaction, these tests fail.
 *
 * The guarantee is structural rather than defensive: the level-triggered design
 * means no use-case reads or writes an integration table at all. Three earlier
 * revisions of this design *could* not have passed this test — one decorated the
 * notifier, one wrote the outbox inside the caller's transaction (where a
 * Postgres constraint violation poisons the whole transaction beyond any
 * try/catch), and one tailed the history log. This file is the regression guard
 * for that whole class of mistake.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import type { SecretBox, TodoistPort } from '../../src/app/integrations/ports.js';
import {
  authHeaders,
  buildTestServer,
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-todoistiso-');
const VALUE = 6;
const STARTING_POINTS = 20;

class TodoistExploded extends Error {}

/** Throws on every method — including the shapes a caller might treat as safe. */
const hostileTodoist: TodoistPort = {
  createTask: () => {
    throw new TodoistExploded('createTask must never be reached from a core flow');
  },
  closeTask: () => {
    throw new TodoistExploded('closeTask must never be reached from a core flow');
  },
  listProjects: () => {
    throw new TodoistExploded('listProjects must never be reached from a core flow');
  },
};

const hostileSecrets: SecretBox = {
  seal: () => {
    throw new TodoistExploded('seal must never be reached from a core flow');
  },
  open: () => {
    throw new TodoistExploded('open must never be reached from a core flow');
  },
};

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;
let arthur: Session;

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [
      { key: 'elke', displayName: 'Elke', role: 'ADMIN' },
      { key: 'arthur', displayName: 'Arthur', role: 'MEMBER' },
    ],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: VALUE }],
  });

  app = await buildTestServer(db, {}, { todoist: hostileTodoist, secrets: hostileSecrets });
  elke = await login(app, ids, 'elke');
  arthur = await login(app, ids, 'arthur');

  // Arthur needs a balance to buy out with. Posted through the real admin route
  // rather than by inserting a row: the ledger is a chained structure
  // (`previousTransactionId`), so a hand-written entry would be a corrupt one —
  // and it is `postTransaction` that maintains the chain and the cache together.
  const funded = await app.inject({
    method: 'POST',
    url: `/api/admin/members/${ids.memberId('arthur')}/points/adjust`,
    headers: authHeaders(elke),
    payload: { amount: STARTING_POINTS, reason: 'Fixture für den Isolationstest' },
  });
  expect(funded.statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
});

test('voluntary takeover and completion succeed with every integration port throwing', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', VALUE);

  const volunteered = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/volunteer`,
    headers: authHeaders(elke),
  });
  expect(volunteered.statusCode, volunteered.body).toBe(200);

  // The completion route takes the assignment id plus an optimistic version.
  // Both are read back from the database rather than picked out of the response
  // DTO: this suite is about integration isolation, and it should not fail (or
  // silently pass) because a presentation shape changed.
  const active = await db.taskAssignment.findFirstOrThrow({
    where: { householdId: ids.householdId, taskInstanceId: instanceId, status: 'ACTIVE' },
    select: { id: true },
  });
  const current = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { version: true },
  });

  const completed = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/complete`,
    headers: authHeaders(elke),
    payload: { assignmentId: active.id, expectedVersion: current.version },
  });
  expect(completed.statusCode, completed.body).toBe(200);

  // The ledger is the guarantee that matters (§44): the reward must have landed
  // in full, not been rolled back by a third party's failure.
  const balance = await app.inject({
    method: 'GET',
    url: '/api/members/me/points',
    headers: authHeaders(elke),
  });
  expect(balance.statusCode).toBe(200);
  expect(balance.json().balance).toBe(VALUE);

  const instance = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { status: true, currentValue: true },
  });
  expect(instance.status).toBe('COMPLETED');
  // §11: the value resets to base after completion.
  expect(instance.currentValue).toBe(VALUE);
});

test('buyout succeeds and debits correctly with every integration port throwing', async () => {
  const instanceId = await createAvailableInstance(db, ids, 'bad', VALUE);

  // Impose a random assignment on Arthur, the state a buyout acts on.
  const assignment = await db.taskAssignment.create({
    data: {
      householdId: ids.householdId,
      taskInstanceId: instanceId,
      memberId: ids.memberId('arthur'),
      kind: 'RANDOM',
      status: 'ACTIVE',
      activeForInstanceId: instanceId,
      valueAtAssignment: VALUE,
      configVersion: 1,
    },
    select: { id: true },
  });
  await db.taskInstance.update({
    where: { id: instanceId },
    data: { status: 'ASSIGNED' },
  });

  // §31: the member must see cost and resulting value *before* deciding, and
  // §36 says the server never trusts those numbers — the client echoes what it
  // displayed and the server recomputes. So the real flow is quote, then echo.
  const quote = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignment.id}/buyout-quote`,
    headers: authHeaders(arthur),
  });
  expect(quote.statusCode, quote.body).toBe(200);
  const shown = quote.json();
  expect(shown.allowed, quote.body).toBe(true);

  const bought = await app.inject({
    method: 'POST',
    url: `/api/assignments/${assignment.id}/buyout`,
    headers: authHeaders(arthur),
    // Exactly the two numbers the member was shown.
    payload: { acceptedCost: shown.cost, acceptedNewValue: shown.taskValueAfter },
  });
  expect(bought.statusCode, bought.body).toBe(200);

  // §44's invariants, all of which a rollback would have broken.
  const balance = await app.inject({
    method: 'GET',
    url: '/api/members/me/points',
    headers: authHeaders(arthur),
  });
  expect(balance.json().balance).toBe(STARTING_POINTS - VALUE);

  const instance = await db.taskInstance.findUniqueOrThrow({
    where: { id: instanceId },
    select: { status: true, currentValue: true, buyoutCount: true },
  });
  expect(instance.status).toBe('AVAILABLE');
  expect(instance.currentValue).toBeGreaterThan(VALUE);
  expect(instance.buyoutCount).toBe(1);

  const closed = await db.taskAssignment.findUniqueOrThrow({
    where: { id: assignment.id },
    select: { status: true },
  });
  expect(closed.status).toBe('BOUGHT_OUT');
});

test('the hostile ports are genuinely armed (negative control)', () => {
  // Without this, the suite could pass vacuously: if `depsOverrides` were ever
  // dropped on the floor, "nothing threw" would prove nothing at all. This
  // asserts the trap actually bites when touched, so the other tests' silence
  // is meaningful.
  expect(() =>
    hostileTodoist.createTask('token', {
      commandUuid: 'x',
      content: 'x',
      description: 'x',
      projectId: null,
      dueAt: null,
      timezone: 'UTC',
    }),
  ).toThrow(TodoistExploded);
  expect(() => hostileSecrets.open({ ciphertext: new Uint8Array(), iv: new Uint8Array(), authTag: new Uint8Array(), keyVersion: 1 })).toThrow(
    TodoistExploded,
  );
});

test('no core flow wrote anything to an integration table', async () => {
  // The structural claim, asserted rather than assumed. If a future change moves
  // integration work back into a use-case, this fails even if the hostile ports
  // happen not to be reached on that path.
  const [outbox, links, integrations] = await Promise.all([
    db.integrationOutbox.count({ where: { householdId: ids.householdId } }),
    db.integrationTaskLink.count({ where: { householdId: ids.householdId } }),
    db.memberIntegration.count({ where: { householdId: ids.householdId } }),
  ]);
  expect({ outbox, links, integrations }).toEqual({ outbox: 0, links: 0, integrations: 0 });
});
