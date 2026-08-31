/**
 * `DomainError` → HTTP (Architektur §3.13).
 *
 * The domain never knows about HTTP; it only knows that a rule was broken and
 * which one. This is the single place that decision becomes a status code, so
 * a new error code cannot quietly ship as a 500.
 *
 * `code` is stable and machine-readable, `message` is German and safe to
 * display, `details` carries structured context so the UI can *react* rather
 * than only alert — a `QUOTE_STALE` hands back the fresh quote, an
 * `ILLEGAL_TRANSITION` hands back what *is* allowed.
 */

import { Prisma } from '@prisma/client';
import type { ErrorCode } from '@haushaltsauktion/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { DomainError } from '../../domain/errors.js';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  NOT_ELIGIBLE: 403,
  NOT_ASSIGNEE: 403,
  BUYOUT_DISABLED: 403,
  RELEASE_DISABLED: 403,
  ACCOUNT_DISABLED: 403,
  NOT_FOUND: 404,
  TASK_NOT_AVAILABLE: 409,
  STALE_VIEW: 409,
  ASSIGNMENT_CLOSED: 409,
  ILLEGAL_TRANSITION: 409,
  NOT_RANDOM_ASSIGNMENT: 409,
  NOT_VOLUNTARY: 409,
  QUOTE_STALE: 409,
  INSUFFICIENT_POINTS: 409,
  BUYOUT_LIMIT_REACHED: 409,
  BUYOUT_AT_VALUE_CAP: 409,
  CONFIG_VERSION_CONFLICT: 409,
  HAS_OPEN_INSTANCES: 409,
  CATEGORY_IN_USE: 409,
  EMAIL_ALREADY_REGISTERED: 409,
  VALIDATION_FAILED: 422,
  CONFIG_INVALID: 422,
  LAST_ADMIN: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function statusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export interface ApiError {
  status: number;
  body: { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };
}

export function toApiError(error: unknown, correlationId: string): ApiError {
  if (error instanceof DomainError) {
    const status = statusFor(error.code);
    return {
      status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(Object.keys(error.details).length > 0
            ? { details: { ...error.details } }
            : {}),
        },
      },
    };
  }

  // The three Prisma failures that are business outcomes rather than bugs.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      // A unique violation here is guard 3 of §4.7 firing — the sentinel index
      // or an idempotency key. Someone else got there first.
      return {
        status: 409,
        body: {
          error: {
            code: 'TASK_NOT_AVAILABLE',
            message: 'Diese Aktion wurde bereits ausgeführt oder war zu spät.',
            details: { constraint: error.meta?.['target'] ?? null },
          },
        },
      };
    }
    if (error.code === 'P2025') {
      return {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } },
      };
    }
    if (error.code === 'P2003') {
      return {
        status: 409,
        body: {
          error: { code: 'HAS_OPEN_INSTANCES', message: 'Referenzierte Daten verhindern das.' },
        },
      };
    }
  }

  // Everything else: the correlation id goes to the log, never the cause (§3.13).
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unerwarteter Fehler.',
        details: { correlationId },
      },
    },
  };
}

export function registerErrorHandler(app: {
  setErrorHandler(
    handler: (error: unknown, request: FastifyRequest, reply: FastifyReply) => void,
  ): unknown;
}): void {
  app.setErrorHandler((error, request, reply) => {
    const correlationId = request.id;

    // @fastify/rate-limit throws with `statusCode: 429` before any use-case runs.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      void reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Zu viele Anfragen. Bitte kurz warten.',
          details: { retryAfterSeconds: Number(reply.getHeader('retry-after') ?? 60) },
        },
      });
      return;
    }
    if (statusCode === 400 && (error as { validation?: unknown }).validation) {
      void reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Ungültige Anfrage.',
          details: { fieldErrors: [] },
        },
      });
      return;
    }

    const mapped = toApiError(error, correlationId);
    if (mapped.status >= 500) {
      request.log.error({ err: error, correlationId }, 'unhandled error');
    }
    void reply.status(mapped.status).send(mapped.body);
  });
}
