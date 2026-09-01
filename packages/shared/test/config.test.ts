import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG,
  cloneDefaultConfig,
  normalizeLegacyConfigInput,
  parseConfig,
  toPublicConfig,
  validateConfig,
} from '../src/config/index.js';
import type { HouseholdConfig } from '../src/config/types.js';

const patch = (mutate: (cfg: HouseholdConfig) => void): HouseholdConfig => {
  const cfg = cloneDefaultConfig();
  mutate(cfg);
  return cfg;
};

const pathsOf = (input: unknown): string[] => validateConfig(input).fieldErrors.map((e) => e.path);

describe('DEFAULT_CONFIG matches CLAUDE.md §39 verbatim', () => {
  it('sets the voluntary reward defaults', () => {
    expect(DEFAULT_CONFIG.voluntary.rewardMultiplier).toBe(1.0);
    expect(DEFAULT_CONFIG.voluntary.rewardTiming).toBe('ON_COMPLETE');
    expect(DEFAULT_CONFIG.voluntary.rewardEnabled).toBe(true);
  });

  it('sets the random-assignment defaults', () => {
    expect(DEFAULT_CONFIG.assignment.strategy).toBe('WEIGHTED_FAIRNESS');
    expect(DEFAULT_CONFIG.assignment.preventImmediateReassignment).toBe(true);
  });

  it('sets the buyout defaults', () => {
    expect(DEFAULT_CONFIG.buyout.enabled).toBe(true);
    expect(DEFAULT_CONFIG.buyout.costStrategy).toBe('CURRENT_TASK_VALUE');
    expect(DEFAULT_CONFIG.buyout.allowNegativeBalance).toBe(false);
  });

  it('sets the value-increase defaults', () => {
    expect(DEFAULT_CONFIG.valueIncrease.strategy).toBe('MULTIPLIER');
    expect(DEFAULT_CONFIG.valueIncrease.multiplier).toBe(1.5);
    expect(DEFAULT_CONFIG.valueIncrease.rounding).toBe('CEIL');
    expect(DEFAULT_CONFIG.valueIncrease.minimumIncrease).toBe(1);
  });

  it('resets to the base value on completion and leaves decay off', () => {
    expect(DEFAULT_CONFIG.completion.resetStrategy).toBe('BASE_VALUE');
    expect(DEFAULT_CONFIG.points.decay.enabled).toBe(false);
  });

  it('carries the four keys the reconciliation added', () => {
    expect(DEFAULT_CONFIG.fairness.windowDays).toBe(28); // OQ-7
    // OQ-4, reworked: auto-assignment now only triggers within this many
    // minutes of a task's due date (default 24h).
    expect(DEFAULT_CONFIG.assignment.leadMinutesBeforeDue).toBe(1440);
    expect(DEFAULT_CONFIG.tasks.maxOpenInstancesPerDefinition).toBe(1); // OQ-5
    // OQ-1's carriedValue is a TaskDefinition column, driven by this key.
    expect(DEFAULT_CONFIG.completion.resetStrategy).toBe('BASE_VALUE');
  });
});

describe('schema shape (§5.3)', () => {
  it('fills an empty object with exactly the defaults', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('accepts DEFAULT_CONFIG unchanged — the defaults are provably valid', () => {
    expect(parseConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it('fills missing leaves inside a partially supplied section', () => {
    const cfg = parseConfig({ valueIncrease: { multiplier: 2 } });
    expect(cfg.valueIncrease.multiplier).toBe(2);
    expect(cfg.valueIncrease.rounding).toBe('CEIL');
  });

  it('rejects an unknown key rather than silently ignoring it', () => {
    // Silently dropping a typo is how a rule "stops working" unnoticed.
    expect(validateConfig({ valueIncrease: { multiplyer: 2 } }).valid).toBe(false);
    expect(validateConfig({ nonsense: true }).valid).toBe(false);
  });
});

describe('the §44 invariants cannot be switched off by configuration (§5.4)', () => {
  it('rejects a multiplier that cannot raise the value', () => {
    expect(pathsOf(patch((c) => (c.valueIncrease.multiplier = 1.0)))).toContain(
      'valueIncrease.multiplier',
    );
    expect(pathsOf(patch((c) => (c.valueIncrease.multiplier = 0.5)))).toContain(
      'valueIncrease.multiplier',
    );
  });

  it('rejects minimumIncrease = 0', () => {
    expect(pathsOf(patch((c) => (c.valueIncrease.minimumIncrease = 0)))).toContain(
      'valueIncrease.minimumIncrease',
    );
  });

  it('rejects a zero percentage or increment for their strategies', () => {
    expect(
      pathsOf(
        patch((c) => {
          c.valueIncrease.strategy = 'PERCENTAGE';
          c.valueIncrease.percentage = 0;
        }),
      ),
    ).toContain('valueIncrease.percentage');
    expect(
      pathsOf(
        patch((c) => {
          c.valueIncrease.strategy = 'FIXED_INCREMENT';
          c.valueIncrease.increment = 0;
        }),
      ),
    ).toContain('valueIncrease.increment');
  });

  it('has no key at all that would pay for a random completion', () => {
    const keys = Object.keys(DEFAULT_CONFIG.voluntary);
    expect(keys).not.toContain('randomRewardEnabled');
    expect(JSON.stringify(DEFAULT_CONFIG)).not.toMatch(/random.*reward/i);
  });
});

describe('cross-field rules (§5.3)', () => {
  it('requires a maximumDebt when a negative balance is allowed', () => {
    expect(pathsOf(patch((c) => (c.buyout.allowNegativeBalance = true)))).toContain(
      'buyout.maximumDebt',
    );
    expect(
      validateConfig(
        patch((c) => {
          c.buyout.allowNegativeBalance = true;
          c.buyout.maximumDebt = 20;
        }),
      ).valid,
    ).toBe(true);
  });

  it('forbids a negative minimumBalance when a negative balance is disallowed', () => {
    expect(pathsOf(patch((c) => (c.buyout.minimumBalance = -5)))).toContain('buyout.minimumBalance');
  });

  it('requires a positive fixedCost for the FIXED strategy', () => {
    expect(
      pathsOf(
        patch((c) => {
          c.buyout.costStrategy = 'FIXED';
          c.buyout.fixedCost = 0;
        }),
      ),
    ).toContain('buyout.fixedCost');
  });

  it('rejects a weightFloor of 0, which would make a member unreachable', () => {
    expect(pathsOf(patch((c) => (c.fairness.weightFloor = 0)))).toContain('fairness.weightFloor');
  });

  it('bounds the fairness window to a responsive range', () => {
    expect(pathsOf(patch((c) => (c.fairness.windowDays = 1)))).toContain('fairness.windowDays');
    expect(pathsOf(patch((c) => (c.fairness.windowDays = 400)))).toContain('fairness.windowDays');
    expect(validateConfig(patch((c) => (c.fairness.windowDays = 90))).valid).toBe(true);
  });

  it('requires a real decay type and value once decay is enabled', () => {
    const errors = pathsOf(patch((c) => (c.points.decay.enabled = true)));
    expect(errors).toContain('points.decay.type');
    expect(errors).toContain('points.decay.value');
  });

  it('bounds the offer duration', () => {
    expect(pathsOf(patch((c) => (c.assignment.offerDurationMinutes = 0)))).toContain(
      'assignment.offerDurationMinutes',
    );
  });
});

describe('formula-bearing configuration (§6.5)', () => {
  it('accepts a value-increase formula that never shrinks the value', () => {
    const cfg = patch((c) => {
      c.valueIncrease.strategy = 'CUSTOM_FORMULA';
      c.valueIncrease.formula = 'ceil(currentValue * 1.5) + buyoutCount';
    });
    expect(validateConfig(cfg).valid).toBe(true);
  });

  it('rejects a value-increase formula that shrinks the value', () => {
    const cfg = patch((c) => {
      c.valueIncrease.strategy = 'CUSTOM_FORMULA';
      c.valueIncrease.formula = 'currentValue - 1';
    });
    expect(pathsOf(cfg)).toContain('valueIncrease.formula');
  });

  it('rejects a formula referencing a variable outside the context', () => {
    const cfg = patch((c) => {
      c.buyout.costStrategy = 'FORMULA';
      c.buyout.costFormula = 'memberBalance * 2';
    });
    expect(pathsOf(cfg)).toContain('buyout.costFormula');
  });

  it('rejects a formula that tries to call something outside the whitelist', () => {
    const cfg = patch((c) => {
      c.buyout.costStrategy = 'FORMULA';
      c.buyout.costFormula = 'eval("1")';
    });
    expect(pathsOf(cfg)).toContain('buyout.costFormula');
  });

  it('requires a formula when the strategy asks for one', () => {
    expect(pathsOf(patch((c) => (c.valueIncrease.strategy = 'CUSTOM_FORMULA')))).toContain(
      'valueIncrease.formula',
    );
    expect(pathsOf(patch((c) => (c.buyout.costStrategy = 'FORMULA')))).toContain(
      'buyout.costFormula',
    );
  });
});

describe('legacy aliases (§5.3)', () => {
  it('normalizes §39 completion.resetValueToBase onto resetStrategy', () => {
    expect(parseConfig({ completion: { resetValueToBase: true } }).completion.resetStrategy).toBe(
      'BASE_VALUE',
    );
    expect(parseConfig({ completion: { resetValueToBase: false } }).completion.resetStrategy).toBe(
      'KEEP_CURRENT',
    );
  });

  it('normalizes §16 tasks.resetValueAfterCompletion the same way', () => {
    expect(
      parseConfig({ tasks: { resetValueAfterCompletion: true } }).completion.resetStrategy,
    ).toBe('BASE_VALUE');
  });

  it('leaves an explicit resetStrategy untouched', () => {
    const normalized = normalizeLegacyConfigInput({
      completion: { resetValueToBase: false, resetStrategy: 'DECREASE_PERCENTAGE' },
    }) as { completion: { resetStrategy: string } };
    expect(normalized.completion.resetStrategy).toBe('DECREASE_PERCENTAGE');
  });
});

describe('the public projection (Reconciliation §1.3)', () => {
  const publicConfig = toPublicConfig(DEFAULT_CONFIG);

  it('exposes what §31 says a member must be able to see', () => {
    expect(publicConfig.voluntary.rewardTiming).toBe('ON_COMPLETE');
    expect(publicConfig.buyout.enabled).toBe(true);
    expect(publicConfig.assignment.strategy).toBe('WEIGHTED_FAIRNESS');
    // §32-adjacent: a member must be able to see the rule that governs
    // whether/when they might be randomly assigned a due-dated task.
    expect(publicConfig.assignment.leadMinutesBeforeDue).toBe(1440);
    expect(publicConfig.pointDecayEnabled).toBe(false);
  });

  it('leaks no admin-only field', () => {
    const serialized = JSON.stringify(publicConfig);
    expect(serialized).not.toMatch(/weightFloor/);
    expect(serialized).not.toMatch(/randomAssignmentWeight/);
    expect(serialized).not.toMatch(/costFormula/);
    expect(serialized).not.toMatch(/fixedCost/);
  });

  it('tracks the source config rather than duplicating it', () => {
    const changed = toPublicConfig(patch((c) => (c.voluntary.rewardTiming = 'ON_ACCEPT')));
    expect(changed.voluntary.rewardTiming).toBe('ON_ACCEPT');
  });
});
