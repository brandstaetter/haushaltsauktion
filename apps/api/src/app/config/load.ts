/**
 * Reading configuration out of the append-only version table (§5.2, §5.5).
 *
 * Every use-case that computes a binding number asks for a *decision*, not for
 * "the config". `configFor` maps the decision to the version §5.5 requires —
 * pinned to the assignment, pinned to the instance, or current — so a new call
 * site cannot accidentally quote the wrong price.
 */

import { parseConfig, type HouseholdConfig } from '@haushaltsauktion/shared';

import { NotFoundError } from '../../domain/errors.js';
import { ConfigDecision, configVersionFor } from '../../domain/config/resolve.js';
import type { PrismaTx } from '../deps.js';

export interface VersionedConfig {
  version: number;
  config: HouseholdConfig;
}

/** The active configuration: `MAX(version)` for the household. No `isActive` flag. */
export async function loadCurrentConfig(
  tx: PrismaTx,
  householdId: string,
): Promise<VersionedConfig> {
  const row = await tx.householdConfiguration.findFirst({
    where: { householdId },
    orderBy: { version: 'desc' },
    select: { version: true, values: true },
  });
  if (row === null) {
    throw new NotFoundError('Haushalt hat keine Konfiguration.', { householdId });
  }
  return { version: row.version, config: parseConfig(row.values) };
}

/**
 * A specific pinned version.
 *
 * A missing version is an error, not a silent fallback to the current one:
 * `TaskInstance.configVersion` and `TaskAssignment.configVersion` are real
 * foreign keys with `onDelete: Restrict` (§5.5), so a pinned version cannot
 * disappear. If one is absent, something is wrong that must not be papered over
 * by quietly charging a different price.
 */
export async function loadConfigVersion(
  tx: PrismaTx,
  householdId: string,
  version: number,
): Promise<HouseholdConfig> {
  const row = await tx.householdConfiguration.findUnique({
    where: { householdId_version: { householdId, version } },
    select: { values: true },
  });
  if (row === null) {
    throw new NotFoundError(`Konfigurationsversion ${version} nicht gefunden.`, {
      householdId,
      version,
    });
  }
  return parseConfig(row.values);
}

export interface ConfigPins {
  assignmentConfigVersion?: number | null;
  instanceConfigVersion?: number | null;
}

/**
 * The §5.5 resolution rule, applied.
 *
 * "A number that was quoted to a person is honoured; the system's future
 * behaviour follows the admin's latest intent." An admin raising
 * `valueIncrease.multiplier` while Anna stares at "Freikaufen: 6 Punkte, danach
 * steigt der Wert auf 9" cannot change what she pays — her assignment pinned
 * its version at creation, and every arm of the buyout transaction reads it.
 */
export async function configFor(
  tx: PrismaTx,
  householdId: string,
  decision: ConfigDecision,
  pins: ConfigPins = {},
): Promise<VersionedConfig> {
  const current = await loadCurrentConfig(tx, householdId);
  const version = configVersionFor(decision, {
    assignmentConfigVersion: pins.assignmentConfigVersion ?? null,
    instanceConfigVersion: pins.instanceConfigVersion ?? null,
    currentVersion: current.version,
  });
  if (version === current.version) return current;
  return { version, config: await loadConfigVersion(tx, householdId, version) };
}

export { ConfigDecision };
