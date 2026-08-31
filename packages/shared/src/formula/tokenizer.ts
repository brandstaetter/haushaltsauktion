/**
 * Tokenizer (Architektur §6.2).
 *
 * The character set is an **allowlist**, not a denylist: any byte outside
 * `[0-9a-zA-Z_. \t+\-*\/(),]` is a `FormulaError` at its offset. That is what
 * keeps quotes, brackets, backticks, semicolons, `$`, `\` and every other
 * injection primitive out of the language by construction rather than by a
 * blocklist somebody has to keep current.
 */

import { FormulaError, FormulaErrorCode } from './errors.js';

export type TokenKind = 'NUMBER' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

/** §6.4 — admin config is not a programming surface. */
export const MAX_SOURCE_LENGTH = 200;
export const MAX_TOKENS = 100;

const DIGIT = /[0-9]/;
const IDENT_START = /[a-zA-Z]/;
const IDENT_PART = /[a-zA-Z0-9_]/;
const WHITESPACE = ' \t';
const OPERATORS = '+-*/';

/** The complete set of characters the language accepts. */
const ALLOWED = /^[0-9a-zA-Z_. \t+\-*/(),]$/;

export function tokenize(source: string): Token[] {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new FormulaError(
      FormulaErrorCode.SOURCE_TOO_LONG,
      `Ausdruck ist länger als ${MAX_SOURCE_LENGTH} Zeichen.`,
      MAX_SOURCE_LENGTH,
    );
  }

  const tokens: Token[] = [];
  let i = 0;

  const push = (kind: TokenKind, value: string, pos: number): void => {
    if (tokens.length >= MAX_TOKENS) {
      throw new FormulaError(
        FormulaErrorCode.TOO_MANY_TOKENS,
        `Ausdruck hat mehr als ${MAX_TOKENS} Token.`,
        pos,
      );
    }
    tokens.push({ kind, value, pos });
  };

  while (i < source.length) {
    const ch = source[i] as string;

    if (!ALLOWED.test(ch)) {
      throw new FormulaError(
        FormulaErrorCode.ILLEGAL_CHARACTER,
        `Unerlaubtes Zeichen ${JSON.stringify(ch)}.`,
        i,
      );
    }

    if (WHITESPACE.includes(ch)) {
      i += 1;
      continue;
    }

    if (ch === '(') {
      push('LPAREN', ch, i);
      i += 1;
      continue;
    }
    if (ch === ')') {
      push('RPAREN', ch, i);
      i += 1;
      continue;
    }
    if (ch === ',') {
      push('COMMA', ch, i);
      i += 1;
      continue;
    }
    if (OPERATORS.includes(ch)) {
      push('OP', ch, i);
      i += 1;
      continue;
    }

    if (DIGIT.test(ch)) {
      const start = i;
      while (i < source.length && DIGIT.test(source[i] as string)) i += 1;

      if (source[i] === '.') {
        i += 1;
        if (i >= source.length || !DIGIT.test(source[i] as string)) {
          throw new FormulaError(
            FormulaErrorCode.MALFORMED_NUMBER,
            'Nach dem Dezimalpunkt muss mindestens eine Ziffer stehen.',
            i,
          );
        }
        while (i < source.length && DIGIT.test(source[i] as string)) i += 1;
      }

      // A second dot ("1.2.3") is rejected here rather than silently truncated.
      if (source[i] === '.') {
        throw new FormulaError(
          FormulaErrorCode.MALFORMED_NUMBER,
          'Eine Zahl darf nur einen Dezimalpunkt enthalten.',
          i,
        );
      }

      push('NUMBER', source.slice(start, i), start);
      continue;
    }

    if (IDENT_START.test(ch)) {
      const start = i;
      while (i < source.length && IDENT_PART.test(source[i] as string)) i += 1;
      push('IDENT', source.slice(start, i), start);
      continue;
    }

    // Remaining allowed characters that cannot start a token: '.' and '_'.
    throw new FormulaError(
      FormulaErrorCode.UNEXPECTED_TOKEN,
      `${JSON.stringify(ch)} kann keinen Ausdruck beginnen.`,
      i,
    );
  }

  push('EOF', '', source.length);
  return tokens;
}
