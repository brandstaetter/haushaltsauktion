import { describe, expect, it } from 'vitest';

import {
  FORMULA_CONTEXTS,
  FormulaError,
  compileFormula,
  formulaEnv,
  parseFormula,
  probeFormula,
  runFormula,
  tokenize,
} from '../src/formula/index.js';

const valueIncrease = { allowedVariables: FORMULA_CONTEXTS.valueIncrease };

const evalWith = (source: string, ctx = { currentValue: 4, baseValue: 4, buyoutCount: 0 }): number =>
  runFormula(source, valueIncrease, formulaEnv(ctx));

describe('tokenizer (§6.2)', () => {
  it('skips whitespace and tags every token with its offset', () => {
    const tokens = tokenize(' 12 + currentValue ');
    expect(tokens.map((t) => [t.kind, t.value])).toEqual([
      ['NUMBER', '12'],
      ['OP', '+'],
      ['IDENT', 'currentValue'],
      ['EOF', ''],
    ]);
    expect(tokens[2]?.pos).toBe(6);
  });

  it('accepts a single decimal point and rejects anything else', () => {
    expect(tokenize('1.5').map((t) => t.value)).toEqual(['1.5', '']);
    expect(() => tokenize('1.2.3')).toThrow(FormulaError);
    expect(() => tokenize('1.')).toThrow(FormulaError);
    expect(() => tokenize('.5')).toThrow(FormulaError);
    expect(() => tokenize('..')).toThrow(FormulaError);
  });
});

describe('parser and evaluator (§6.1, §6.3, §6.4)', () => {
  it('applies standard precedence and left associativity', () => {
    expect(evalWith('1 + 2 * 3')).toBe(7);
    expect(evalWith('(1 + 2) * 3')).toBe(9);
    expect(evalWith('10 - 3 - 2')).toBe(5);
    expect(evalWith('12 / 3 / 2')).toBe(2);
  });

  it('binds unary minus tighter than binary operators', () => {
    expect(evalWith('-2 * 3')).toBe(-6);
    expect(evalWith('3 - -2')).toBe(5);
    expect(evalWith('--4')).toBe(4);
  });

  it('supports exactly the five whitelisted functions', () => {
    expect(evalWith('ceil(1.2)')).toBe(2);
    expect(evalWith('floor(1.8)')).toBe(1);
    expect(evalWith('round(1.5)')).toBe(2);
    expect(evalWith('min(3, 7)')).toBe(3);
    expect(evalWith('max(3, 7)')).toBe(7);
  });

  it('resolves the three context variables', () => {
    const ctx = { currentValue: 9, baseValue: 4, buyoutCount: 2 };
    expect(evalWith('currentValue', ctx)).toBe(9);
    expect(evalWith('baseValue', ctx)).toBe(4);
    expect(evalWith('buyoutCount', ctx)).toBe(2);
  });

  it('reports which variables an expression actually uses', () => {
    const parsed = parseFormula('currentValue + buyoutCount', valueIncrease);
    expect([...parsed.variables].sort()).toEqual(['buyoutCount', 'currentValue']);
  });

  it('reproduces the §35 escalation chain 4 -> 6 -> 9 -> 14', () => {
    const { evaluate } = compileFormula('ceil(currentValue * 1.5)', valueIncrease);
    const chain: number[] = [4];
    for (let i = 0; i < 3; i += 1) {
      const currentValue = chain[chain.length - 1] as number;
      chain.push(evaluate(formulaEnv({ currentValue, baseValue: 4, buyoutCount: i })));
    }
    expect(chain).toEqual([4, 6, 9, 14]);
  });

  it('rejects a division that does not produce a finite value', () => {
    expect(() => evalWith('1 / 0')).toThrow(FormulaError);
  });

  it('rejects wrong arity at parse time, before any evaluation', () => {
    expect(() => parseFormula('min(1)', valueIncrease)).toThrow(/erwartet 2 Argument/);
    expect(() => parseFormula('ceil(1, 2)', valueIncrease)).toThrow(/erwartet 1 Argument/);
  });
});

describe('validation-time probing (§6.5)', () => {
  it('accepts the multiplicative form the default strategy implements', () => {
    // ceil(0 * 1.5) = 0 is not a decrease, so this passes. Requiring a *strict*
    // increase at every probe would reject every multiplicative formula, since
    // the grid includes currentValue = 0 — see the note on probeFormula.
    const report = probeFormula('ceil(currentValue * 1.5)', 'valueIncrease', {
      forbidDecrease: true,
    });
    expect(report.failures).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it('accepts an additive formula', () => {
    const report = probeFormula('currentValue + 2', 'valueIncrease', { forbidDecrease: true });
    expect(report.valid).toBe(true);
  });

  it('rejects a formula that shrinks the value', () => {
    const report = probeFormula('currentValue - 1', 'valueIncrease', { forbidDecrease: true });
    expect(report.valid).toBe(false);
    expect(report.failures[0]?.code).toBe('DECREASES_VALUE');
  });

  it('rejects a formula that halves the value', () => {
    const report = probeFormula('currentValue / 2', 'valueIncrease', { forbidDecrease: true });
    expect(report.valid).toBe(false);
    expect(report.failures.every((f) => f.code === 'DECREASES_VALUE')).toBe(true);
  });

  it('reports a parse error with its character offset instead of throwing', () => {
    const report = probeFormula('currentValue * ', 'buyoutCost', { forbidDecrease: false });
    expect(report.valid).toBe(false);
    expect(report.samples).toBeNull();
    expect(report.failures[0]?.pos).toBeGreaterThan(0);
  });

  it('does not constrain the direction of a buyout cost formula', () => {
    const report = probeFormula('max(1, currentValue - 2)', 'buyoutCost', {
      forbidDecrease: false,
    });
    expect(report.valid).toBe(true);
  });
});
