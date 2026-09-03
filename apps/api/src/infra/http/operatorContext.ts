/**
 * The operator request context (Architektur `.planning/architecture-operator-dashboard.md`,
 * Key Decisions: "Where `requireOperator` lives").
 *
 * Deliberately a separate file from `context.ts`, not an addition to it.
 * `context.ts`'s own header comment calls itself "the single choke point for
 * household scoping" — mixing in a parallel identity system that is
 * deliberately *not* household-scoped would make that claim false. An
 * `OperatorRequestContext` has no `householdId` and no `role: MemberRole`;
 * there is structurally nothing here for a bug to leak across households
 * through, because there is no household field to leak.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { ForbiddenError } from '../../domain/errors.js';
import { OPERATOR_SESSION_COOKIE } from '../auth/operatorSession.js';
import { CSRF_HEADER, hashToken, safeEquals } from '../auth/session.js';

export interface OperatorRequestContext {
  operatorAccountId: string;
  operatorSessionId: string;
  csrfTokenHash: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    operatorCtx?: OperatorRequestContext;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ResolvedOperatorSession {
  ctx: OperatorRequestContext | null;
  /** Why there is no context, when there is none. */
  failure: 'NO_COOKIE' | 'UNKNOWN' | 'EXPIRED' | null;
}

export async function resolveOperatorSession(
  db: PrismaClient,
  rawToken: string | undefined,
  now: Date,
): Promise<ResolvedOperatorSession> {
  if (!rawToken) return { ctx: null, failure: 'NO_COOKIE' };

  const session = await db.operatorSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      operatorAccountId: true,
      csrfTokenHash: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (session === null) return { ctx: null, failure: 'UNKNOWN' };
  if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    return { ctx: null, failure: 'EXPIRED' };
  }

  // No membership/household lookup here, unlike `resolveSession` in
  // context.ts — operator accounts have no such concept to re-check.
  return {
    failure: null,
    ctx: {
      operatorAccountId: session.operatorAccountId,
      operatorSessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
    },
  };
}

/** Attaches `request.operatorCtx` when a valid operator session is present. Never rejects. */
export function makeOperatorContextPreHandler(db: PrismaClient, now: () => Date) {
  return async function attachOperatorContext(request: FastifyRequest): Promise<void> {
    const raw = request.cookies?.[OPERATOR_SESSION_COOKIE];
    const resolved = await resolveOperatorSession(db, raw, now());
    if (resolved.ctx !== null) {
      request.operatorCtx = resolved.ctx;
      // Best-effort liveness. Failure here must never break the request.
      void db.operatorSession
        .update({ where: { id: resolved.ctx.operatorSessionId }, data: { lastSeenAt: now() } })
        .catch(() => undefined);
    }
  };
}

/** The operator gate, plus CSRF for every unsafe method — mirrors `requireMember`. */
export function requireOperator(
  request: FastifyRequest,
  _reply: FastifyReply,
): OperatorRequestContext {
  const ctx = request.operatorCtx;
  if (ctx === undefined) {
    throw new ForbiddenError('UNAUTHENTICATED', 'Nicht angemeldet.');
  }
  if (!SAFE_METHODS.has(request.method)) {
    const header = request.headers[CSRF_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !safeEquals(hashToken(token), ctx.csrfTokenHash)) {
      throw new ForbiddenError('FORBIDDEN', 'CSRF-Token fehlt oder ist ungültig.', {
        requiredRole: 'OPERATOR',
      });
    }
  }
  return ctx;
}
