/**
 * Connect, update, test and disconnect a member's Todoist account
 * (Architektur Todoist §3.4, §10).
 *
 * Every use-case here is **self-scoped**: the member id comes from the proved
 * session context, never from a path parameter, so there is no addressable
 * route by which an admin could reach another adult's credential. A personal
 * Todoist token grants full access to that person's account (§36), which is why
 * the split matters more than it might look.
 */

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors.js';
import type { Deps } from '../deps.js';
import { writeAudit } from '../events.js';
import {
  disconnectedView,
  readTodoistIntegration,
  readTriggers,
  type TodoistIntegrationView,
} from '../queries/integrationReads.js';

export interface MemberScope {
  householdId: string;
  memberId: string;
}

/** Household-level switch. Read at the current version — it is a kill switch. */
async function assertHouseholdEnabled(deps: Deps, householdId: string): Promise<void> {
  const row = await deps.db.householdConfiguration.findFirst({
    where: { householdId },
    orderBy: { version: 'desc' },
    select: { values: true },
  });
  const values = (row?.values ?? {}) as Record<string, unknown>;
  const integrations = (values.integrations ?? {}) as Record<string, unknown>;
  const todoist = (integrations.todoist ?? {}) as Record<string, unknown>;
  if (todoist.enabled !== true) {
    throw new ConflictError(
      'INTEGRATION_DISABLED',
      'Die Todoist-Integration ist für diesen Haushalt nicht aktiviert.',
    );
  }
}

function requirePorts(deps: Deps): { todoist: NonNullable<Deps['todoist']>; secrets: NonNullable<Deps['secrets']> } {
  if (deps.todoist === undefined || deps.secrets === undefined) {
    // No encryption key configured on the server. A member-facing error, not a
    // crash: this is an operator gap, and the message should say so.
    throw new ConflictError(
      'INTEGRATION_DISABLED',
      'Integrationen sind auf diesem Server nicht konfiguriert.',
    );
  }
  return { todoist: deps.todoist, secrets: deps.secrets };
}

export async function connectTodoist(
  deps: Deps,
  input: MemberScope & { token: string; ipAddress?: string | null },
): Promise<TodoistIntegrationView> {
  const token = input.token.trim();
  if (token === '') {
    throw new ValidationError('VALIDATION_FAILED', 'Ein Token ist erforderlich.', {
      fieldErrors: [{ path: 'token', message: 'Token darf nicht leer sein.' }],
    });
  }
  await assertHouseholdEnabled(deps, input.householdId);
  const { todoist, secrets } = requirePorts(deps);

  // Probe before storing. Saving a token that does not work would leave the
  // member believing they are connected while every dispatch quietly fails —
  // the invisible-failure mode this design keeps trying to eliminate.
  const probe = await todoist.listProjects(token);
  if (!probe.ok) {
    if (probe.failure.kind === 'PERMANENT_AUTH') {
      throw new ValidationError('INTEGRATION_UNAUTHORIZED', 'Todoist hat dieses Token abgelehnt.', {
        fieldErrors: [{ path: 'token', message: 'Token ungültig oder abgelaufen.' }],
      });
    }
    throw new ConflictError(
      'INTEGRATION_UNAVAILABLE',
      'Todoist ist gerade nicht erreichbar. Bitte später erneut versuchen.',
    );
  }

  const sealed = secrets.seal(token);
  const hint = token.length < 8 ? '' : token.slice(-4);
  const now = deps.clock.now();

  await deps.db.$transaction(async (tx) => {
    await tx.memberIntegration.upsert({
      where: {
        householdId_memberId_provider: {
          householdId: input.householdId,
          memberId: input.memberId,
          provider: 'TODOIST',
        },
      },
      create: {
        householdId: input.householdId,
        memberId: input.memberId,
        provider: 'TODOIST',
        status: 'ACTIVE',
        tokenCiphertext: Buffer.from(sealed.ciphertext),
        tokenIv: Buffer.from(sealed.iv),
        tokenAuthTag: Buffer.from(sealed.authTag),
        tokenKeyVersion: sealed.keyVersion,
        tokenHint: hint,
      },
      update: {
        // Reconnecting revives a DISABLED row and clears the previous failure,
        // so a member who fixes their token is not left looking broken.
        status: 'ACTIVE',
        tokenCiphertext: Buffer.from(sealed.ciphertext),
        tokenIv: Buffer.from(sealed.iv),
        tokenAuthTag: Buffer.from(sealed.authTag),
        tokenKeyVersion: sealed.keyVersion,
        tokenHint: hint,
        lastErrorAt: null,
        lastErrorCode: null,
      },
    });

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'MEMBER',
      actorMemberId: input.memberId,
      action: 'INTEGRATION_CONNECTED',
      entityType: 'MemberIntegration',
      // Never the token, never the hint.
      payload: { provider: 'TODOIST', at: now.toISOString() },
      ipAddress: input.ipAddress ?? null,
    });
  });

  return readTodoistIntegration(deps.db, input.householdId, input.memberId);
}

export async function updateTodoistSettings(
  deps: Deps,
  input: MemberScope & {
    projectId?: string | null;
    triggers?: unknown;
    ipAddress?: string | null;
  },
): Promise<TodoistIntegrationView> {
  const existing = await deps.db.memberIntegration.findFirst({
    where: { householdId: input.householdId, memberId: input.memberId, provider: 'TODOIST' },
    select: { id: true, status: true },
  });
  if (existing === null || existing.status === 'DISABLED') {
    throw new NotFoundError('Keine Todoist-Verbindung vorhanden.');
  }

  const data: Record<string, unknown> = {};
  if (input.projectId !== undefined) {
    data.projectId = input.projectId;
    // The name is a display cache; it is refreshed by the next successful
    // project listing rather than trusted from the client.
    data.projectName = null;
  }
  if (input.triggers !== undefined) {
    // Normalised through the same reader the reconciler uses, so a client can
    // never write a shape the reconciler would silently read as "off".
    data.triggers = readTriggers(input.triggers);
  }

  if (Object.keys(data).length > 0) {
    await deps.db.$transaction(async (tx) => {
      await tx.memberIntegration.updateMany({
        where: { id: existing.id, householdId: input.householdId },
        data,
      });
      await writeAudit(tx, {
        householdId: input.householdId,
        actorType: 'MEMBER',
        actorMemberId: input.memberId,
        action: 'INTEGRATION_SETTINGS_UPDATED',
        entityType: 'MemberIntegration',
        payload: { provider: 'TODOIST', ...data },
        ipAddress: input.ipAddress ?? null,
      });
    });
  }

  return readTodoistIntegration(deps.db, input.householdId, input.memberId);
}

/**
 * Disconnect: flush, scrub, force-close (§3.4).
 *
 * The order is load-bearing. The flush must precede the scrub because the token
 * dies in step 2; the force-close must follow it because its whole premise is
 * that no CLOSE can ever be delivered again. An earlier design nulled the token
 * and left the links open, which is unrecoverable by construction — the
 * reconciler would propose closes forever that could never succeed.
 */
export async function disconnectTodoist(
  deps: Deps,
  input: MemberScope & { ipAddress?: string | null },
): Promise<TodoistIntegrationView> {
  const existing = await deps.db.memberIntegration.findFirst({
    where: { householdId: input.householdId, memberId: input.memberId, provider: 'TODOIST' },
    select: { id: true, status: true, tokenCiphertext: true, tokenIv: true, tokenAuthTag: true, tokenKeyVersion: true },
  });
  if (existing === null) return disconnectedView();

  const now = deps.clock.now();

  // ── 1. best-effort flush, while the token still works ──────────────────
  let flushed = 0;
  let flushFailed = 0;
  const canFlush =
    deps.todoist !== undefined &&
    deps.secrets !== undefined &&
    existing.status === 'ACTIVE' &&
    existing.tokenCiphertext !== null &&
    existing.tokenIv !== null &&
    existing.tokenAuthTag !== null &&
    existing.tokenKeyVersion !== null;

  if (canFlush) {
    const openLinks = await deps.db.integrationTaskLink.findMany({
      where: { householdId: input.householdId, integrationId: existing.id, closedAt: null },
      select: { externalTaskId: true },
      take: 100,
    });
    if (openLinks.length > 0) {
      try {
        const token = deps.secrets!.open({
          ciphertext: existing.tokenCiphertext!,
          iv: existing.tokenIv!,
          authTag: existing.tokenAuthTag!,
          keyVersion: existing.tokenKeyVersion!,
        });
        for (const link of openLinks) {
          const result = await deps.todoist!.closeTask(token, {
            commandUuid: globalThis.crypto.randomUUID(),
            externalTaskId: link.externalTaskId,
          });
          if (result.ok || result.failure.kind === 'BENIGN_GONE') flushed += 1;
          else flushFailed += 1;
        }
      } catch (error) {
        // Never block the disconnect on a third party. The member asked to
        // leave; they leave.
        deps.logger.warn({ err: error }, 'todoist disconnect flush failed');
        flushFailed = openLinks.length - flushed;
      }
    }
  }

  // ── 2 + 3. scrub and force-close, atomically ───────────────────────────
  await deps.db.$transaction(async (tx) => {
    await tx.memberIntegration.updateMany({
      where: { id: existing.id, householdId: input.householdId },
      data: {
        status: 'DISABLED',
        // The credential is genuinely destroyed. The row survives so the
        // foreign keys from outbox and link rows stay valid.
        tokenCiphertext: null,
        tokenIv: null,
        tokenAuthTag: null,
        tokenKeyVersion: null,
        tokenHint: null,
      },
    });
    await tx.integrationTaskLink.updateMany({
      where: { householdId: input.householdId, integrationId: existing.id, closedAt: null },
      data: { closedAt: now, closeReason: 'DISCONNECTED' },
    });
    await tx.integrationOutbox.updateMany({
      where: {
        householdId: input.householdId,
        integrationId: existing.id,
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'SKIPPED', settledAt: now },
    });
    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'MEMBER',
      actorMemberId: input.memberId,
      action: 'INTEGRATION_DISCONNECTED',
      entityType: 'MemberIntegration',
      payload: { provider: 'TODOIST', flushed, flushFailed },
      ipAddress: input.ipAddress ?? null,
    });
  });

  return disconnectedView();
}

export async function testTodoistConnection(
  deps: Deps,
  input: MemberScope,
): Promise<{ ok: boolean; projectCount: number }> {
  const { todoist, secrets } = requirePorts(deps);
  const row = await deps.db.memberIntegration.findFirst({
    where: { householdId: input.householdId, memberId: input.memberId, provider: 'TODOIST' },
    select: {
      id: true,
      status: true,
      projectId: true,
      tokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
      tokenKeyVersion: true,
    },
  });
  if (
    row === null ||
    row.status === 'DISABLED' ||
    row.tokenCiphertext === null ||
    row.tokenIv === null ||
    row.tokenAuthTag === null ||
    row.tokenKeyVersion === null
  ) {
    throw new NotFoundError('Keine Todoist-Verbindung vorhanden.');
  }

  const token = secrets.open({
    ciphertext: row.tokenCiphertext,
    iv: row.tokenIv,
    authTag: row.tokenAuthTag,
    keyVersion: row.tokenKeyVersion,
  });
  const result = await todoist.listProjects(token);

  if (!result.ok) {
    if (result.failure.kind === 'PERMANENT_AUTH') {
      // Record the cause, which is also what removes the integration from the
      // reconciler's desired set — suppression comes from the cause.
      await deps.db.memberIntegration.updateMany({
        where: { id: row.id, householdId: input.householdId },
        data: {
          status: 'INVALID_CREDENTIALS',
          lastErrorAt: deps.clock.now(),
          lastErrorCode: result.failure.errorTag ?? 'AUTH',
        },
      });
      throw new ForbiddenError('INTEGRATION_UNAUTHORIZED', 'Todoist hat dieses Token abgelehnt.');
    }
    throw new ConflictError('INTEGRATION_UNAVAILABLE', 'Todoist ist gerade nicht erreichbar.');
  }

  // Refresh the display cache for the selected project, if it still exists.
  const selected = result.value.find((project) => project.id === row.projectId);
  await deps.db.memberIntegration.updateMany({
    where: { id: row.id, householdId: input.householdId },
    data: {
      lastSuccessAt: deps.clock.now(),
      lastErrorCode: null,
      projectName: selected?.name ?? null,
    },
  });

  return { ok: true, projectCount: result.value.length };
}

export async function listTodoistProjects(
  deps: Deps,
  input: MemberScope,
): Promise<{ projects: { id: string; name: string }[] }> {
  const { todoist, secrets } = requirePorts(deps);
  const row = await deps.db.memberIntegration.findFirst({
    where: { householdId: input.householdId, memberId: input.memberId, provider: 'TODOIST' },
    select: {
      status: true,
      tokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
      tokenKeyVersion: true,
    },
  });
  if (
    row === null ||
    row.status === 'DISABLED' ||
    row.tokenCiphertext === null ||
    row.tokenIv === null ||
    row.tokenAuthTag === null ||
    row.tokenKeyVersion === null
  ) {
    throw new NotFoundError('Keine Todoist-Verbindung vorhanden.');
  }

  const token = secrets.open({
    ciphertext: row.tokenCiphertext,
    iv: row.tokenIv,
    authTag: row.tokenAuthTag,
    keyVersion: row.tokenKeyVersion,
  });
  const result = await todoist.listProjects(token);
  if (!result.ok) {
    if (result.failure.kind === 'PERMANENT_AUTH') {
      throw new ForbiddenError('INTEGRATION_UNAUTHORIZED', 'Todoist hat dieses Token abgelehnt.');
    }
    throw new ConflictError('INTEGRATION_UNAVAILABLE', 'Todoist ist gerade nicht erreichbar.');
  }
  return { projects: result.value.map((p) => ({ id: p.id, name: p.name })) };
}
