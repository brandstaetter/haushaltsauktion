/**
 * The dispatcher (Architektur Todoist §8).
 *
 * **Three transactions, with the HTTP call outside all of them.** Tx A claims
 * due rows; the Todoist request runs with no transaction open and no locks held;
 * Tx B records the outcome. That shape is the whole reason a Todoist outage
 * cannot touch §28's atomicity guarantees for volunteer / buyout / completion —
 * an earlier design put the call inside the caller's transaction and would have
 * held a row lock across a third-party round trip.
 *
 * The one subtle mapping is `ACCEPTED_WITHOUT_ID` → `ORPHANED`. Todoist accepted
 * the command but returned no id, so the task exists and we have irrecoverably
 * lost the only handle to it. `ORPHANED` is the single **absorbing** terminal
 * state: re-proposing could not repair anything, it could only create a second
 * task, because a retry would carry a fresh command `uuid` and Todoist dedups on
 * the `uuid`. Absorbing is correct here precisely because the cause cannot
 * become false — unlike an exhausted retry ladder or a briefly inactive member,
 * which must heal.
 */

import type { OutboxStatus } from '@prisma/client';

import type { Deps } from '../deps.js';
import { lockIntegration, lockOutboxBatch, withTransaction } from '../tx.js';

const BATCH_LIMIT = 20;
const MAX_ATTEMPTS = 8;
/** 1, 2, 4, 8, 16, 32, then capped. Minutes. */
const BACKOFF_MINUTES = [1, 2, 4, 8, 16, 32, 60] as const;

function backoffMinutes(attempts: number): number {
  const index = Math.min(attempts, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index] ?? 60;
}

export interface DispatchOutcome {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
  orphaned: number;
}

interface OutboxPayload {
  content?: unknown;
  description?: unknown;
  dueAt?: unknown;
  timezone?: unknown;
  priority?: unknown;
  projectId?: unknown;
}

function readPayload(raw: unknown): {
  content: string;
  description: string;
  dueAt: Date | null;
  timezone: string;
  priority: number | undefined;
  projectId: string | null;
} {
  const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as OutboxPayload;
  const dueRaw = payload.dueAt;
  const parsedDue = typeof dueRaw === 'string' ? new Date(dueRaw) : null;
  return {
    content: typeof payload.content === 'string' ? payload.content : '',
    description: typeof payload.description === 'string' ? payload.description : '',
    dueAt: parsedDue !== null && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null,
    timezone: typeof payload.timezone === 'string' ? payload.timezone : 'UTC',
    priority: typeof payload.priority === 'number' ? payload.priority : undefined,
    projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
  };
}

/**
 * One dispatch pass for one household. Serial by design: at a family's volume
 * the rate limits are two orders of magnitude above need, so the dispatcher
 * optimises for gentleness and legibility rather than throughput.
 */
export async function dispatchOutbox(
  deps: Deps,
  input: { householdId: string },
): Promise<DispatchOutcome> {
  const outcome: DispatchOutcome = {
    claimed: 0,
    sent: 0,
    failed: 0,
    dead: 0,
    skipped: 0,
    orphaned: 0,
  };
  if (deps.todoist === undefined || deps.secrets === undefined) return outcome;
  const todoist = deps.todoist;
  const secrets = deps.secrets;

  // ── Tx A: claim ──────────────────────────────────────────────────────────
  const claimed = await withTransaction(deps, async (tx) =>
    lockOutboxBatch(tx, input.householdId, deps.clock.now(), BATCH_LIMIT),
  );
  outcome.claimed = claimed.length;

  for (const row of claimed) {
    // Eligibility is re-checked here as a *race guard only*; the desired-state
    // predicate owns the decision. A row whose member or integration became
    // ineligible since reconciliation is skipped, not failed — and because the
    // live-key index is partial, SKIPPED does not block a later re-proposal.
    const context = await withTransaction(deps, async (tx) => {
      const integration = await lockIntegration(tx, input.householdId, row.integrationId);
      if (integration === null) return null;
      const member = await tx.householdMember.findFirst({
        where: { id: row.memberId, householdId: input.householdId },
        select: { isActive: true },
      });
      const credential = await tx.memberIntegration.findFirst({
        where: { id: row.integrationId, householdId: input.householdId },
        select: {
          tokenCiphertext: true,
          tokenIv: true,
          tokenAuthTag: true,
          tokenKeyVersion: true,
          projectId: true,
        },
      });
      return { integration, memberActive: member?.isActive === true, credential };
    });

    const usable =
      context !== null &&
      context.memberActive &&
      context.integration.status === 'ACTIVE' &&
      context.credential !== null &&
      context.credential.tokenCiphertext !== null &&
      context.credential.tokenIv !== null &&
      context.credential.tokenAuthTag !== null &&
      context.credential.tokenKeyVersion !== null;

    if (!usable) {
      await settle(deps, input.householdId, row.id, 'SKIPPED', {});
      outcome.skipped += 1;
      continue;
    }

    let token: string;
    try {
      token = secrets.open({
        ciphertext: context.credential!.tokenCiphertext!,
        iv: context.credential!.tokenIv!,
        authTag: context.credential!.tokenAuthTag!,
        keyVersion: context.credential!.tokenKeyVersion!,
      });
    } catch (error) {
      // A key that cannot open the row is an operator problem (rotation window
      // closed too early), not the member's fault. Transient: a restart with the
      // right keyring fixes it, and DEAD would be a lie.
      deps.logger.error({ err: error, outboxId: row.id }, 'todoist token undecryptable');
      await retryLater(deps, input.householdId, row.id, row.attempts, undefined, 'KEY_UNAVAILABLE');
      outcome.failed += 1;
      continue;
    }

    const payload = readPayload(row.payload);

    // ── the HTTP call: no transaction open, no locks held ──────────────────
    if (row.operation === 'CREATE_TASK') {
      const result = await todoist.createTask(token, {
        commandUuid: row.id,
        content: payload.content,
        description: payload.description,
        projectId: payload.projectId ?? context.credential!.projectId ?? null,
        dueAt: payload.dueAt,
        timezone: payload.timezone,
        ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
      });

      if (!result.ok) {
        await applyFailure(deps, input.householdId, row, result.failure, outcome);
        continue;
      }
      if (result.value.kind === 'ACCEPTED_WITHOUT_ID') {
        await settle(deps, input.householdId, row.id, 'ORPHANED', {
          lastErrorCode: 'ID_UNRECOVERABLE',
        });
        outcome.orphaned += 1;
        continue;
      }

      const externalTaskId = result.value.externalTaskId;
      await withTransaction(deps, async (tx) => {
        await lockIntegration(tx, input.householdId, row.integrationId);
        await tx.integrationOutbox.updateMany({
          where: { id: row.id, householdId: input.householdId },
          data: { status: 'SENT', settledAt: deps.clock.now(), externalTaskId },
        });
        // The durable id mapping. Written only after a confirmed create, which
        // is what keeps IntegrationTaskLink.externalTaskId NOT NULL honest.
        await tx.integrationTaskLink.upsert({
          where: {
            householdId_assignmentId: {
              householdId: input.householdId,
              assignmentId: row.assignmentId,
            },
          },
          create: {
            householdId: input.householdId,
            memberId: row.memberId,
            integrationId: row.integrationId,
            taskInstanceId: row.taskInstanceId,
            assignmentId: row.assignmentId,
            externalTaskId,
          },
          update: { externalTaskId, closedAt: null, closeReason: null },
        });
        await tx.memberIntegration.updateMany({
          where: { id: row.integrationId, householdId: input.householdId },
          data: { lastSuccessAt: deps.clock.now(), lastErrorCode: null },
        });
      });
      outcome.sent += 1;
      continue;
    }

    // CLOSE_TASK
    const externalTaskId = row.externalTaskId;
    if (externalTaskId === null || externalTaskId === '') {
      // Should be unreachable: the reconciler only proposes a close for a link
      // that already carries an id. Treated as SKIPPED rather than DEAD so a
      // later pass can retry if the link appears.
      await settle(deps, input.householdId, row.id, 'SKIPPED', { lastErrorCode: 'NO_EXTERNAL_ID' });
      outcome.skipped += 1;
      continue;
    }

    const result = await todoist.closeTask(token, { commandUuid: row.id, externalTaskId });
    if (!result.ok && result.failure.kind !== 'BENIGN_GONE') {
      await applyFailure(deps, input.householdId, row, result.failure, outcome);
      continue;
    }

    // Success, or the task was already gone from Todoist — both mean "closed".
    await withTransaction(deps, async (tx) => {
      await lockIntegration(tx, input.householdId, row.integrationId);
      await tx.integrationOutbox.updateMany({
        where: { id: row.id, householdId: input.householdId },
        data: { status: 'SENT', settledAt: deps.clock.now() },
      });
      await tx.integrationTaskLink.updateMany({
        where: { householdId: input.householdId, assignmentId: row.assignmentId, closedAt: null },
        data: { closedAt: deps.clock.now(), closeReason: 'RECONCILED' },
      });
    });
    outcome.sent += 1;
  }

  return outcome;
}

async function applyFailure(
  deps: Deps,
  householdId: string,
  row: { id: string; attempts: number; integrationId: string },
  failure: { kind: string; retryAfterSeconds?: number | undefined; errorTag?: string | undefined; message: string },
  outcome: DispatchOutcome,
): Promise<void> {
  if (failure.kind === 'PERMANENT_AUTH') {
    // Suppression comes from the cause: marking the integration
    // INVALID_CREDENTIALS removes it from the desired set, so nothing is
    // re-proposed. No absorbing outbox row is needed or wanted.
    await withTransaction(deps, async (tx) => {
      await lockIntegration(tx, householdId, row.integrationId);
      await tx.integrationOutbox.updateMany({
        where: { id: row.id, householdId },
        data: {
          status: 'DEAD',
          settledAt: deps.clock.now(),
          lastErrorCode: failure.errorTag ?? 'AUTH',
          lastErrorBody: failure.message.slice(0, 500),
        },
      });
      await tx.memberIntegration.updateMany({
        where: { id: row.integrationId, householdId },
        data: {
          status: 'INVALID_CREDENTIALS',
          lastErrorAt: deps.clock.now(),
          lastErrorCode: failure.errorTag ?? 'AUTH',
        },
      });
    });
    outcome.dead += 1;
    return;
  }

  if (failure.kind === 'PERMANENT_REQUEST') {
    // Our bug, not their token: the integration is deliberately left untouched.
    // The reconciler's 3-DEAD cap is what stops this looping invisibly.
    await settle(deps, householdId, row.id, 'DEAD', {
      lastErrorCode: failure.errorTag ?? 'BAD_REQUEST',
      lastErrorBody: failure.message.slice(0, 500),
    });
    outcome.dead += 1;
    return;
  }

  // TRANSIENT
  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await settle(deps, householdId, row.id, 'DEAD', {
      lastErrorCode: failure.errorTag ?? 'TRANSIENT_EXHAUSTED',
      lastErrorBody: failure.message.slice(0, 500),
    });
    outcome.dead += 1;
    return;
  }
  await retryLater(
    deps,
    householdId,
    row.id,
    row.attempts,
    failure.retryAfterSeconds,
    failure.errorTag ?? 'TRANSIENT',
  );
  outcome.failed += 1;
}

async function retryLater(
  deps: Deps,
  householdId: string,
  outboxId: string,
  attempts: number,
  retryAfterSeconds: number | undefined,
  errorCode: string,
): Promise<void> {
  const now = deps.clock.now();
  // `Retry-After` overrides the computed backoff when present — and its absence
  // must fall through to the computed value, never to NaN.
  const delayMs =
    retryAfterSeconds !== undefined
      ? retryAfterSeconds * 1000
      : backoffMinutes(attempts) * 60_000;
  await deps.db.integrationOutbox.updateMany({
    where: { id: outboxId, householdId },
    data: {
      status: 'FAILED',
      attempts: attempts + 1,
      nextAttemptAt: new Date(now.getTime() + delayMs),
      lastErrorCode: errorCode,
    },
  });
}

async function settle(
  deps: Deps,
  householdId: string,
  outboxId: string,
  status: OutboxStatus,
  extra: { lastErrorCode?: string; lastErrorBody?: string },
): Promise<void> {
  await deps.db.integrationOutbox.updateMany({
    where: { id: outboxId, householdId },
    data: { status, settledAt: deps.clock.now(), ...extra },
  });
}
