/**
 * Variable environments (Architektur §6.5).
 *
 * Exactly PRD §2's three variables. `memberBalance` was considered and
 * rejected: means-tested pricing is a product decision nobody asked for, and it
 * would couple formula evaluation to a locked row.
 */

export const FORMULA_CONTEXTS = Object.freeze({
  buyoutCost: Object.freeze(['currentValue', 'baseValue', 'buyoutCount'] as const),
  valueIncrease: Object.freeze(['currentValue', 'baseValue', 'buyoutCount'] as const),
});

export type FormulaContextName = keyof typeof FORMULA_CONTEXTS;

/** The evaluation environment both contexts expect. */
export interface FormulaContext {
  currentValue: number;
  baseValue: number;
  buyoutCount: number;
}

export function formulaEnv(ctx: FormulaContext): Readonly<Record<string, number>> {
  // A null-prototype object: even if a lookup escaped the parser's whitelist
  // and the evaluator's `Object.hasOwn` guard, there is no prototype to reach.
  return Object.freeze(
    Object.assign(Object.create(null) as Record<string, number>, {
      currentValue: ctx.currentValue,
      baseValue: ctx.baseValue,
      buyoutCount: ctx.buyoutCount,
    }),
  );
}
