/**
 * The request context (Architektur §3.2; CLAUDE.md §36).
 *
 * **This is the single choke point for household scoping.** Routes are not
 * path-prefixed with a household id; the session carries `activeHouseholdId`
 * and this `preHandler` resolves it to a `HouseholdMember` row. Every use-case
 * then receives a `householdId` that was *proved* to belong to the caller, so
 * "no access to a foreign household" is one guarantee in one place rather than
 * a per-route obligation that a new endpoint can forget.
 *
 * A foreign id therefore never reaches the data layer at all: the queries
 * downstream take `householdId` as their first predicate, so a request for
 * another household's task simply finds nothing and returns `404` — absent and
 * forbidden are deliberately indistinguishable (§3.13), so the API cannot be
 * used to probe what another household contains.
 */

import type { MemberRole } from '@haushaltsauktion/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { ForbiddenError } from '../../domain/errors.js';
import { CSRF_HEADER, SESSION_COOKIE, hashToken, safeEquals } from '../auth/session.js';

export interface RequestContext {
  userId: string;
  sessionId: string;
  memberId: string;
  householdId: string;
  householdTimezone: string;
  role: MemberRole;
  displayName: string;
  csrfTokenHash: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx?: RequestContext;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ResolvedSession {
  ctx: RequestContext | null;
  /** Why there is no context, when there is none. */
  failure: 'NO_COOKIE' | 'UNKNOWN' | 'EXPIRED' | 'DISABLED' | 'NOT_A_MEMBER' | null;
}

export async function resolveSession(
  db: PrismaClient,
  rawToken: string | undefined,
  now: Date,
): Promise<ResolvedSession> {
  if (!rawToken) return { ctx: null, failure: 'NO_COOKIE' };

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      userId: true,
      csrfTokenHash: true,
      activeHouseholdId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { isActive: true } },
    },
  });
  if (session === null) return { ctx: null, failure: 'UNKNOWN' };
  if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    return { ctx: null, failure: 'EXPIRED' };
  }
  if (!session.user.isActive) return { ctx: null, failure: 'DISABLED' };

  // `activeHouseholdId` is a *pointer*, never authorization (§1.2): membership
  // is re-checked on every request, so revoking someone's membership takes
  // effect immediately rather than at their next login.
  const membership = await db.householdMember.findFirst({
    where: {
      userId: session.userId,
      ...(session.activeHouseholdId ? { householdId: session.activeHouseholdId } : {}),
    },
    orderBy: { joinedAt: 'asc' },
    select: {
      id: true,
      householdId: true,
      role: true,
      isActive: true,
      displayName: true,
      household: { select: { timezone: true } },
    },
  });
  if (membership === null) return { ctx: null, failure: 'NOT_A_MEMBER' };
  if (!membership.isActive) return { ctx: null, failure: 'DISABLED' };

  return {
    failure: null,
    ctx: {
      userId: session.userId,
      sessionId: session.id,
      memberId: membership.id,
      householdId: membership.householdId,
      householdTimezone: membership.household.timezone,
      role: membership.role,
      displayName: membership.displayName,
      csrfTokenHash: session.csrfTokenHash,
    },
  };
}

/** Attaches `request.ctx` when a valid session is present. Never rejects. */
export function makeContextPreHandler(db: PrismaClient, now: () => Date) {
  return async function attachContext(request: FastifyRequest): Promise<void> {
    const raw = request.cookies?.[SESSION_COOKIE];
    const resolved = await resolveSession(db, raw, now());
    if (resolved.ctx !== null) {
      request.ctx = resolved.ctx;
      // Best-effort liveness. Failure here must never break the request.
      void db.session
        .update({ where: { id: resolved.ctx.sessionId }, data: { lastSeenAt: now() } })
        .catch(() => undefined);
    }
  };
}

/** The `MEMBER` gate of §3.1, plus CSRF for every unsafe method. */
export function requireMember(request: FastifyRequest, _reply: FastifyReply): RequestContext {
  const ctx = request.ctx;
  if (ctx === undefined) {
    throw new ForbiddenError('UNAUTHENTICATED', 'Nicht angemeldet.');
  }
  if (!SAFE_METHODS.has(request.method)) {
    const header = request.headers[CSRF_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !safeEquals(hashToken(token), ctx.csrfTokenHash)) {
      throw new ForbiddenError('FORBIDDEN', 'CSRF-Token fehlt oder ist ungültig.', {
        requiredRole: 'MEMBER',
      });
    }
  }
  return ctx;
}

/** The `ADMIN` gate of §3.1. */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): RequestContext {
  const ctx = requireMember(request, reply);
  if (ctx.role !== 'ADMIN') {
    throw new ForbiddenError('FORBIDDEN', 'Adminrechte erforderlich.', { requiredRole: 'ADMIN' });
  }
  return ctx;
}
