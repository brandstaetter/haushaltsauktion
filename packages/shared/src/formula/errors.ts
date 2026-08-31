/**
 * Formula subsystem errors (Architektur §6).
 *
 * Every failure carries a character offset so `POST /api/admin/config/preview`
 * can point the admin at the exact place in their expression
 * (Reconciliation §1.3).
 */

export const FormulaErrorCode = Object.freeze({
  SOURCE_TOO_LONG: 'SOURCE_TOO_LONG',
  EMPTY_SOURCE: 'EMPTY_SOURCE',
  ILLEGAL_CHARACTER: 'ILLEGAL_CHARACTER',
  MALFORMED_NUMBER: 'MALFORMED_NUMBER',
  TOO_MANY_TOKENS: 'TOO_MANY_TOKENS',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  UNEXPECTED_EOF: 'UNEXPECTED_EOF',
  TRAILING_INPUT: 'TRAILING_INPUT',
  UNKNOWN_FUNCTION: 'UNKNOWN_FUNCTION',
  WRONG_ARITY: 'WRONG_ARITY',
  UNKNOWN_VARIABLE: 'UNKNOWN_VARIABLE',
  TOO_MANY_NODES: 'TOO_MANY_NODES',
  TOO_DEEP: 'TOO_DEEP',
  NOT_FINITE: 'NOT_FINITE',
} as const);
export type FormulaErrorCode = (typeof FormulaErrorCode)[keyof typeof FormulaErrorCode];

export class FormulaError extends Error {
  readonly code: FormulaErrorCode;
  /** Zero-based character offset into the source expression. */
  readonly pos: number;

  constructor(code: FormulaErrorCode, message: string, pos: number) {
    super(message);
    this.name = 'FormulaError';
    this.code = code;
    this.pos = pos;
  }

  toJSON(): { code: FormulaErrorCode; message: string; pos: number } {
    return { code: this.code, message: this.message, pos: this.pos };
  }
}
