/**
 * Task value arithmetic (Architektur §6.7, CLAUDE.md §9, §11, §5, §7).
 *
 * Three numbers live here and nowhere else: what a buyout raises the value to,
 * what completion resets it to, and what a voluntary completion pays. All three
 * are server-authoritative (§36) and configuration-driven (§16).
 *
 * Pure: no Prisma, no `Date`, no `Math.random` (§7.2).
 */

import {
  AssignmentKind,
  compileFormula,
  formulaEnv,
  FORMULA_CONTEXTS,
  ResetStrategy,
  RewardTiming,
  Rounding,
  ValueIncreaseStrategy,
  type FormulaContext,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { ConflictError } from '../errors.js';

export function applyRounding(value: number, rounding: Rounding): number {
  switch (rounding) {
    case Rounding.CEIL:
      return Math.ceil(value);
    case Rounding.FLOOR:
      return Math.floor(value);
    case Rounding.ROUND:
      return Math.round(value);
  }
}

function clampToSafeInteger(value: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    throw new ConflictError('INTERNAL_ERROR', 'Wertberechnung ergab keinen endlichen Wert.');
  }
  return Math.min(Math.max(Math.trunc(value), minimum), Number.MAX_SAFE_INTEGER);
}

/**
 * §9 — the value after a buyout. Escalation is what makes the chore more
 * attractive to everyone else, so §44 requires a strict increase; the
 * normalization pipeline below guarantees it whatever the strategy computed.
 *
 * Throws `409 BUYOUT_AT_VALUE_CAP` when the value is already at
 * `maximumValue` (OQ-8): charging points without raising the value would break
 * §44 silently, and rejecting is the only behaviour consistent with it.
 */
export function increasedValue(cfg: HouseholdConfig, ctx: FormulaContext): number {
  const cur = ctx.currentValue;
  const vi = cfg.valueIncrease;

  // The cap is checked BEFORE clamping (§6.7): silently clamping to the same
  // value would produce a buyout that charged points and raised nothing.
  if (vi.maximumValue !== null && cur >= vi.maximumValue) {
    throw new ConflictError(
      'BUYOUT_AT_VALUE_CAP',
      'Der Aufgabenwert hat die konfigurierte Obergrenze erreicht und kann nicht weiter steigen.',
      { currentValue: cur, maximumValue: vi.maximumValue },
    );
  }

  let raw: number;
  switch (vi.strategy) {
    case ValueIncreaseStrategy.FIXED_INCREMENT:
      raw = cur + vi.increment;
      break;
    case ValueIncreaseStrategy.PERCENTAGE:
      raw = cur * (1 + vi.percentage / 100);
      break;
    case ValueIncreaseStrategy.MULTIPLIER:
      raw = cur * vi.multiplier;
      break;
    case ValueIncreaseStrategy.CUSTOM_FORMULA: {
      if (vi.formula === null) {
        throw new ConflictError('CONFIG_INVALID', 'CUSTOM_FORMULA ohne Formel konfiguriert.');
      }
      const { evaluate } = compileFormula(vi.formula, {
        allowedVariables: FORMULA_CONTEXTS.valueIncrease,
      });
      raw = evaluate(formulaEnv(ctx));
      break;
    }
  }

  let value = applyRounding(raw, vi.rounding);
  // minimumIncrease is validated >= 1, so this line alone makes §44 true
  // regardless of what the strategy produced.
  value = Math.max(value, cur + vi.minimumIncrease);
  if (vi.maximumValue !== null) value = Math.min(value, vi.maximumValue);

  return clampToSafeInteger(value, cur + 1);
}

/** §11 / §5.7 — the value a completed instance is reset to. */
export function resetValue(
  cfg: HouseholdConfig,
  ctx: { currentValue: number; baseValue: number },
): number {
  switch (cfg.completion.resetStrategy) {
    case ResetStrategy.BASE_VALUE:
      return clampToSafeInteger(ctx.baseValue, 0);
    case ResetStrategy.DECREASE_PERCENTAGE:
      return clampToSafeInteger(
        Math.max(ctx.baseValue, Math.ceil(ctx.currentValue * (1 - cfg.completion.decreasePercentage / 100))),
        0,
      );
    case ResetStrategy.KEEP_CURRENT:
      return clampToSafeInteger(ctx.currentValue, 0);
  }
}

/**
 * §5.7 / OQ-1 — what the *definition* carries into the next occurrence.
 * `null` under the default, which leaves the mechanism inert.
 */
export function carriedValueAfterCompletion(
  cfg: HouseholdConfig,
  ctx: { currentValue: number; baseValue: number },
): number | null {
  switch (cfg.completion.resetStrategy) {
    case ResetStrategy.BASE_VALUE:
      return null;
    case ResetStrategy.DECREASE_PERCENTAGE:
    case ResetStrategy.KEEP_CURRENT:
      return resetValue(cfg, ctx);
  }
}

export interface RewardInput {
  kind: AssignmentKind;
  currentValue: number;
  timing: RewardTiming;
}

/**
 * §7 and §44's headline invariant, in one expression.
 *
 * The `kind === VOLUNTARY` test comes **first**, before any configuration value
 * is consulted, so no admin setting can make a random completion pay. There is
 * no key that would enable it (§5.4) and no code path that reads one.
 *
 * A return of 0 means the caller writes **no ledger row at all** (§4.5) — the
 * zero is an absence, not a zero-amount entry that could later be mistaken for
 * a payout.
 */
export function voluntaryReward(cfg: HouseholdConfig, input: RewardInput): number {
  if (input.kind !== AssignmentKind.VOLUNTARY) return 0;
  if (!cfg.voluntary.rewardEnabled) return 0;
  if (cfg.voluntary.rewardTiming !== input.timing) return 0;

  const raw = input.currentValue * cfg.voluntary.rewardMultiplier;
  return Math.max(0, applyRounding(raw, cfg.voluntary.rewardRounding));
}

/**
 * What `AvailableTaskDto.potentialReward` shows: what this member would earn by
 * volunteering for this task and completing it, under the current config.
 */
export function potentialVoluntaryReward(cfg: HouseholdConfig, currentValue: number): number {
  return voluntaryReward(cfg, {
    kind: AssignmentKind.VOLUNTARY,
    currentValue,
    timing: cfg.voluntary.rewardTiming,
  });
}
