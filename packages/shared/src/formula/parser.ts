/**
 * Recursive-descent parser (Architektur §6.1, §6.3, §6.4).
 *
 * Grammar:
 *   expression := term    ( ( "+" | "-" ) term )*
 *   term       := unary   ( ( "*" | "/" ) unary )*
 *   unary      := ( "-" | "+" )? primary
 *   primary    := NUMBER | IDENT | IDENT "(" [ args ] ")" | "(" expression ")"
 *
 * There is deliberately no exponentiation, modulo, comparison, ternary,
 * assignment, string, member access or indexing. Function and variable names
 * are checked against a whitelist **at parse time**, so an unknown identifier
 * can never reach the evaluator.
 */

import { FormulaError, FormulaErrorCode } from './errors.js';
import { tokenize, type Token } from './tokenizer.js';

export type BinaryOp = '+' | '-' | '*' | '/';
export type UnaryOp = '-' | '+';

/** §6.4 — the complete function whitelist, with arity. */
export const FUNCTIONS = Object.freeze({
  ceil: 1,
  floor: 1,
  round: 1,
  min: 2,
  max: 2,
} as const);

export type FunctionName = keyof typeof FUNCTIONS;

export const FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS) as FunctionName[]);

export type Node =
  | { type: 'Number'; value: number }
  | { type: 'Variable'; name: string }
  | { type: 'Unary'; op: UnaryOp; operand: Node }
  | { type: 'Binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'Call'; name: FunctionName; args: Node[] };

/** §6.4 limits. */
export const MAX_NODES = 100;
export const MAX_DEPTH = 16;

export interface ParseOptions {
  /**
   * The variables this expression may reference (§6.5). An identifier outside
   * this set is a parse error, so a formula can never read something the
   * evaluation context does not supply.
   */
  allowedVariables: readonly string[];
}

export interface ParsedFormula {
  source: string;
  ast: Node;
  /** Variables actually referenced — a subset of `allowedVariables`. */
  variables: readonly string[];
  nodeCount: number;
  depth: number;
}

class Parser {
  private index = 0;
  private nodes = 0;
  private depth = 0;
  private maxDepth = 0;
  private readonly used = new Set<string>();
  private readonly allowed: ReadonlySet<string>;

  constructor(
    private readonly tokens: Token[],
    allowedVariables: readonly string[],
  ) {
    this.allowed = new Set(allowedVariables);
  }

  parse(): { ast: Node; variables: string[]; nodeCount: number; depth: number } {
    if (this.peek().kind === 'EOF') {
      throw new FormulaError(FormulaErrorCode.EMPTY_SOURCE, 'Der Ausdruck ist leer.', 0);
    }
    const ast = this.expression();
    const tail = this.peek();
    if (tail.kind !== 'EOF') {
      throw new FormulaError(
        FormulaErrorCode.TRAILING_INPUT,
        `Unerwartetes ${JSON.stringify(tail.value)} nach dem Ausdruck.`,
        tail.pos,
      );
    }
    return {
      ast,
      variables: [...this.used],
      nodeCount: this.nodes,
      depth: this.maxDepth,
    };
  }

  // ── token helpers ──

  private peek(): Token {
    // The tokenizer always appends EOF, so this index is always in range.
    return this.tokens[this.index] ?? { kind: 'EOF', value: '', pos: 0 };
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== 'EOF') this.index += 1;
    return token;
  }

  private expect(kind: 'LPAREN' | 'RPAREN' | 'COMMA', what: string): Token {
    const token = this.peek();
    if (token.kind !== kind) {
      const code =
        token.kind === 'EOF' ? FormulaErrorCode.UNEXPECTED_EOF : FormulaErrorCode.UNEXPECTED_TOKEN;
      throw new FormulaError(code, `${what} erwartet.`, token.pos);
    }
    return this.advance();
  }

  private track<T extends Node>(node: T): T {
    this.nodes += 1;
    if (this.nodes > MAX_NODES) {
      throw new FormulaError(
        FormulaErrorCode.TOO_MANY_NODES,
        `Ausdruck hat mehr als ${MAX_NODES} Knoten.`,
        this.peek().pos,
      );
    }
    return node;
  }

  private enter(pos: number): void {
    this.depth += 1;
    if (this.depth > this.maxDepth) this.maxDepth = this.depth;
    if (this.depth > MAX_DEPTH) {
      throw new FormulaError(
        FormulaErrorCode.TOO_DEEP,
        `Ausdruck ist tiefer als ${MAX_DEPTH} Ebenen verschachtelt.`,
        pos,
      );
    }
  }

  private exit(): void {
    this.depth -= 1;
  }

  // ── grammar ──

  private expression(): Node {
    let left = this.term();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'OP' || (token.value !== '+' && token.value !== '-')) return left;
      this.advance();
      const right = this.term();
      left = this.track<Node>({ type: 'Binary', op: token.value as BinaryOp, left, right });
    }
  }

  private term(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'OP' || (token.value !== '*' && token.value !== '/')) return left;
      this.advance();
      const right = this.unary();
      left = this.track<Node>({ type: 'Binary', op: token.value as BinaryOp, left, right });
    }
  }

  private unary(): Node {
    const token = this.peek();
    if (token.kind === 'OP' && (token.value === '-' || token.value === '+')) {
      this.advance();
      this.enter(token.pos);
      const operand = this.unary();
      this.exit();
      return this.track<Node>({ type: 'Unary', op: token.value as UnaryOp, operand });
    }
    return this.primary();
  }

  private primary(): Node {
    const token = this.peek();

    if (token.kind === 'NUMBER') {
      this.advance();
      return this.track<Node>({ type: 'Number', value: Number(token.value) });
    }

    if (token.kind === 'LPAREN') {
      this.advance();
      this.enter(token.pos);
      const inner = this.expression();
      this.exit();
      this.expect('RPAREN', 'Schließende Klammer');
      return inner;
    }

    if (token.kind === 'IDENT') {
      this.advance();
      const name = token.value;

      if (this.peek().kind === 'LPAREN') {
        if (!Object.hasOwn(FUNCTIONS, name)) {
          throw new FormulaError(
            FormulaErrorCode.UNKNOWN_FUNCTION,
            `Unbekannte Funktion ${JSON.stringify(name)}. Erlaubt: ${FUNCTION_NAMES.join(', ')}.`,
            token.pos,
          );
        }
        const fn = name as FunctionName;
        this.expect('LPAREN', 'Öffnende Klammer');
        this.enter(token.pos);
        const args: Node[] = [];
        if (this.peek().kind !== 'RPAREN') {
          args.push(this.expression());
          while (this.peek().kind === 'COMMA') {
            this.advance();
            args.push(this.expression());
          }
        }
        this.exit();
        this.expect('RPAREN', 'Schließende Klammer');

        const arity: number = FUNCTIONS[fn];
        if (args.length !== arity) {
          throw new FormulaError(
            FormulaErrorCode.WRONG_ARITY,
            `${name} erwartet ${arity} Argument(e), erhielt ${args.length}.`,
            token.pos,
          );
        }
        return this.track<Node>({ type: 'Call', name: fn, args });
      }

      if (!this.allowed.has(name)) {
        throw new FormulaError(
          FormulaErrorCode.UNKNOWN_VARIABLE,
          `Unbekannte Variable ${JSON.stringify(name)}. Erlaubt: ${[...this.allowed].join(', ')}.`,
          token.pos,
        );
      }
      this.used.add(name);
      return this.track<Node>({ type: 'Variable', name });
    }

    const code =
      token.kind === 'EOF' ? FormulaErrorCode.UNEXPECTED_EOF : FormulaErrorCode.UNEXPECTED_TOKEN;
    throw new FormulaError(
      code,
      token.kind === 'EOF'
        ? 'Ausdruck endet unerwartet.'
        : `Unerwartetes ${JSON.stringify(token.value)}.`,
      token.pos,
    );
  }
}

export function parseFormula(source: string, options: ParseOptions): ParsedFormula {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, options.allowedVariables);
  const { ast, variables, nodeCount, depth } = parser.parse();
  return { source, ast, variables, nodeCount, depth };
}
