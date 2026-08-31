/**
 * Tree-walking evaluator (Architektur §6.4).
 *
 * A single walk over an AST that the parser has already proven to contain only
 * whitelisted operators, whitelisted functions and whitelisted variables. There
 * are no loops, no recursion into user data and no allocation beyond the AST,
 * so the work is bounded by `MAX_NODES` and no timeout mechanism is required.
 *
 * There is no `eval`, no `new Function`, no `vm`, and no dynamic property
 * access anywhere in this module — §17 forbids all of them.
 */

import { FormulaError, FormulaErrorCode } from './errors.js';
import {
  parseFormula,
  type BinaryOp,
  type FunctionName,
  type Node,
  type ParseOptions,
  type ParsedFormula,
} from './parser.js';

export type FormulaEnv = Readonly<Record<string, number>>;

function finite(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new FormulaError(FormulaErrorCode.NOT_FINITE, `${what} ergab keinen endlichen Wert.`, 0);
  }
  return value;
}

function applyBinary(op: BinaryOp, left: number, right: number): number {
  switch (op) {
    case '+':
      return finite(left + right, 'Addition');
    case '-':
      return finite(left - right, 'Subtraktion');
    case '*':
      return finite(left * right, 'Multiplikation');
    case '/':
      return finite(left / right, 'Division');
  }
}

function applyFunction(name: FunctionName, args: readonly number[]): number {
  const a = args[0] ?? 0;
  const b = args[1] ?? 0;
  switch (name) {
    case 'ceil':
      return finite(Math.ceil(a), 'ceil');
    case 'floor':
      return finite(Math.floor(a), 'floor');
    case 'round':
      return finite(Math.round(a), 'round');
    case 'min':
      return finite(Math.min(a, b), 'min');
    case 'max':
      return finite(Math.max(a, b), 'max');
  }
}

function readVariable(name: string, env: FormulaEnv): number {
  // `Object.hasOwn` plus a typeof guard, so a name such as `constructor`,
  // `__proto__` or `toString` can never resolve to an inherited member. The
  // parser already rejects any identifier outside the context whitelist; this
  // is the second, independent barrier.
  if (!Object.hasOwn(env, name)) {
    throw new FormulaError(
      FormulaErrorCode.UNKNOWN_VARIABLE,
      `Variable ${JSON.stringify(name)} ist im Kontext nicht gesetzt.`,
      0,
    );
  }
  const value = env[name];
  if (typeof value !== 'number') {
    throw new FormulaError(
      FormulaErrorCode.UNKNOWN_VARIABLE,
      `Variable ${JSON.stringify(name)} ist keine Zahl.`,
      0,
    );
  }
  return finite(value, `Variable ${name}`);
}

function evaluateNode(node: Node, env: FormulaEnv): number {
  switch (node.type) {
    case 'Number':
      return node.value;
    case 'Variable':
      return readVariable(node.name, env);
    case 'Unary': {
      const operand = evaluateNode(node.operand, env);
      return node.op === '-' ? -operand : operand;
    }
    case 'Binary':
      return applyBinary(node.op, evaluateNode(node.left, env), evaluateNode(node.right, env));
    case 'Call':
      return applyFunction(
        node.name,
        node.args.map((arg) => evaluateNode(arg, env)),
      );
  }
}

/** Evaluate an already-parsed formula. Throws `FormulaError` on any failure. */
export function evaluateFormula(parsed: ParsedFormula, env: FormulaEnv): number {
  return finite(evaluateNode(parsed.ast, env), 'Ausdruck');
}

/**
 * Parse once, evaluate many times. The hot path (buyout cost, value increase)
 * uses this so a formula is not re-tokenized per request.
 */
export function compileFormula(
  source: string,
  options: ParseOptions,
): { parsed: ParsedFormula; evaluate: (env: FormulaEnv) => number } {
  const parsed = parseFormula(source, options);
  return { parsed, evaluate: (env) => evaluateFormula(parsed, env) };
}

/** Convenience for one-shot use (tests, admin previews). */
export function runFormula(source: string, options: ParseOptions, env: FormulaEnv): number {
  return evaluateFormula(parseFormula(source, options), env);
}
