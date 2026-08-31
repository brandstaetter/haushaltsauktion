/**
 * The Fastify server (Architektur §3, §7.1).
 *
 * Routes validate with Zod, build `request.ctx` (§3.2), call **one** use-case
 * and map errors. A route body that computes a business number is a review
 * failure (§7.2) — every price, reward and resulting value in a response came
 * out of `app/` or `domain/`, never out of a handler.
 */

import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import type { Deps } from '../../app/deps.js';
import type { AppEnv } from '../../config.js';
import { makeContextPreHandler } from './context.js';
import { registerErrorHandler } from './error-mapper.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerMemberRoutes } from './routes/members.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerRegisterRoutes } from './routes/register.js';
import { registerTaskRoutes } from './routes/tasks.js';

export interface ServerOptions {
  env: AppEnv;
  deps: Deps;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { env, deps } = options;
  const db: PrismaClient = deps.db;

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Trust the proxy only for the rate-limit key; the app never uses the
    // client IP for authorization.
    trustProxy: true,
    bodyLimit: 1024 * 256,
  });

  await app.register(cookie);

  // §3.12 — the global bucket. Per-route overrides tighten it where an action
  // is expensive (login) or economically meaningful (buyout).
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ctx?.sessionId ?? request.ip,
  });

  registerErrorHandler(app);

  app.addHook('preHandler', makeContextPreHandler(db, () => deps.clock.now()));

  // Health probes live outside `/api` and outside auth (§3.11).
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  await app.register(
    async (api) => {
      await registerAuthRoutes(api, deps, env);
      await registerTaskRoutes(api, deps);
      await registerAssignmentRoutes(api, deps);
      await registerMemberRoutes(api, deps);
      await registerMiscRoutes(api, deps);
      await registerIntegrationRoutes(api, deps);
      await registerAdminRoutes(api, deps);
      // Only registered when a setup token is configured — see register.ts's
      // module doc — so `POST /api/register` genuinely 404s otherwise.
      if (typeof env.SETUP_TOKEN === 'string') {
        await registerRegisterRoutes(api, deps, env);
      }
    },
    { prefix: '/api' },
  );

  return app;
}
