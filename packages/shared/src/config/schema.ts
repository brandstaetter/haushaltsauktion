/**
 * `HouseholdConfigSchema` — Zod validation for the household configuration
 * (Architektur §5.3).
 *
 * Three layers of checking, all run before a version is written (§17):
 *   1. shape and range, per field;
 *   2. cross-field rules (the table in §5.3), in `superRefine`;
 *   3. formula parse **and** probe evaluation (§6.5) for the two formula keys.
 *
 * `strictObject` everywhere: an unknown key is an error, never a silent ignore.
 * Silently dropping a typo is exactly how a rule "stops working" without anyone
 * noticing.
 */

import { z } from 'zod';

import {
  AssignmentStrategy,
  BuyoutCostStrategy,
  DecayType,
  ResetStrategy,
  RewardTiming,
  Rounding,
  ValueIncreaseStrategy,
} from '../domain/enums.js';
import { deepCloneJson } from '../internal/clone.js';
import { probeFormula } from '../formula/probe.js';
import { DEFAULT_CONFIG } from './defaults.js';
import type { HouseholdConfig } from './types.js';

const MINUTES_PER_FORTNIGHT = 20160;

const positiveIntOrNull = z.number().int().min(1).nullable();

const TasksSchema = z
  .strictObject({
    maxOpenInstancesPerDefinition: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(DEFAULT_CONFIG.tasks.maxOpenInstancesPerDefinition),
  })
  .default(DEFAULT_CONFIG.tasks);

const VoluntarySchema = z
  .strictObject({
    rewardEnabled: z.boolean().default(DEFAULT_CONFIG.voluntary.rewardEnabled),
    rewardMultiplier: z.number().min(0).max(10).default(DEFAULT_CONFIG.voluntary.rewardMultiplier),
    rewardTiming: z.enum(RewardTiming).default(DEFAULT_CONFIG.voluntary.rewardTiming),
    rewardRounding: z.enum(Rounding).default(DEFAULT_CONFIG.voluntary.rewardRounding),
    allowRelease: z.boolean().default(DEFAULT_CONFIG.voluntary.allowRelease),
  })
  .default(DEFAULT_CONFIG.voluntary);

const AssignmentSchema = z
  .strictObject({
    strategy: z.enum(AssignmentStrategy).default(DEFAULT_CONFIG.assignment.strategy),
    preventImmediateReassignment: z
      .boolean()
      .default(DEFAULT_CONFIG.assignment.preventImmediateReassignment),
    reassignmentCooldownCycles: z
      .number()
      .int()
      .min(0)
      .max(52)
      .default(DEFAULT_CONFIG.assignment.reassignmentCooldownCycles),
    offerDurationMinutes: z
      .number()
      .int()
      .min(1)
      .max(MINUTES_PER_FORTNIGHT)
      .default(DEFAULT_CONFIG.assignment.offerDurationMinutes),
    leadMinutesBeforeDue: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_PER_FORTNIGHT)
      .default(DEFAULT_CONFIG.assignment.leadMinutesBeforeDue),
    relaxConstraintsWhenNoCandidates: z
      .boolean()
      .default(DEFAULT_CONFIG.assignment.relaxConstraintsWhenNoCandidates),
  })
  .default(DEFAULT_CONFIG.assignment);

const BuyoutSchema = z
  .strictObject({
    enabled: z.boolean().default(DEFAULT_CONFIG.buyout.enabled),
    costStrategy: z.enum(BuyoutCostStrategy).default(DEFAULT_CONFIG.buyout.costStrategy),
    fixedCost: z.number().int().min(0).default(DEFAULT_CONFIG.buyout.fixedCost),
    multiplier: z.number().min(0).max(100).default(DEFAULT_CONFIG.buyout.multiplier),
    costFormula: z.string().max(200).nullable().default(DEFAULT_CONFIG.buyout.costFormula),
    costRounding: z.enum(Rounding).default(DEFAULT_CONFIG.buyout.costRounding),
    allowNegativeBalance: z.boolean().default(DEFAULT_CONFIG.buyout.allowNegativeBalance),
    minimumBalance: z.number().int().default(DEFAULT_CONFIG.buyout.minimumBalance),
    maximumDebt: z.number().int().min(0).nullable().default(DEFAULT_CONFIG.buyout.maximumDebt),
    maximumBuyoutsPerWeek: positiveIntOrNull.default(DEFAULT_CONFIG.buyout.maximumBuyoutsPerWeek),
    maximumConsecutiveBuyouts: positiveIntOrNull.default(
      DEFAULT_CONFIG.buyout.maximumConsecutiveBuyouts,
    ),
  })
  .default(DEFAULT_CONFIG.buyout);

const ValueIncreaseSchema = z
  .strictObject({
    strategy: z.enum(ValueIncreaseStrategy).default(DEFAULT_CONFIG.valueIncrease.strategy),
    increment: z.number().int().min(0).default(DEFAULT_CONFIG.valueIncrease.increment),
    percentage: z.number().min(0).max(10000).default(DEFAULT_CONFIG.valueIncrease.percentage),
    multiplier: z.number().min(0).max(100).default(DEFAULT_CONFIG.valueIncrease.multiplier),
    formula: z.string().max(200).nullable().default(DEFAULT_CONFIG.valueIncrease.formula),
    rounding: z.enum(Rounding).default(DEFAULT_CONFIG.valueIncrease.rounding),
    // §44: zero would let a buyout charge points without raising the value.
    minimumIncrease: z.number().int().min(1).default(DEFAULT_CONFIG.valueIncrease.minimumIncrease),
    maximumValue: positiveIntOrNull.default(DEFAULT_CONFIG.valueIncrease.maximumValue),
  })
  .default(DEFAULT_CONFIG.valueIncrease);

const CompletionSchema = z
  .strictObject({
    resetStrategy: z.enum(ResetStrategy).default(DEFAULT_CONFIG.completion.resetStrategy),
    decreasePercentage: z
      .number()
      .int()
      .min(1)
      .max(99)
      .default(DEFAULT_CONFIG.completion.decreasePercentage),
  })
  .default(DEFAULT_CONFIG.completion);

const PointsSchema = z
  .strictObject({
    decay: z
      .strictObject({
        enabled: z.boolean().default(DEFAULT_CONFIG.points.decay.enabled),
        type: z.enum(DecayType).default(DEFAULT_CONFIG.points.decay.type),
        value: z.number().min(0).default(DEFAULT_CONFIG.points.decay.value),
        intervalDays: z.number().int().min(1).max(365).default(DEFAULT_CONFIG.points.decay.intervalDays),
        minimumBalance: z.number().int().default(DEFAULT_CONFIG.points.decay.minimumBalance),
      })
      .default(DEFAULT_CONFIG.points.decay),
  })
  .default(DEFAULT_CONFIG.points);

const FairnessSchema = z
  .strictObject({
    randomAssignmentWeight: z
      .number()
      .min(0)
      .max(100)
      .default(DEFAULT_CONFIG.fairness.randomAssignmentWeight),
    voluntaryWorkWeight: z.number().min(0).max(100).default(DEFAULT_CONFIG.fairness.voluntaryWorkWeight),
    recentAssignmentPenalty: z
      .number()
      .min(0)
      .max(100)
      .default(DEFAULT_CONFIG.fairness.recentAssignmentPenalty),
    // OQ-7: lifetime counts make the system unresponsive within months.
    windowDays: z.number().int().min(7).max(365).default(DEFAULT_CONFIG.fairness.windowDays),
    // PRD §3E: a floor of 0 would make a member unreachable and break ergodicity.
    weightFloor: z.number().gt(0).max(1).default(DEFAULT_CONFIG.fairness.weightFloor),
  })
  .default(DEFAULT_CONFIG.fairness);

const NotificationsSchema = z
  .strictObject({
    inAppEnabled: z.boolean().default(DEFAULT_CONFIG.notifications.inAppEnabled),
    dueSoonLeadMinutes: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_PER_FORTNIGHT)
      .default(DEFAULT_CONFIG.notifications.dueSoonLeadMinutes),
  })
  .default(DEFAULT_CONFIG.notifications);

const HouseholdConfigShape = z
  .strictObject({
    tasks: TasksSchema,
    voluntary: VoluntarySchema,
    assignment: AssignmentSchema,
    buyout: BuyoutSchema,
    valueIncrease: ValueIncreaseSchema,
    completion: CompletionSchema,
    points: PointsSchema,
    fairness: FairnessSchema,
    notifications: NotificationsSchema,
  })
  .default(DEFAULT_CONFIG);

type Ctx = z.core.$RefinementCtx<HouseholdConfig>;

function issue(ctx: Ctx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: 'custom', message, path });
}

/** §5.3's cross-field table, plus the §6.5 formula probes. */
function crossFieldRules(cfg: HouseholdConfig, ctx: Ctx): void {
  // ── buyout ──
  if (cfg.buyout.costStrategy === BuyoutCostStrategy.FIXED && cfg.buyout.fixedCost < 1) {
    issue(ctx, ['buyout', 'fixedCost'], 'Bei Strategie FIXED muss fixedCost mindestens 1 sein.');
  }
  if (cfg.buyout.costStrategy === BuyoutCostStrategy.MULTIPLIER && cfg.buyout.multiplier <= 0) {
    issue(ctx, ['buyout', 'multiplier'], 'Bei Strategie MULTIPLIER muss multiplier größer als 0 sein.');
  }
  if (cfg.buyout.costStrategy === BuyoutCostStrategy.FORMULA) {
    if (cfg.buyout.costFormula === null || cfg.buyout.costFormula.trim() === '') {
      issue(ctx, ['buyout', 'costFormula'], 'Bei Strategie FORMULA muss eine Formel gesetzt sein.');
    } else {
      const report = probeFormula(cfg.buyout.costFormula, 'buyoutCost', {
        forbidDecrease: false,
      });
      for (const failure of report.failures.slice(0, 5)) {
        issue(ctx, ['buyout', 'costFormula'], failure.message);
      }
    }
  }
  if (!cfg.buyout.allowNegativeBalance && cfg.buyout.minimumBalance < 0) {
    issue(
      ctx,
      ['buyout', 'minimumBalance'],
      'Ohne erlaubten Negativsaldo darf minimumBalance nicht negativ sein.',
    );
  }
  if (cfg.buyout.allowNegativeBalance && (cfg.buyout.maximumDebt === null || cfg.buyout.maximumDebt <= 0)) {
    issue(
      ctx,
      ['buyout', 'maximumDebt'],
      'Bei erlaubtem Negativsaldo muss maximumDebt gesetzt und größer als 0 sein.',
    );
  }

  // ── value increase — the §44 guarantee, expressed as configuration rules ──
  switch (cfg.valueIncrease.strategy) {
    case ValueIncreaseStrategy.MULTIPLIER:
      if (cfg.valueIncrease.multiplier <= 1) {
        issue(
          ctx,
          ['valueIncrease', 'multiplier'],
          'Ein Multiplikator kleiner oder gleich 1 kann den Aufgabenwert nicht erhöhen.',
        );
      }
      break;
    case ValueIncreaseStrategy.PERCENTAGE:
      if (cfg.valueIncrease.percentage <= 0) {
        issue(ctx, ['valueIncrease', 'percentage'], 'percentage muss größer als 0 sein.');
      }
      break;
    case ValueIncreaseStrategy.FIXED_INCREMENT:
      if (cfg.valueIncrease.increment < 1) {
        issue(ctx, ['valueIncrease', 'increment'], 'increment muss mindestens 1 sein.');
      }
      break;
    case ValueIncreaseStrategy.CUSTOM_FORMULA:
      if (cfg.valueIncrease.formula === null || cfg.valueIncrease.formula.trim() === '') {
        issue(ctx, ['valueIncrease', 'formula'], 'Bei CUSTOM_FORMULA muss eine Formel gesetzt sein.');
      } else {
        const report = probeFormula(cfg.valueIncrease.formula, 'valueIncrease', {
          forbidDecrease: true,
        });
        for (const failure of report.failures.slice(0, 5)) {
          issue(ctx, ['valueIncrease', 'formula'], failure.message);
        }
      }
      break;
  }

  if (
    cfg.valueIncrease.maximumValue !== null &&
    cfg.valueIncrease.maximumValue < cfg.valueIncrease.minimumIncrease
  ) {
    issue(
      ctx,
      ['valueIncrease', 'maximumValue'],
      'maximumValue darf nicht kleiner als minimumIncrease sein.',
    );
  }

  // ── decay ──
  if (cfg.points.decay.enabled) {
    if (cfg.points.decay.type === DecayType.NONE) {
      issue(ctx, ['points', 'decay', 'type'], 'Bei aktiviertem Punktverfall darf type nicht NONE sein.');
    }
    if (cfg.points.decay.value <= 0) {
      issue(ctx, ['points', 'decay', 'value'], 'Bei aktiviertem Punktverfall muss value größer als 0 sein.');
    }
  }
}

export const HouseholdConfigSchema = HouseholdConfigShape.superRefine(crossFieldRules);

/**
 * §5.3 — `PUT /admin/config` accepts §39's / §16's booleans as legacy aliases
 * and normalizes them onto `completion.resetStrategy`, which subsumes both.
 * Returns a plain object; validation is still the schema's job.
 */
export function normalizeLegacyConfigInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;

  const draft = deepCloneJson(input) as Record<string, unknown>;

  const readBoolean = (container: unknown, key: string): boolean | undefined => {
    if (typeof container !== 'object' || container === null) return undefined;
    const record = container as Record<string, unknown>;
    if (!Object.hasOwn(record, key)) return undefined;
    const value = record[key];
    delete record[key];
    return typeof value === 'boolean' ? value : undefined;
  };

  const legacy =
    readBoolean(draft['tasks'], 'resetValueAfterCompletion') ??
    readBoolean(draft['completion'], 'resetValueToBase');

  if (legacy !== undefined) {
    const completion = (draft['completion'] ?? {}) as Record<string, unknown>;
    if (!Object.hasOwn(completion, 'resetStrategy')) {
      completion['resetStrategy'] = legacy ? ResetStrategy.BASE_VALUE : ResetStrategy.KEEP_CURRENT;
    }
    draft['completion'] = completion;
  }

  return draft;
}

export interface ConfigFieldError {
  path: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  config: HouseholdConfig | null;
  fieldErrors: ConfigFieldError[];
}

/** The single entry point both `POST /config/validate` and `PUT /config` use. */
export function validateConfig(input: unknown): ConfigValidationResult {
  const result = HouseholdConfigSchema.safeParse(normalizeLegacyConfigInput(input));
  if (result.success) {
    return { valid: true, config: result.data, fieldErrors: [] };
  }
  return {
    valid: false,
    config: null,
    fieldErrors: result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

/** Throws on invalid input. Used by the seed and by internal bootstrapping. */
export function parseConfig(input: unknown): HouseholdConfig {
  const result = validateConfig(input);
  if (!result.config) {
    const detail = result.fieldErrors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
    throw new Error(`Ungültige Haushaltskonfiguration — ${detail}`);
  }
  return result.config;
}

// Compile-time proof that the hand-written type in `types.ts` and the schema
// cannot drift apart. Neither assignment compiles if they diverge.
type SchemaOutput = z.infer<typeof HouseholdConfigSchema>;
const _schemaMatchesType: SchemaOutput = DEFAULT_CONFIG;
const _typeMatchesSchema: HouseholdConfig = _schemaMatchesType;
void _typeMatchesSchema;
