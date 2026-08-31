/**
 * The domain error hierarchy (Architektur §7.1, §3.13).
 *
 * Domain functions throw these; `infra/http/error-mapper.ts` maps each one to
 * its HTTP status and stable `code`. The domain never knows about HTTP — it
 * only knows that a rule was broken and which one.
 */

import type { ErrorCode } from '@haushaltsauktion/shared';

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = Object.freeze({ ...details });
  }
}

/** 404 — absent, or in another household. Indistinguishable by design (§3.13). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
}

/** 403 — authenticated, but the rule says no. */
export class ForbiddenError extends DomainError {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}

/** 409 — the world moved, or a business precondition failed. */
export class ConflictError extends DomainError {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}

/** 422 — the input itself is not acceptable. */
export class ValidationError extends DomainError {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}

/**
 * 409 `ILLEGAL_TRANSITION` (§2.4). Carries `allowedEvents` so the UI can say
 * what *is* possible rather than only what failed.
 */
export class IllegalTransitionError extends DomainError {
  readonly code = 'ILLEGAL_TRANSITION' as const;

  constructor(
    readonly from: string,
    readonly event: string,
    readonly allowedEvents: readonly string[],
  ) {
    super(`Ereignis ${event} ist im Status ${from} nicht erlaubt.`, {
      from,
      event,
      allowedEvents: [...allowedEvents],
    });
  }
}
