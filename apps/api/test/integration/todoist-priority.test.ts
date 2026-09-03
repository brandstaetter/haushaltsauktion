/**
 * Regression guard for "Todoist task priority should be configurable in
 * household settings instead of fixed".
 *
 * Before this change, `integrations.todoist` in `HouseholdConfigSchema` had no
 * `priority` field, and `runReconciliation.ts` never populated
 * `CreateTaskCommand.priority` — so every created task fell back to Todoist's
 * own default no matter what an admin wanted. `todoist-sync.ts` already
 * forwarded `command.priority` verbatim to the Sync API's `item_add` `args`
 * (`if (command.priority !== undefined) args.priority = command.priority`);
 * this suite proves the missing half — config → outbox payload → the
 * `item_add` command actually sent — now works, and that the *absence* of a
 * configured priority still sends no argument at all (today's behaviour,
 * preserved as the default).
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`.
 */

import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';

import type { HouseholdConfig } from '@haushaltsauktion/shared';
import { dispatchOutbox } from '../../src/app/integrations/dispatchOutbox.js';
import { runReconciliation } from '../../src/app/integrations/runReconciliation.js';
import type { CreateTaskCommand, TodoistPort } from '../../src/app/integrations/ports.js';
import { createSecretBox } from '../../src/infra/integrations/secret-box.js';
import {
  authHeaders,
  buildTestServer,
  createAvailableInstance,
  createHousehold,
  dropHousehold,
  idsFor,
  login,
  testDb,
  testDeps,
  type Session,
} from './_fixture.js';

const ids = idsFor('test-todoistprio-');
const VALUE = 6;

/** Records every `createTask` call so a test can inspect the command it built. */
const createTaskCalls: CreateTaskCommand[] = [];
const fakeTodoist: TodoistPort = {
  createTask: async (_token, command) => {
    createTaskCalls.push(command);
    return { ok: true, value: { kind: 'CREATED', externalTaskId: `ext-${command.commandUuid}` } };
  },
  closeTask: async () => ({ ok: true, value: undefined }),
  listProjects: async () => ({ ok: true, value: [] }),
};
const secrets = createSecretBox(new Map([[1, randomBytes(32)]]));

let db: PrismaClient;
let app: FastifyInstance;
let elke: Session;

/** Sets `integrations.todoist` on the current config version via the real admin route. */
async function setTodoistConfig(
  priority: number | null,
): Promise<void> {
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
      values: {
        ...body.values,
        integrations: { todoist: { enabled: true, priority } },
      },
    },
  });
  expect(res.statusCode, res.body).toBe(200);
}

beforeAll(async () => {
  db = testDb();
  await dropHousehold(db, ids);
  await createHousehold(db, ids, {
    members: [{ key: 'elke', displayName: 'Elke', role: 'ADMIN' }],
    definitions: [{ key: 'bad', title: 'Bad putzen', baseValue: VALUE }],
  });

  app = await buildTestServer(db, {}, { todoist: fakeTodoist, secrets });
  elke = await login(app, ids, 'elke');
});

afterAll(async () => {
  await app?.close();
  await dropHousehold(db, ids);
  await db?.$disconnect();
});

test('a household with a configured priority produces outbox payloads and item_add commands carrying it', async () => {
  await setTodoistConfig(4); // API value 4 = urgent (Todoist UI "P1").

  const connected = await app.inject({
    method: 'PUT',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { token: 'irrelevant-fake-token' },
  });
  expect(connected.statusCode, connected.body).toBe(200);

  const instanceId = await createAvailableInstance(db, ids, 'bad', VALUE);
  const volunteered = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/volunteer`,
    headers: authHeaders(elke),
  });
  expect(volunteered.statusCode, volunteered.body).toBe(200);

  // Reconcile, then dispatch — same order the worker uses, so a freshly
  // volunteered chore reaches Todoist in one pass.
  const deps = { ...testDeps(db), todoist: fakeTodoist, secrets };
  const reconciled = await runReconciliation(deps, { householdId: ids.householdId });
  expect(reconciled.enqueued).toBe(1);

  const outboxRow = await db.integrationOutbox.findFirstOrThrow({
    where: { householdId: ids.householdId, operation: 'CREATE_TASK' },
    select: { payload: true },
  });
  expect((outboxRow.payload as Record<string, unknown>).priority).toBe(4);

  createTaskCalls.length = 0;
  const dispatched = await dispatchOutbox(deps, { householdId: ids.householdId });
  expect(dispatched.sent).toBe(1);

  expect(createTaskCalls).toHaveLength(1);
  expect(createTaskCalls[0]?.priority).toBe(4);
});

test('a household with no configured priority sends no priority argument at all (default preserved)', async () => {
  await setTodoistConfig(null);

  // Self-contained rather than relying on the previous test's connection:
  // `connectTodoist`'s DB write is an upsert (connectTodoist.ts), so
  // reconnecting the same member is safe and idempotent.
  const connected = await app.inject({
    method: 'PUT',
    url: '/api/integrations/todoist',
    headers: authHeaders(elke),
    payload: { token: 'irrelevant-fake-token' },
  });
  expect(connected.statusCode, connected.body).toBe(200);

  const instanceId = await createAvailableInstance(db, ids, 'bad', VALUE);
  const volunteered = await app.inject({
    method: 'POST',
    url: `/api/tasks/${instanceId}/volunteer`,
    headers: authHeaders(elke),
  });
  expect(volunteered.statusCode, volunteered.body).toBe(200);

  const deps = { ...testDeps(db), todoist: fakeTodoist, secrets };
  const reconciled = await runReconciliation(deps, { householdId: ids.householdId });
  expect(reconciled.enqueued).toBe(1);

  const outboxRow = await db.integrationOutbox.findFirstOrThrow({
    where: { householdId: ids.householdId, operation: 'CREATE_TASK', taskInstanceId: instanceId },
    select: { payload: true },
  });
  expect((outboxRow.payload as Record<string, unknown>).priority).toBeNull();

  createTaskCalls.length = 0;
  const dispatched = await dispatchOutbox(deps, { householdId: ids.householdId });
  expect(dispatched.sent).toBe(1);

  expect(createTaskCalls).toHaveLength(1);
  // `undefined`, not `null`: `CreateTaskCommand.priority` is `number | undefined`
  // (`exactOptionalPropertyTypes`), and `dispatchOutbox.ts` only spreads the key
  // in when `payload.priority !== undefined` — a `null` payload value must not
  // leak through as a literal `null` argument to Todoist.
  expect(createTaskCalls[0]?.priority).toBeUndefined();
  expect('priority' in (createTaskCalls[0] ?? {})).toBe(false);
});
