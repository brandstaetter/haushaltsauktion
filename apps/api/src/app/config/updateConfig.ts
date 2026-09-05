/**
 * Writing a new configuration version (Architektur §5.2, §3.10).
 *
 * Configuration is **data, versioned and append-only** — never mutated in
 * place. §23 requires config changes to be auditable, and §5.5's pinning
 * requires old versions to stay readable: a `TaskAssignment` created under
 * version 7 must still be able to compute its buyout price from version 7 next
 * week. Both fall out of never overwriting a row.
 *
 * Two admins saving at once produce one winner and one `409` — the same
 * compare-and-set pattern as §4, here carried by the `(householdId, version)`
 * unique constraint rather than by a row lock.
 */

import { toPublicConfig, type HouseholdConfig, type PublicHouseholdConfig } from '@haushaltsauktion/shared';

import { ConflictError, ValidationError } from '../../domain/errors.js';
import type { Deps } from '../deps.js';
import { writeAudit } from '../events.js';
import { withTransaction } from '../tx.js';
import { loadConfigVersion, loadCurrentConfig } from './load.js';
import { validateAndPreview, type ConfigValidation } from './validateConfig.js';

export interface ConfigDiffEntry {
  path: string;
  from: unknown;
  to: unknown;
}

/** A flat structured diff (§5.2). Rendered by the admin UI, cited by the audit event. */
export function diffConfig(
  before: unknown,
  after: unknown,
  prefix = '',
): ConfigDiffEntry[] {
  const entries: ConfigDiffEntry[] = [];
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      entries.push(...diffConfig(before[key], after[key], prefix ? `${prefix}.${key}` : key));
    }
    return entries;
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    entries.push({ path: prefix, from: before, to: after });
  }
  return entries;
}

export interface UpdateConfigInput {
  householdId: string;
  actorMemberId: string;
  expectedVersion: number;
  values: unknown;
  ipAddress?: string | null;
}

export interface UpdateConfigResult {
  version: number;
  values: HouseholdConfig;
  changeSummary: ConfigDiffEntry[];
}

export async function updateConfig(
  deps: Deps,
  input: UpdateConfigInput,
): Promise<UpdateConfigResult> {
  // Validation happens outside the transaction: it is pure, it can be slow
  // (the formula probe grid is 63 evaluations), and there is nothing to hold a
  // lock for while it runs.
  const validation = validateAndPreview(input.values);
  if (!validation.valid || validation.config === null) {
    throw new ValidationError('CONFIG_INVALID', 'Die Konfiguration ist ungültig.', {
      fieldErrors: validation.fieldErrors,
      formulaErrors: validation.formulaErrors,
    });
  }
  const next = validation.config;

  // The household switch and the server's integration ports (Deps.todoist /
  // Deps.secrets, gated on INTEGRATION_ENCRYPTION_KEY in main.ts) are
  // independent knobs. Without this, an admin can flip the switch on in a
  // deployment that never had the key configured — the config write
  // "succeeds", but every member's connect attempt then fails with
  // INTEGRATION_DISABLED, and nothing at save time told the admin why.
  if (next.integrations.todoist.enabled && (deps.todoist === undefined || deps.secrets === undefined)) {
    throw new ConflictError(
      'INTEGRATION_NOT_CONFIGURED',
      'Todoist ist auf diesem Server nicht eingerichtet (INTEGRATION_ENCRYPTION_KEY fehlt). Die Integration kann nicht aktiviert werden.',
    );
  }

  // Same reasoning as the Todoist guard above, for Web Push: `deps.push` is
  // only composed when both VAPID keys are configured (main.ts). Without
  // this, flipping `notifications.pushEnabled` on would "succeed" and then
  // silently deliver nothing (pushNotifier/dispatchPushOutbox degrade to a
  // no-op with no error), with nothing at save time telling the admin why.
  if (next.notifications.pushEnabled && deps.push === undefined) {
    throw new ConflictError(
      'PUSH_NOT_CONFIGURED',
      'Web Push ist auf diesem Server nicht eingerichtet (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY fehlen). Push-Benachrichtigungen können nicht aktiviert werden.',
    );
  }

  return withTransaction(deps, async (tx) => {
    const current = await loadCurrentConfig(tx, input.householdId);
    if (current.version !== input.expectedVersion) {
      throw new ConflictError(
        'CONFIG_VERSION_CONFLICT',
        'Eine andere Änderung wurde zuerst gespeichert.',
        { currentVersion: current.version },
      );
    }

    const changeSummary = diffConfig(current.config, next);
    const version = current.version + 1;

    await tx.householdConfiguration.create({
      data: {
        householdId: input.householdId,
        version,
        values: next as never,
        changeSummary: changeSummary as never,
        createdByMemberId: input.actorMemberId,
      },
    });

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'CONFIG_UPDATED',
      entityType: 'HouseholdConfiguration',
      entityId: String(version),
      payload: { fromVersion: current.version, toVersion: version, diff: changeSummary },
      ipAddress: input.ipAddress ?? null,
    });

    return { version, values: next, changeSummary };
  });
}

/**
 * §5.2 — rollback **appends**. Copying an old version forward keeps every
 * pinned reference valid and leaves the history intact; rewriting a row would
 * silently change what an in-flight assignment computes with.
 */
export async function rollbackConfig(
  deps: Deps,
  input: { householdId: string; actorMemberId: string; toVersion: number },
): Promise<UpdateConfigResult> {
  return withTransaction(deps, async (tx) => {
    const target = await loadConfigVersion(tx, input.householdId, input.toVersion);
    // Same guard as updateConfig(): a rollback is a config write too, and
    // could just as easily reintroduce a `todoist.enabled: true` this server
    // has no ports for (e.g. rolling back to before someone disabled it).
    if (target.integrations.todoist.enabled && (deps.todoist === undefined || deps.secrets === undefined)) {
      throw new ConflictError(
        'INTEGRATION_NOT_CONFIGURED',
        'Todoist ist auf diesem Server nicht eingerichtet (INTEGRATION_ENCRYPTION_KEY fehlt). Diese Version kann nicht wiederhergestellt werden.',
      );
    }
    const current = await loadCurrentConfig(tx, input.householdId);
    const version = current.version + 1;
    const changeSummary = diffConfig(current.config, target);

    await tx.householdConfiguration.create({
      data: {
        householdId: input.householdId,
        version,
        values: target as never,
        changeSummary: changeSummary as never,
        createdByMemberId: input.actorMemberId,
      },
    });

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'CONFIG_UPDATED',
      entityType: 'HouseholdConfiguration',
      entityId: String(version),
      payload: { rollbackOf: input.toVersion, toVersion: version, diff: changeSummary },
    });

    return { version, values: target, changeSummary };
  });
}

/**
 * Reconciliation §1.3 — `GET /api/config/public`.
 *
 * Derived from the same object the server computes with, via `toPublicConfig`
 * in `packages/shared`, rather than from a hand-maintained parallel list. That
 * is the whole requirement: a member-facing copy that says "du bekommst die
 * Punkte nach Erledigung" while an admin has set `ON_ACCEPT` *is* a hidden rule
 * (§31), and the only way to be sure it cannot happen is to project the real
 * object rather than to describe it twice.
 */
export async function loadPublicConfig(
  deps: Deps,
  householdId: string,
): Promise<{ version: number; values: PublicHouseholdConfig }> {
  const current = await loadCurrentConfig(deps.db, householdId);
  return { version: current.version, values: toPublicConfig(current.config) };
}

export type { ConfigValidation };
