/**
 * Sessions and CSRF (Architektur §3.1; CLAUDE.md §25, §36).
 *
 * The cookie carries an **opaque** session id, not a JWT: revocation has to be
 * immediate for a family app where "log that phone out" is a real request, and
 * a stateless token cannot do that without a denylist that is just a session
 * table with extra steps.
 *
 * The raw value is never stored. Only its SHA-256 lands in `Session.tokenHash`,
 * so a database dump does not hand out live sessions — the same reasoning that
 * makes storing password hashes rather than passwords obvious.
 *
 * CSRF is double-submit *on top of* `SameSite=Lax`: the header must match the
 * session's `csrfTokenHash`. `SameSite=Lax` already blocks the classic
 * cross-site form POST; the header defends the cases it does not cover.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

export const SESSION_COOKIE = 'hh_session';
export const CSRF_HEADER = 'x-csrf-token';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * The CSRF token, **derived** rather than drawn.
 *
 * A freshly drawn token on every `GET /auth/me` would invalidate whatever the
 * user's other tab is holding — two tabs, and one of them can no longer submit
 * anything. Deriving it from the session id under a server secret gives a value
 * that is stable for the life of the session, is not guessable without the
 * secret, and still dies the moment the session is revoked (there is no session
 * id to derive from any more). Only its hash is stored, as §3.1 requires.
 */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`, 'utf8').digest('base64url');
}

/**
 * Constant-time comparison. A plain `===` on a secret leaks its prefix length
 * through timing; the cost of doing it right here is one buffer allocation.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface SessionCookieOptions {
  secure: boolean;
  maxAgeSeconds: number;
}

export function cookieOptions(opts: SessionCookieOptions): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    // httpOnly: script cannot read it, so an XSS that does get through cannot
    // exfiltrate the session (§36).
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: opts.maxAgeSeconds,
  };
}

export interface IssueSessionParams {
  db: PrismaClient;
  /** `deps.clock.now()` — never drawn fresh here, so callers stay testable. */
  now: Date;
  /** `env.SESSION_SECRET` — keys the derived CSRF token. */
  sessionSecret: string;
  /** `env.SESSION_TTL_HOURS`. */
  ttlHours: number;
  userId: string;
  householdId: string;
  ipAddress: string;
  userAgent: string | undefined;
}

export interface IssuedSession {
  sessionId: string;
  rawSession: string;
  rawCsrf: string;
}

/**
 * Creates a `Session` row and derives its CSRF token — the exact sequence
 * `POST /auth/login` used to inline, now shared with `POST /register`
 * (Architektur, Key Decisions: "Session issuance").
 *
 * Same statements, same order as the original inline block: the row is
 * created with a placeholder `csrfTokenHash` (the real hash needs the row's
 * own id), then updated with the real one. A request racing that window
 * fails CSRF rather than passing it — see the field comment on
 * `Session.csrfTokenHash`'s origin in the module doc above.
 *
 * Callers own the cookie (`reply.setCookie`) and any route-specific audit
 * event; this helper only ever touches the `Session` table.
 */
export async function issueSession(params: IssueSessionParams): Promise<IssuedSession> {
  const { db, now, sessionSecret, ttlHours, userId, householdId, ipAddress, userAgent } = params;
  const ttlMs = ttlHours * 3600_000;

  const rawSession = generateToken();
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawSession),
      csrfTokenHash: '',
      activeHouseholdId: householdId,
      expiresAt: new Date(now.getTime() + ttlMs),
      ipAddress,
      userAgent: userAgent ?? null,
    },
    select: { id: true },
  });
  const rawCsrf = csrfTokenFor(session.id, sessionSecret);
  await db.session.update({
    where: { id: session.id },
    data: { csrfTokenHash: hashToken(rawCsrf) },
  });

  return { sessionId: session.id, rawSession, rawCsrf };
}
