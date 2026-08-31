/**
 * Auth and session routes (Architektur §3.3).
 *
 * Login responds **identically** for an unknown email and a wrong password —
 * same status, same body, and the same amount of CPU burnt on argon2 — so the
 * endpoint cannot be used to enumerate which family members have accounts
 * (§36). Failed attempts are audited without the password.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ForbiddenError } from '../../../domain/errors.js';
import type { Deps } from '../../../app/deps.js';
import type { AppEnv } from '../../../config.js';
import { burnPasswordTime, hashPassword, verifyPassword } from '../../auth/password.js';
import {
  CSRF_HEADER,
  SESSION_COOKIE,
  cookieOptions,
  csrfTokenFor,
  issueSession,
} from '../../auth/session.js';
import { requireMember } from '../context.js';
import { parse } from './_validate.js';

const LoginBody = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(512),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(8, 'Mindestens 8 Zeichen.').max(512),
});

const HouseholdBody = z.object({ householdId: z.string().min(1) });

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: Deps,
  env: AppEnv,
): Promise<void> {
  const ttlMs = env.SESSION_TTL_HOURS * 3600_000;

  app.post(
    '/auth/login',
    // §3.12 — 5 per 5 minutes, keyed by IP *and* email so one attacker cannot
    // lock out a whole household by hammering one address from many IPs.
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '5 minutes',
          keyGenerator: (request: { ip: string; body?: unknown }) => {
            const body = request.body as { email?: unknown } | undefined;
            const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
            return `${request.ip}:${email}`;
          },
        },
      },
    },
    async (request, reply) => {
      const body = parse(LoginBody, request.body);
      const email = body.email.trim().toLowerCase();
      const now = deps.clock.now();

      const user = await deps.db.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, isActive: true, displayName: true },
      });

      // Both branches spend the same time and produce the same body.
      const ok =
        user === null
          ? await burnPasswordTime(body.password)
          : await verifyPassword(user.passwordHash, body.password);

      if (!ok || user === null) {
        const membership =
          user === null
            ? null
            : await deps.db.householdMember.findFirst({
                where: { userId: user.id },
                select: { householdId: true, id: true },
              });
        if (membership !== null) {
          await deps.db.auditEvent.create({
            data: {
              householdId: membership.householdId,
              actorType: 'MEMBER',
              actorMemberId: membership.id,
              action: 'LOGIN_FAILED',
              entityType: 'User',
              entityId: user?.id ?? null,
              payload: { email },
              ipAddress: request.ip,
            },
          });
        }
        throw new ForbiddenError('INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch.');
      }
      if (!user.isActive) {
        throw new ForbiddenError('ACCOUNT_DISABLED', 'Dieses Konto ist deaktiviert.');
      }

      const membership = await deps.db.householdMember.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          householdId: true,
          role: true,
          displayName: true,
          household: { select: { id: true, name: true, timezone: true } },
        },
      });
      if (membership === null) {
        throw new ForbiddenError('NOT_A_MEMBER', 'Kein Haushalt zugeordnet.');
      }

      const { rawSession, rawCsrf } = await issueSession({
        db: deps.db,
        now,
        sessionSecret: env.SESSION_SECRET,
        ttlHours: env.SESSION_TTL_HOURS,
        userId: user.id,
        householdId: membership.householdId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      await deps.db.auditEvent.create({
        data: {
          householdId: membership.householdId,
          actorType: 'MEMBER',
          actorMemberId: membership.id,
          action: 'LOGIN_SUCCEEDED',
          entityType: 'User',
          entityId: user.id,
          payload: {},
          ipAddress: request.ip,
        },
      });

      void reply.setCookie(
        SESSION_COOKIE,
        rawSession,
        cookieOptions({ secure: env.COOKIE_SECURE, maxAgeSeconds: Math.floor(ttlMs / 1000) }),
      );

      return {
        user: { id: user.id, email, displayName: user.displayName },
        member: {
          id: membership.id,
          displayName: membership.displayName,
          role: membership.role,
        },
        household: {
          id: membership.household.id,
          name: membership.household.name,
          timezone: membership.household.timezone,
        },
        csrfToken: rawCsrf,
      };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const ctx = request.ctx;
    if (ctx !== undefined) {
      // Revoked rather than deleted: §23 wants the session's existence to stay
      // auditable after it ends.
      await deps.db.session.update({
        where: { id: ctx.sessionId },
        data: { revokedAt: deps.clock.now() },
      });
    }
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/auth/me', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const [user, household] = await Promise.all([
      deps.db.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, email: true, displayName: true },
      }),
      deps.db.household.findUnique({
        where: { id: ctx.householdId },
        select: { id: true, name: true, timezone: true },
      }),
    ]);

    // Derived, not drawn: the same value every time for the life of this
    // session, so a second tab calling `/auth/me` does not invalidate the first.
    const rawCsrf = csrfTokenFor(ctx.sessionId, env.SESSION_SECRET);

    return {
      user,
      member: { id: ctx.memberId, displayName: ctx.displayName, role: ctx.role },
      household,
      role: ctx.role,
      csrfToken: rawCsrf,
    };
  });

  app.post(
    '/auth/password',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const ctx = requireMember(request, reply);
      const body = parse(PasswordBody, request.body);

      const user = await deps.db.user.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true },
      });
      if (user === null || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
        throw new ForbiddenError('INVALID_CREDENTIALS', 'Aktuelles Passwort ist falsch.');
      }

      await deps.db.user.update({
        where: { id: ctx.userId },
        data: { passwordHash: await hashPassword(body.newPassword) },
      });
      // Every other session of this user dies with the old password.
      await deps.db.session.updateMany({
        where: { userId: ctx.userId, id: { not: ctx.sessionId }, revokedAt: null },
        data: { revokedAt: deps.clock.now() },
      });

      return reply.status(204).send();
    },
  );

  app.get('/households', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const rows = await deps.db.householdMember.findMany({
      where: { userId: ctx.userId, isActive: true },
      select: { householdId: true, role: true, household: { select: { name: true } } },
    });
    return {
      items: rows.map((r) => ({
        householdId: r.householdId,
        name: r.household.name,
        role: r.role,
      })),
    };
  });

  app.post('/session/household', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const body = parse(HouseholdBody, request.body);

    // §26 — switching is only ever *within* the user's own memberships. A
    // household id the caller is not a member of is a 403, never a switch.
    const membership = await deps.db.householdMember.findFirst({
      where: { userId: ctx.userId, householdId: body.householdId, isActive: true },
      select: {
        id: true,
        role: true,
        displayName: true,
        household: { select: { id: true, name: true, timezone: true } },
      },
    });
    if (membership === null) {
      throw new ForbiddenError('NOT_A_MEMBER', 'Kein Zugriff auf diesen Haushalt.');
    }

    await deps.db.session.update({
      where: { id: ctx.sessionId },
      data: { activeHouseholdId: body.householdId },
    });

    return {
      household: membership.household,
      member: { id: membership.id, displayName: membership.displayName },
      role: membership.role,
    };
  });
}

export { CSRF_HEADER };
