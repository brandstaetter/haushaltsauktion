/**
 * Configuration validation and dry-run preview (Architektur §3.10, §5.3, §6.5;
 * Reconciliation §1.3).
 *
 * **One validation path, three callers**: `POST /admin/config/validate`,
 * `POST /admin/config/preview` and `PUT /admin/config`. That is the point —
 * a preview that ran different code from the save would be a preview of
 * nothing.
 *
 * The worked examples exist because §31's "show the consequence first" applies
 * to admins too: an admin changing a multiplier should see `4 → 6 → 9 → 14`
 * before saving, not discover it when a family member is charged. And they are
 * produced *here*, on the server, because §17 and §36 both forbid evaluating a
 * configured formula in the browser.
 */

import {
  probeFormula,
  validateConfig as validateShape,
  type ConfigFieldError,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { buyoutCost } from '../../domain/buyout/cost.js';
import { ConflictError } from '../../domain/errors.js';
import { increasedValue, resetValue } from '../../domain/task/value.js';

export interface FormulaErrorDetail extends ConfigFieldError {
  /** Character offset into the formula source — what the admin editor underlines. */
  pos: number;
  code: string;
}

export interface ConfigPreview {
  /** §35's escalation chain for a sample task, under the proposed config. */
  escalationChain: { baseValue: number; values: number[]; capped: boolean };
  /** What a buyout would cost at each step of that chain. */
  buyoutCosts: Array<{ currentValue: number; cost: number }>;
  /** What completion resets the value to, from the top of the chain. */
  resetExample: { from: number; to: number };
  /** §15 — projected balance under the configured decay, or null when disabled. */
  decayProjection: { weeks: number; balances: number[] } | null;
}

export interface ConfigValidation {
  valid: boolean;
  config: HouseholdConfig | null;
  fieldErrors: ConfigFieldError[];
  formulaErrors: FormulaErrorDetail[];
  previews: ConfigPreview | null;
}

const SAMPLE_BASE_VALUE = 4;
const CHAIN_STEPS = 3;

/**
 * The escalation chain a configuration produces, starting from a sample task.
 *
 * It stops early rather than throwing when the value cap is hit, because
 * `increasedValue` refuses to invent an increase that would not happen (OQ-8) —
 * and an admin who set a cap deserves to *see* where the chain stops rather
 * than get an error with no chain at all.
 */
function escalationChain(cfg: HouseholdConfig, baseValue: number): ConfigPreview['escalationChain'] {
  const values: number[] = [baseValue];
  let current = baseValue;
  let capped = false;

  for (let step = 0; step < CHAIN_STEPS; step += 1) {
    try {
      current = increasedValue(cfg, { currentValue: current, baseValue, buyoutCount: step });
    } catch (error) {
      if (error instanceof ConflictError && error.code === 'BUYOUT_AT_VALUE_CAP') {
        capped = true;
        break;
      }
      throw error;
    }
    values.push(current);
  }

  return { baseValue, values, capped };
}

function decayProjection(cfg: HouseholdConfig): ConfigPreview['decayProjection'] {
  if (!cfg.points.decay.enabled) return null;
  const balances: number[] = [];
  let balance = 100;
  for (let week = 0; week < 8; week += 1) {
    balances.push(Math.round(balance));
    switch (cfg.points.decay.type) {
      case 'PERCENTAGE':
        balance = balance * (1 - cfg.points.decay.value / 100);
        break;
      case 'FIXED':
        balance = balance - cfg.points.decay.value;
        break;
      case 'MAX_BALANCE':
        balance = Math.min(balance, cfg.points.decay.value);
        break;
      case 'NONE':
        break;
    }
    balance = Math.max(balance, cfg.points.decay.minimumBalance);
  }
  return { weeks: 8, balances };
}

function buildPreview(cfg: HouseholdConfig, baseValue: number): ConfigPreview {
  const chain = escalationChain(cfg, baseValue);
  return {
    escalationChain: chain,
    buyoutCosts: chain.values.map((currentValue, index) => ({
      currentValue,
      cost: buyoutCost(cfg, { currentValue, baseValue, buyoutCount: index }),
    })),
    resetExample: {
      from: chain.values[chain.values.length - 1] ?? baseValue,
      to: resetValue(cfg, {
        currentValue: chain.values[chain.values.length - 1] ?? baseValue,
        baseValue,
      }),
    },
    decayProjection: decayProjection(cfg),
  };
}

/**
 * Probe every configured formula (§6.5).
 *
 * Formulas are validated when the config is *saved*, never first seen at
 * runtime — so a formula that reaches the buyout hot path has already been
 * proven parseable and non-shrinking across the whole probe grid.
 */
function probeFormulas(cfg: HouseholdConfig): FormulaErrorDetail[] {
  const errors: FormulaErrorDetail[] = [];

  if (cfg.buyout.costStrategy === 'FORMULA') {
    if (cfg.buyout.costFormula === null) {
      errors.push({
        path: 'buyout.costFormula',
        message: 'Strategie FORMULA erfordert eine Formel.',
        pos: 0,
        code: 'MISSING_FORMULA',
      });
    } else {
      const report = probeFormula(cfg.buyout.costFormula, 'buyoutCost', { forbidDecrease: false });
      for (const failure of report.failures) {
        errors.push({
          path: 'buyout.costFormula',
          message: failure.message,
          pos: failure.pos,
          code: failure.code,
        });
      }
    }
  }

  if (cfg.valueIncrease.strategy === 'CUSTOM_FORMULA') {
    if (cfg.valueIncrease.formula === null) {
      errors.push({
        path: 'valueIncrease.formula',
        message: 'Strategie CUSTOM_FORMULA erfordert eine Formel.',
        pos: 0,
        code: 'MISSING_FORMULA',
      });
    } else {
      const report = probeFormula(cfg.valueIncrease.formula, 'valueIncrease', {
        forbidDecrease: true,
      });
      for (const failure of report.failures) {
        errors.push({
          path: 'valueIncrease.formula',
          message: failure.message,
          pos: failure.pos,
          code: failure.code,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate a proposed configuration and, if it is sound, work out what it would
 * actually do. Writes nothing — `POST /admin/config/preview` is a pure function
 * of its input and `PUT /admin/config` calls exactly this before persisting.
 */
export function validateAndPreview(
  input: unknown,
  options: { sampleBaseValue?: number } = {},
): ConfigValidation {
  const shape = validateShape(input);
  if (!shape.valid || shape.config === null) {
    return {
      valid: false,
      config: null,
      fieldErrors: shape.fieldErrors,
      formulaErrors: [],
      previews: null,
    };
  }

  const formulaErrors = probeFormulas(shape.config);
  if (formulaErrors.length > 0) {
    return {
      valid: false,
      config: null,
      fieldErrors: [],
      formulaErrors,
      previews: null,
    };
  }

  return {
    valid: true,
    config: shape.config,
    fieldErrors: [],
    formulaErrors: [],
    previews: buildPreview(shape.config, options.sampleBaseValue ?? SAMPLE_BASE_VALUE),
  };
}
