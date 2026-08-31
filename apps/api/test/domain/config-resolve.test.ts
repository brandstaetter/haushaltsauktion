/**
 * §5.5 — configuration pinning.
 *
 * The property under test: an admin changing a rule mid-cycle cannot change a
 * price that has already been quoted to somebody, but the system's *future*
 * behaviour does follow the admin's latest intent.
 */

import { describe, expect, it } from 'vitest';

import { ConflictError } from '../../src/domain/errors.js';
import {
  ConfigDecision,
  configVersionFor,
  resolveConfig,
  scopeOf,
} from '../../src/domain/config/resolve.js';

const inFlight = { assignmentConfigVersion: 7, instanceConfigVersion: 6, currentVersion: 9 };

describe('which version each decision reads', () => {
  it('pins numbers already quoted to a member to the assignment version', () => {
    for (const decision of [
      ConfigDecision.BUYOUT_COST,
      ConfigDecision.VALUE_INCREASE_ON_BUYOUT,
      ConfigDecision.VOLUNTARY_REWARD,
      ConfigDecision.RESET_ON_COMPLETION,
      ConfigDecision.CLAWBACK,
    ]) {
      expect(scopeOf(decision)).toBe('ASSIGNMENT_PINNED');
      expect(configVersionFor(decision, inFlight), decision).toBe(7);
    }
  });

  it('pins offer-window decisions to the instance version', () => {
    for (const decision of [
      ConfigDecision.OFFER_DURATION,
      ConfigDecision.EXPIRY_DEADLINE,
      ConfigDecision.RESET_ON_EXPIRY,
    ]) {
      expect(scopeOf(decision)).toBe('INSTANCE_PINNED');
      expect(configVersionFor(decision, inFlight), decision).toBe(6);
    }
  });

  it('lets scheduling and selection follow the admin’s latest intent', () => {
    for (const decision of [
      ConfigDecision.SELECTION_STRATEGY,
      ConfigDecision.FAIRNESS_WEIGHTS,
      ConfigDecision.ELIGIBILITY_CAPS,
      ConfigDecision.POINT_DECAY,
      ConfigDecision.NOTIFICATION_TIMING,
    ]) {
      expect(scopeOf(decision)).toBe('CURRENT');
      expect(configVersionFor(decision, inFlight), decision).toBe(9);
    }
  });

  it('falls back down the chain only when a pin is genuinely absent', () => {
    expect(
      configVersionFor(ConfigDecision.BUYOUT_COST, {
        assignmentConfigVersion: null,
        instanceConfigVersion: 6,
        currentVersion: 9,
      }),
    ).toBe(6);
    expect(configVersionFor(ConfigDecision.BUYOUT_COST, { currentVersion: 9 })).toBe(9);
    // The fallback never upgrades an existing pin.
    expect(configVersionFor(ConfigDecision.BUYOUT_COST, inFlight)).toBe(7);
  });
});

describe('resolveConfig', () => {
  const versions = new Map([
    [6, { label: 'v6' }],
    [7, { label: 'v7' }],
    [9, { label: 'v9' }],
  ]);

  it('returns the pinned config and the version it came from', () => {
    expect(resolveConfig(ConfigDecision.BUYOUT_COST, inFlight, versions)).toEqual({
      version: 7,
      config: { label: 'v7' },
    });
  });

  it('honours a quote across an admin change mid-cycle', () => {
    // Anna is looking at "Freikaufen: 6 Punkte, danach steigt der Wert auf 9".
    // An admin saves version 9 with a different multiplier. Her buyout must
    // still read version 7.
    const quoted = resolveConfig(ConfigDecision.VALUE_INCREASE_ON_BUYOUT, inFlight, versions);
    expect(quoted.version).toBe(7);
    // The next assignment pins the new version and uses the new rule.
    const nextAssignment = resolveConfig(
      ConfigDecision.VALUE_INCREASE_ON_BUYOUT,
      { assignmentConfigVersion: 9, instanceConfigVersion: 9, currentVersion: 9 },
      versions,
    );
    expect(nextAssignment.version).toBe(9);
  });

  it('fails loudly rather than silently charging a different price', () => {
    // configVersion is a real FK with onDelete: Restrict, so a missing version
    // means something is wrong that must not be papered over.
    expect(() =>
      resolveConfig(ConfigDecision.BUYOUT_COST, { assignmentConfigVersion: 42, currentVersion: 9 }, versions),
    ).toThrow(ConflictError);
  });
});
