/**
 * The Web Push dispatcher (push-notifications §Architekturvorschlag, Phase 2
 * — rollback-safety fix).
 *
 * Modeled loosely on `app/integrations/dispatchOutbox.ts`, but deliberately
 * far simpler: no retries, no backoff, no per-row status machine, no
 * `DEAD`/`ORPHANED` terminal states. Push is best-effort (research doc) —
 * losing one on a transient failure is an accepted outcome, not a bug, so
 * every claimed row gets exactly one delivery attempt and is then deleted
 * regardless of outcome. There is nothing to retry into.
 *
 * **Claim step is intentionally NOT scoped by household.** Every other
 * query in this file goes through Prisma Client with an explicit
 * `householdId` predicate (`eslint-rules/index.js`'s `household-scope` rule
 * enforces this — `pushOutboxItem` is in its `SCOPED_MODELS` set). The
 * initial claim is different on purpose: it is a genuine cross-household
 * background read — "the oldest 50 outbox rows across every household" —
 * comparable to `startSweepWorker`'s own `db.household.findMany()` (which
 * only works because `household` itself is exempt from the rule, being the
 * scope rather than something scoped). Raw SQL is this codebase's
 * established escape hatch for exactly that shape of query — `tx.ts`'s
 * `lockOutboxBatch` documents the same reasoning ("die
 * household-scope-ESLint-Regel greift bei Roh-SQL NICHT ... die Disziplin
 * muss also hier im Code stehen") — so the claim uses `$queryRaw` here too,
 * and every row it returns is immediately partitioned by `householdId`
 * before anything else touches it.
 *
 * **No `SELECT … FOR UPDATE` / `SKIP LOCKED` ceremony**, unlike
 * `lockOutboxBatch`. Two overlapping dispatch passes could claim the same
 * row and send it twice — a mild UX annoyance (a member sees one duplicate
 * push), not a correctness violation, since nothing here is charged against
 * a ledger or changes task state. This codebase already accepts "exactly
 * one reconciler process" as a documented *operational* constraint rather
 * than a technical guarantee elsewhere (`SWEEP_INTERVAL_SECONDS=0` /
 * `TODOIST_INTERVAL_SECONDS=0`'s module docs) — the same acceptance applies
 * here, and deliberately is not re-litigated with a lock.
 */

import type { PrismaClient } from '@prisma/client';

import { parseConfig } from '@haushaltsauktion/shared';

import type { Deps, Logger } from '../deps.js';
import type { PushSender } from '../integrations/ports.js';

const BATCH_LIMIT = 50;

export interface DispatchPushOutboxOutcome {
  claimed: number;
  delivered: number;
  skippedHouseholdDisabled: number;
}

interface ClaimedRow {
  id: string;
  householdId: string;
  memberId: string;
  type: string;
  payload: unknown;
  taskInstanceId: string | null;
}

/**
 * One dispatch pass, across every household. Wrapped per-household in its
 * own try/catch — a bad config row or a broken query for one household must
 * not stop delivery for the rest, same discipline as `worker.ts`'s sweep
 * tick and `todoist-worker.ts`'s dispatch tick.
 */
export async function dispatchPushOutbox(deps: Deps): Promise<DispatchPushOutboxOutcome> {
  const outcome: DispatchPushOutboxOutcome = { claimed: 0, delivered: 0, skippedHouseholdDisabled: 0 };
  if (deps.push === undefined) return outcome;
  const push = deps.push;

  const claimed = await deps.db.$queryRaw<ClaimedRow[]>`
    SELECT id,
           household_id     AS "householdId",
           member_id        AS "memberId",
           type,
           payload,
           task_instance_id AS "taskInstanceId"
      FROM push_outbox_items
     ORDER BY created_at ASC
     LIMIT ${BATCH_LIMIT}`;
  outcome.claimed = claimed.length;
  if (claimed.length === 0) return outcome;

  const byHousehold = new Map<string, ClaimedRow[]>();
  for (const row of claimed) {
    const list = byHousehold.get(row.householdId);
    if (list === undefined) byHousehold.set(row.householdId, [row]);
    else list.push(row);
  }

  for (const [householdId, rows] of byHousehold) {
    try {
      await dispatchForHousehold(deps.db, push, deps.logger, householdId, rows, outcome);
    } catch (error) {
      deps.logger.error({ err: error, householdId }, 'push outbox: Zustellung für Haushalt fehlgeschlagen');
    }
  }

  return outcome;
}

async function dispatchForHousehold(
  db: PrismaClient,
  push: PushSender,
  logger: Logger,
  householdId: string,
  rows: readonly ClaimedRow[],
  outcome: DispatchPushOutboxOutcome,
): Promise<void> {
  const enabled = await isPushEnabled(db, logger, householdId);
  const ids = rows.map((r) => r.id);

  if (!enabled) {
    // Nothing to deliver, and no reason to let the table grow — rows for a
    // disabled household are deleted, not retried, same as every other row.
    await db.pushOutboxItem.deleteMany({ where: { householdId, id: { in: ids } } });
    outcome.skippedHouseholdDisabled += rows.length;
    return;
  }

  const instanceIds = [
    ...new Set(rows.map((r) => r.taskInstanceId).filter((id): id is string => id !== null && id.length > 0)),
  ];
  const titleByInstanceId = await loadTaskTitles(db, logger, householdId, instanceIds);

  for (const row of rows) {
    await deliverToMember(push, db, logger, row, titleByInstanceId);
    outcome.delivered += 1;
  }

  // Deleted after every attempt, success or not — best-effort, no retry.
  await db.pushOutboxItem.deleteMany({ where: { householdId, id: { in: ids } } });
}

/**
 * Household-level gate, read fresh (never cached) so an admin flipping
 * `notifications.pushEnabled` takes effect on the very next dispatch pass,
 * not just for outbox rows enqueued after the change.
 */
async function isPushEnabled(db: PrismaClient, logger: Logger, householdId: string): Promise<boolean> {
  try {
    const row = await db.householdConfiguration.findFirst({
      where: { householdId },
      orderBy: { version: 'desc' },
      select: { values: true },
    });
    if (row === null) return false;
    const config = parseConfig(row.values);
    return config.notifications.pushEnabled === true;
  } catch (error) {
    logger.warn({ householdId, error }, 'push outbox: Haushaltskonfiguration konnte nicht gelesen werden');
    return false;
  }
}

/**
 * One `taskInstanceId -> definition title` lookup per household batch.
 * `householdId` is part of the predicate — Architektur §3.2/§36's mechanical
 * rule the `household-scope` lint rule enforces.
 */
async function loadTaskTitles(
  db: PrismaClient,
  logger: Logger,
  householdId: string,
  instanceIds: readonly string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (instanceIds.length === 0) return titles;
  try {
    const instances = await db.taskInstance.findMany({
      where: { householdId, id: { in: [...instanceIds] } },
      select: { id: true, definition: { select: { title: true } } },
    });
    for (const instance of instances) titles.set(instance.id, instance.definition.title);
  } catch (error) {
    logger.warn({ householdId, error }, 'push outbox: Aufgabentitel konnten nicht geladen werden');
  }
  return titles;
}

async function deliverToMember(
  push: PushSender,
  db: PrismaClient,
  logger: Logger,
  row: ClaimedRow,
  titleByInstanceId: ReadonlyMap<string, string>,
): Promise<void> {
  let subscriptions;
  try {
    subscriptions = await db.pushSubscription.findMany({ where: { memberId: row.memberId } });
  } catch (error) {
    logger.warn({ memberId: row.memberId, error }, 'push outbox: Subscriptions konnten nicht geladen werden');
    return;
  }
  if (subscriptions.length === 0) return;

  // Small, wire-bound payload — enough for the service worker's `push`
  // handler to render a notification that reads the same as the in-app one
  // (`de.notifications.types[type]` interpolated with `taskTitle`/`payload`).
  const wirePayload = {
    type: row.type,
    taskInstanceId: row.taskInstanceId,
    taskTitle: row.taskInstanceId !== null ? (titleByInstanceId.get(row.taskInstanceId) ?? null) : null,
    payload: row.payload,
  };

  // Fan-out: a member may have several devices subscribed.
  for (const subscription of subscriptions) {
    try {
      const result = await push.send(
        { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
        wirePayload,
      );
      if (!result.ok && result.gone) {
        try {
          await db.pushSubscription.delete({ where: { id: subscription.id } });
        } catch {
          // Best-effort — may already be gone (a concurrent send to another
          // device of the same member could have raced this delete).
        }
      }
    } catch (error) {
      // `PushSender.send` is documented to never throw, but this dispatcher's
      // entire job is to survive even if that contract is violated — no
      // retry, the row is deleted by the caller regardless.
      logger.warn({ endpoint: subscription.endpoint, error }, 'push outbox: Zustellversuch warf unerwartet einen Fehler');
    }
  }
}
