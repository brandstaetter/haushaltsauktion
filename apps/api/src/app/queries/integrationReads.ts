/**
 * The member-facing view of their own integration (Architektur Todoist §10).
 *
 * **This file is the reason the token cannot leak.** Every route returns
 * `TodoistIntegrationView` and nothing else, and the `select` below names each
 * column explicitly — the ciphertext, IV, auth tag and key version are simply
 * never read, so they cannot be forgotten in a spread or picked up by a later
 * `include`.
 *
 * `tokenHint` (last 4 characters, stored in plaintext deliberately) exists so
 * the UI can say "Verbunden · …a3f9" without anything ever decrypting a secret
 * to render a screen.
 */

import type { PrismaClient } from '@prisma/client';

/** Exactly what a member may see about their own connection. */
export interface TodoistIntegrationView {
  connected: boolean;
  status: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED' | null;
  tokenHint: string | null;
  projectId: string | null;
  projectName: string | null;
  triggers: { VOLUNTARY: boolean; RANDOM: boolean };
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
}

const DEFAULT_TRIGGERS = { VOLUNTARY: true, RANDOM: true } as const;

/** Keys are the `AssignmentKind` values, uppercase. Anything else is not a trigger. */
export function readTriggers(raw: unknown): { VOLUNTARY: boolean; RANDOM: boolean } {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_TRIGGERS };
  const value = raw as Record<string, unknown>;
  return {
    VOLUNTARY: value.VOLUNTARY === true,
    RANDOM: value.RANDOM === true,
  };
}

export function disconnectedView(): TodoistIntegrationView {
  return {
    connected: false,
    status: null,
    tokenHint: null,
    projectId: null,
    projectName: null,
    triggers: { ...DEFAULT_TRIGGERS },
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
  };
}

export async function readTodoistIntegration(
  db: PrismaClient,
  householdId: string,
  memberId: string,
): Promise<TodoistIntegrationView> {
  const row = await db.memberIntegration.findFirst({
    where: { householdId, memberId, provider: 'TODOIST' },
    // Explicit column list, never a bare `findFirst` — the four token columns
    // and `tokenKeyVersion` are deliberately absent and must stay absent.
    select: {
      status: true,
      tokenHint: true,
      projectId: true,
      projectName: true,
      triggers: true,
      lastSuccessAt: true,
      lastErrorAt: true,
      lastErrorCode: true,
    },
  });
  if (row === null) return disconnectedView();

  return {
    // "Connected" means a usable credential exists. A DISABLED row survives
    // disconnect (its foreign keys are still referenced) but is not a
    // connection, and must not be shown as one.
    connected: row.status === 'ACTIVE',
    status: row.status,
    tokenHint: row.tokenHint,
    projectId: row.projectId,
    projectName: row.projectName,
    triggers: readTriggers(row.triggers),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
  };
}
