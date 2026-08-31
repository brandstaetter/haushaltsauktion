/**
 * Household self-onboarding (Architektur "Admin Onboarding" Phase 1;
 * PRD `prd-admin-onboarding.md` Feature 1).
 *
 * Token-gated, not open self-service: a family with no sysadmin gets a single
 * `SETUP_TOKEN` (from whoever deployed the app) instead of an unauthenticated
 * "create any household" endpoint. The transaction body below is a deliberate
 * near-duplicate of `prisma/create-admin.ts`'s already-proven shape
 * (Household → HouseholdConfiguration v1 → User → HouseholdMember ADMIN);
 * that script stays as a documented emergency fallback for a lost/rotated
 * token, this route is the everyday path.
 *
 * `server.ts` only calls `registerRegisterRoutes` when `env.SETUP_TOKEN` is
 * set, so an operator who never configures a setup token gets a genuine 404
 * here — this route never advertises itself as a disabled endpoint.
 */

import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { DEFAULT_CONFIG, parseConfig } from '@haushaltsauktion/shared';

import type { Deps } from '../../../app/deps.js';
import type { AppEnv } from '../../../config.js';
import { ConflictError, ForbiddenError } from '../../../domain/errors.js';
import { hashPassword } from '../../auth/password.js';
import { SESSION_COOKIE, cookieOptions, issueSession, safeEquals } from '../../auth/session.js';
import { parse } from './_validate.js';

const RegisterBody = z.object({
  setupToken: z.string().min(1),
  householdName: z.string().min(1).max(200),
  adminEmail: z.string().min(3).max(320),
  adminDisplayName: z.string().min(1).max(100),
  adminPassword: z.string().min(8).max(512),
});

export async function registerRegisterRoutes(
  app: FastifyInstance,
  deps: Deps,
  env: AppEnv,
): Promise<void> {
  const setupToken = env.SETUP_TOKEN;
  // The caller (`server.ts`) is expected not to invoke this at all when the
  // token is unset — this guard is defense in depth, not the primary gate.
  if (typeof setupToken !== 'string') return;

  const ttlMs = env.SESSION_TTL_HOURS * 3600_000;

  app.post(
    '/register',
    // Same shape as `/auth/login`'s limiter (5/5min), keyed by IP alone —
    // there is no pre-existing target email to combine it with here.
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '5 minutes',
          keyGenerator: (request: { ip: string }) => request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = parse(RegisterBody, request.body);
      const now = deps.clock.now();

      // Constant-time, and checked before any database round trip: a wrong
      // token must reject with zero new rows and without the duplicate-email
      // branch ever running.
      if (!safeEquals(body.setupToken, setupToken)) {
        throw new ForbiddenError('FORBIDDEN', 'Setup-Token ist ungültig.');
      }

      const email = body.adminEmail.trim().toLowerCase();
      const existing = await deps.db.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing !== null) {
        throw new ConflictError(
          'EMAIL_ALREADY_REGISTERED',
          'Diese E-Mail-Adresse ist bereits registriert.',
        );
      }

      const passwordHash = await hashPassword(body.adminPassword);
      const config = parseConfig(DEFAULT_CONFIG);

      // §26/§5.2 — Household, its version-1 config, the admin's User row and
      // their HouseholdMember(ADMIN) row are created atomically, exactly as
      // `create-admin.ts`'s `$transaction` block already proves works.
      const { household, member, user } = await deps.db.$transaction(async (tx) => {
        const createdHousehold = await tx.household.create({
          data: { name: body.householdName },
        });

        await tx.householdConfiguration.create({
          data: {
            householdId: createdHousehold.id,
            version: 1,
            values: config as unknown as Prisma.InputJsonObject,
          },
        });

        const createdUser = await tx.user.create({
          data: { email, displayName: body.adminDisplayName, passwordHash },
        });

        const createdMember = await tx.householdMember.create({
          data: {
            householdId: createdHousehold.id,
            userId: createdUser.id,
            displayName: body.adminDisplayName,
            role: 'ADMIN',
          },
        });

        return { household: createdHousehold, member: createdMember, user: createdUser };
      });

      const { rawSession, rawCsrf } = await issueSession({
        db: deps.db,
        now,
        sessionSecret: env.SESSION_SECRET,
        ttlHours: env.SESSION_TTL_HOURS,
        userId: user.id,
        householdId: household.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      await deps.db.auditEvent.create({
        data: {
          householdId: household.id,
          actorType: 'ADMIN',
          actorMemberId: member.id,
          action: 'HOUSEHOLD_REGISTERED',
          entityType: 'Household',
          entityId: household.id,
          // Never the raw setup token (§23/§36) — only what the household's
          // own admins can already see elsewhere.
          payload: { householdName: household.name, adminEmail: email },
          ipAddress: request.ip,
        },
      });

      void reply.setCookie(
        SESSION_COOKIE,
        rawSession,
        cookieOptions({ secure: env.COOKIE_SECURE, maxAgeSeconds: Math.floor(ttlMs / 1000) }),
      );

      return reply.status(201).send({
        user: { id: user.id, email, displayName: user.displayName },
        member: { id: member.id, displayName: member.displayName, role: member.role },
        household: { id: household.id, name: household.name, timezone: household.timezone },
        csrfToken: rawCsrf,
      });
    },
  );
}
