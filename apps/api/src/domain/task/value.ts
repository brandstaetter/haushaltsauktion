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

export interface ValueGrowthInput {
  currentValue: number;
  /**
   * When the current growth clock started, i.e. when this instance last
   * entered `AVAILABLE` or when the last whole step was credited.
   */
  anchor: Date;
  now: Date;
}

export interface ValueGrowthStep {
  /** The value after crediting every whole interval that has elapsed. */
  value: number;
  /** Whole intervals consumed. `0` means the caller writes nothing at all. */
  steps: number;
  /**
   * The anchor advanced by exactly `steps` intervals — deliberately NOT `now`.
   * Advancing to `now` would throw away the unfinished remainder of the
   * current interval on every sweep, so a chore would grow strictly slower
   * than configured whenever the sweep ticks off-beat (which it always does).
   * Carrying the remainder also makes a sweep outage cost nothing: the next
   * run credits every interval the instance sat through while nobody looked.
   */
  anchor: Date;
  /**
   * The cap stopped this step short, so the value can never rise again during
   * this `AVAILABLE` spell. Callers clear the stored anchor on this, which
   * takes the instance out of the growth query for good instead of leaving it
   * to be re-examined and re-written every interval forever.
   */
  capped: boolean;
}

/**
 * Intake "time-based-value-growth" — what an instance is worth after sitting
 * on the market.
 *
 * The counterpart to `assignment.maxRandomAssignmentsPerInstance`: once a
 * chore can no longer be forced onto anybody, a rising price is the only
 * mechanism left that gets it done. §44's "der erhöhte Wert ist gleichzeitig
 * der potentielle Gewinn einer späteren freiwilligen Übernahme" holds exactly
 * as it does for a buyout — this is the same `currentValue`, reached by
 * waiting rather than by paying.
 *
 * Shares `valueIncrease.maximumValue` with the buyout path on purpose: a
 * household sets one ceiling for "how valuable may this chore ever get",
 * regardless of which escalation got it there.
 */
export function grownValue(cfg: HouseholdConfig, input: ValueGrowthInput): ValueGrowthStep {
  const unchanged: ValueGrowthStep = {
    value: input.currentValue,
    steps: 0,
    anchor: input.anchor,
    capped: false,
  };

  const vg = cfg.valueGrowth;
  if (!vg.enabled) return unchanged;

  const intervalMs = vg.intervalMinutes * 60_000;
  const elapsedMs = input.now.getTime() - input.anchor.getTime();
  // A clock that has not reached the first full interval owes nothing yet. A
  // negative elapsed (anchor in the future, e.g. a clock adjustment) must not
  // run the value backwards either.
  if (elapsedMs < intervalMs) return unchanged;

  const steps = Math.floor(elapsedMs / intervalMs);
  const anchor = new Date(input.anchor.getTime() + steps * intervalMs);

  const cap = cfg.valueIncrease.maximumValue;
  // Already at the ceiling before this step: consume the time, credit nothing,
  // and tell the caller to retire this instance from the growth query.
  if (cap !== null && input.currentValue >= cap) {
    return { value: input.currentValue, steps, anchor, capped: true };
  }

  const raw = input.currentValue + steps * vg.pointsPerInterval;
  const value = clampToSafeInteger(cap !== null ? Math.min(raw, cap) : raw, input.currentValue);

  return { value, steps, anchor, capped: cap !== null && value >= cap };
}

/**
 * §24 — should a growth step tell the household about it?
 *
 * Bands sit at `baseValue + n * notifyAfterPoints`. A step notifies iff it
 * moved the value across at least one band, so members hear "this chore is
 * worth noticeably more now" rather than "+1" sixty times a day.
 *
 * Stateless on purpose: the answer depends only on the two values and the
 * config, never on a stored "last notified" marker. A replayed or duplicated
 * sweep therefore cannot re-send, and a restart cannot lose the thread.
 *
 * Returns the value of the highest band crossed — the number worth putting in
 * the message when several bands were passed at once (a long sweep outage),
 * rather than every intermediate one.
 */
export function growthNotificationBand(
  cfg: HouseholdConfig,
  input: { baseValue: number; before: number; after: number },
): number | null {
  const threshold = cfg.valueGrowth.notifyAfterPoints;
  if (threshold <= 0) return null;
  if (input.after <= input.before) return null;

  // Below the base value there is no band to cross yet: `Math.floor` on a
  // negative distance would otherwise invent bands beneath the base.
  const bandOf = (value: number): number =>
    value < input.baseValue ? 0 : Math.floor((value - input.baseValue) / threshold);

  const crossed = bandOf(input.after);
  if (crossed <= bandOf(input.before)) return null;
  if (crossed === 0) return null;

  return input.baseValue + crossed * threshold;
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
