/**
 * Operator sessions (Architektur `.planning/architecture-operator-dashboard.md`,
 * Key Decisions: "Session secret").
 *
 * Deliberately a thin sibling of `session.ts`, not a copy of its crypto: the
 * token/hash/CSRF-derivation primitives (`generateToken`, `hashToken`,
 * `safeEquals`, `csrfTokenFor`, `cookieOptions`) are identity-agnostic — they
 * take an id and a secret, not a `Session` row — so this module imports them
 * rather than re-implementing them. Only the *shape that owns an id*
 * (`OperatorSession`) is new here.
 *
 * Reuses `env.SESSION_SECRET` rather than a new `OPERATOR_SESSION_SECRET`:
 * `OperatorSession.id` and `Session.id` are drawn from disjoint cuid
 * sequences in separate tables, so there is no cross-derivation collision to
 * guard against, and CLAUDE.md §37 argues against growing the required-env-var
 * list for a feature the household itself never touches.
 */

import type { PrismaClient } from '@prisma/client';

import { cookieOptions, csrfTokenFor, generateToken, hashToken } from './session.js';

export const OPERATOR_SESSION_COOKIE = 'operator_session';

export { cookieOptions, csrfTokenFor, generateToken, hashToken };

export interface IssueOperatorSessionParams {
  db: PrismaClient;
  /** `deps.clock.now()` — never drawn fresh here, so callers stay testable. */
  now: Date;
  /** `env.SESSION_SECRET` — keys the derived CSRF token. */
  sessionSecret: string;
  /** Reuses `env.SESSION_TTL_HOURS` — no separate operator TTL config. */
  ttlHours: number;
  operatorAccountId: string;
  ipAddress: string;
  userAgent: string | undefined;
}

export interface IssuedOperatorSession {
  sessionId: string;
  rawSession: string;
  rawCsrf: string;
}

/**
 * Creates an `OperatorSession` row and derives its CSRF token — same
 * placeholder-then-update sequence as `issueSession` in `session.ts` (the real
 * hash needs the row's own id first).
 */
export async function issueOperatorSession(
  params: IssueOperatorSessionParams,
): Promise<IssuedOperatorSession> {
  const { db, now, sessionSecret, ttlHours, operatorAccountId, ipAddress, userAgent } = params;
  const ttlMs = ttlHours * 3600_000;

  const rawSession = generateToken();
  const session = await db.operatorSession.create({
    data: {
      operatorAccountId,
      tokenHash: hashToken(rawSession),
      csrfTokenHash: '',
      expiresAt: new Date(now.getTime() + ttlMs),
      ipAddress,
      userAgent: userAgent ?? null,
    },
    select: { id: true },
  });
  const rawCsrf = csrfTokenFor(session.id, sessionSecret);
  await db.operatorSession.update({
    where: { id: session.id },
    data: { csrfTokenHash: hashToken(rawCsrf) },
  });

  return { sessionId: session.id, rawSession, rawCsrf };
}
