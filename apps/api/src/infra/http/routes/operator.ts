/**
 * Operator auth and metrics routes (Architektur `.planning/architecture-operator-dashboard.md`).
 *
 * Mirrors `auth.ts`'s login shape — identical timing for unknown-email vs.
 * wrong-password, same rate limit — but against `OperatorAccount`, never
 * `User`. No `AuditEvent` write on login/logout: that model requires a
 * `householdId`, which does not exist for an operator action. Accepted gap
 * for v1, not a workaround to invent around.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ForbiddenError } from '../../../domain/errors.js';
import type { Deps } from '../../../app/deps.js';
import type { AppEnv } from '../../../config.js';
import { computeOperatorMetrics } from '../../../app/operator/metrics.js';
import { burnPasswordTime, verifyPassword } from '../../auth/password.js';
import {
  OPERATOR_SESSION_COOKIE,
  cookieOptions,
  issueOperatorSession,
} from '../../auth/operatorSession.js';
import { requireOperator } from '../operatorContext.js';
import { parse } from './_validate.js';

const LoginBody = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(512),
});

export async function registerOperatorRoutes(
  app: FastifyInstance,
  deps: Deps,
  env: AppEnv,
): Promise<void> {
  const ttlMs = env.SESSION_TTL_HOURS * 3600_000;

  app.post(
    '/operator/login',
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

      const account = await deps.db.operatorAccount.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      });

      // Both branches spend the same time and produce the same body — same
      // anti-enumeration reasoning as /auth/login.
      const ok =
        account === null
          ? await burnPasswordTime(body.password)
          : await verifyPassword(account.passwordHash, body.password);

      if (!ok || account === null) {
        throw new ForbiddenError('INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch.');
      }

      const { rawSession, rawCsrf } = await issueOperatorSession({
        db: deps.db,
        now,
        sessionSecret: env.SESSION_SECRET,
        ttlHours: env.SESSION_TTL_HOURS,
        operatorAccountId: account.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      void reply.setCookie(
        OPERATOR_SESSION_COOKIE,
        rawSession,
        cookieOptions({ secure: env.COOKIE_SECURE, maxAgeSeconds: Math.floor(ttlMs / 1000) }),
      );

      return {
        operator: { id: account.id, email },
        csrfToken: rawCsrf,
      };
    },
  );

  app.post('/operator/logout', async (request, reply) => {
    const ctx = request.operatorCtx;
    if (ctx !== undefined) {
      await deps.db.operatorSession.update({
        where: { id: ctx.operatorSessionId },
        data: { revokedAt: deps.clock.now() },
      });
    }
    void reply.clearCookie(OPERATOR_SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/operator/metrics', async (request, reply) => {
    requireOperator(request, reply);
    return computeOperatorMetrics(deps.db, deps.clock.now());
  });
}
