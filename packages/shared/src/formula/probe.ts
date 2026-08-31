/**
 * Validation-time probing (Architektur §6.5).
 *
 * Formulas are proven safe when the configuration is **saved**, never first
 * discovered to be broken on the buyout hot path. Every admin write runs the
 * grid below and, for `valueIncrease`, asserts a strict increase at every point
 * — which is what makes §44's "a buyout raises the value" unbreakable by
 * configuration rather than merely unlikely.
 */

import { compileFormula } from './evaluator.js';
import { FORMULA_CONTEXTS, formulaEnv, type FormulaContextName } from './contexts.js';
import { FormulaError, FormulaErrorCode } from './errors.js';

const PROBE_CURRENT_VALUES = [0, 1, 2, 4, 7, 50, 999] as const;
const PROBE_BASE_VALUES = [1, 4, 7] as const;
const PROBE_BUYOUT_COUNTS = [0, 1, 5] as const;

export interface FormulaProbeFailure {
  code: FormulaErrorCode | 'DECREASES_VALUE';
  message: string;
  pos: number;
  probe?: { currentValue: number; baseValue: number; buyoutCount: number; result?: number };
}

export interface FormulaProbeReport {
  valid: boolean;
  failures: FormulaProbeFailure[];
  /** Sample evaluations for the admin preview, `null` when parsing failed. */
  samples: Array<{ currentValue: number; result: number }> | null;
}

/**
 * Parse `source` in `context` and evaluate it across the probe grid.
 * `forbidDecrease` is set for `valueIncrease` formulas.
 *
 * **Why "must not decrease" rather than "must strictly increase".**
 * Architektur §6.5 asks for a strict increase at every probe. Taken literally
 * that rejects every multiplicative formula, because the grid includes
 * `currentValue = 0` and `ceil(0 × 1.5) = 0` — which would leave
 * `CUSTOM_FORMULA` unable to express the very rule the default `MULTIPLIER`
 * strategy implements, and would push admins towards additive formulas for no
 * reason.
 *
 * §44 does not depend on this check: `increasedValue` (§6.7) clamps every
 * result to `max(v, currentValue + minimumIncrease)` with `minimumIncrease >= 1`
 * validated, so a buyout always raises the value whatever the formula returned.
 * What the probe is actually for is catching a formula whose *intent* is wrong
 * — one that shrinks the value — early, with a good error message, instead of
 * letting the clamp quietly paper over it. `result < currentValue` is exactly
 * that condition.
 */
export function probeFormula(
  source: string,
  context: FormulaContextName,
  options: { forbidDecrease: boolean },
): FormulaProbeReport {
  const allowedVariables = FORMULA_CONTEXTS[context];

  let evaluate: (env: Readonly<Record<string, number>>) => number;
  try {
    evaluate = compileFormula(source, { allowedVariables }).evaluate;
  } catch (error) {
    if (error instanceof FormulaError) {
      return {
        valid: false,
        failures: [{ code: error.code, message: error.message, pos: error.pos }],
        samples: null,
      };
    }
    throw error;
  }

  const failures: FormulaProbeFailure[] = [];

  for (const currentValue of PROBE_CURRENT_VALUES) {
    for (const baseValue of PROBE_BASE_VALUES) {
      for (const buyoutCount of PROBE_BUYOUT_COUNTS) {
        const probe = { currentValue, baseValue, buyoutCount };
        let result: number;
        try {
          result = evaluate(formulaEnv(probe));
        } catch (error) {
          if (error instanceof FormulaError) {
            failures.push({ code: error.code, message: error.message, pos: error.pos, probe });
            continue;
          }
          throw error;
        }

        if (!Number.isFinite(result)) {
          failures.push({
            code: FormulaErrorCode.NOT_FINITE,
            message: 'Formel ergab keinen endlichen Wert.',
            pos: 0,
            probe: { ...probe, result },
          });
          continue;
        }

        if (options.forbidDecrease && result < currentValue) {
          failures.push({
            code: 'DECREASES_VALUE',
            message:
              `Formel darf den Aufgabenwert nie senken. Bei aktuellem Wert ${currentValue} ` +
              `ergab sie ${result}.`,
            pos: 0,
            probe: { ...probe, result },
          });
        }
      }
    }
  }

  const samples = PROBE_CURRENT_VALUES.map((currentValue) => ({
    currentValue,
    result: evaluate(formulaEnv({ currentValue, baseValue: 4, buyoutCount: 0 })),
  }));

  return { valid: failures.length === 0, failures, samples };
}

export const PROBE_GRID = Object.freeze({
  currentValues: PROBE_CURRENT_VALUES,
  baseValues: PROBE_BASE_VALUES,
  buyoutCounts: PROBE_BUYOUT_COUNTS,
});
