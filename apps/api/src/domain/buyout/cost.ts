/**
 * Buyout cost strategies (Architektur §6.6, CLAUDE.md §8).
 *
 * The default `CURRENT_TASK_VALUE` reproduces §8's `buyoutCost =
 * currentTaskValue` and §21's worked example (cost 6, resulting value 9)
 * exactly. Every strategy funnels through the same normalization, whose floor
 * of 1 is what makes §44's "ein Freikauf kostet Punkte" true even for a task
 * whose `currentValue` is 0 — and it agrees with the `pt_buyout_costs_points`
 * CHECK, so code and database can never disagree.
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import {
  BuyoutCostStrategy,
  compileFormula,
  formulaEnv,
  FORMULA_CONTEXTS,
  type FormulaContext,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { ConflictError } from '../errors.js';
import { applyRounding } from '../task/value.js';

/** The minimum any buyout may cost. Not configurable — §44 depends on it. */
export const MINIMUM_BUYOUT_COST = 1;

export function buyoutCost(cfg: HouseholdConfig, ctx: FormulaContext): number {
  const b = cfg.buyout;

  let raw: number;
  let needsRounding: boolean;

  switch (b.costStrategy) {
    case BuyoutCostStrategy.FIXED:
      raw = b.fixedCost;
      needsRounding = false;
      break;
    case BuyoutCostStrategy.CURRENT_TASK_VALUE:
      raw = ctx.currentValue;
      needsRounding = false;
      break;
    case BuyoutCostStrategy.MULTIPLIER:
      raw = ctx.currentValue * b.multiplier;
      needsRounding = true;
      break;
    case BuyoutCostStrategy.FORMULA: {
      if (b.costFormula === null) {
        throw new ConflictError('CONFIG_INVALID', 'FORMULA ohne Formel konfiguriert.');
      }
      const { evaluate } = compileFormula(b.costFormula, {
        allowedVariables: FORMULA_CONTEXTS.buyoutCost,
      });
      raw = evaluate(formulaEnv(ctx));
      needsRounding = true;
      break;
    }
  }

  const rounded = needsRounding ? applyRounding(raw, b.costRounding) : Math.round(raw);

  if (!Number.isFinite(rounded)) {
    throw new ConflictError('INTERNAL_ERROR', 'Freikaufkosten ergaben keinen endlichen Wert.');
  }

  return Math.min(Math.max(rounded, MINIMUM_BUYOUT_COST), Number.MAX_SAFE_INTEGER);
}
