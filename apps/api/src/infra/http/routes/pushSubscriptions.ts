/**
 * Member-scoped Web Push subscription routes (push-notifications
 * §Architekturvorschlag). Phase 1 added the subscribe/unsubscribe endpoints
 * with no delivery; Phase 2 adds `GET /push/vapid-public-key` (the browser's
 * `applicationServerKey`) — actual delivery lives in the `pushNotifier`
 * decorator (`app/notifications/pushNotifier.ts`), not here.
 *
 * **No `:memberId` path parameter anywhere, deliberately** — same reasoning as
 * `integrations.ts`'s module doc. The member id comes from `requireMember`,
 * which resolves it from the session and re-checks membership on every
 * request, so there is no URL an admin (or anyone else) could type to reach
 * another member's subscription. A `PushSubscription` is a personal, per-device
 * setting, not a household-wide one (§36).
 *
 * Thin on purpose: no use-case module. The only "business logic" here is an
 * upsert-by-endpoint and an ownership-scoped delete, both of which are plain
 * Prisma calls — the same bar `members.ts` applies to its simple reads.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../../../app/deps.js';
import type { AppEnv } from '../../../config.js';
import { NotFoundError } from '../../../domain/errors.js';
import { requireMember } from '../context.js';
import { IdParam, parse } from './_validate.js';

/**
 * Mirrors the browser's native `PushSubscription.toJSON()` shape exactly
 * (`{ endpoint, keys: { p256dh, auth } }`), so the frontend can forward the
 * object it gets from `registration.pushManager.subscribe()` unmodified.
 *
 * Generous upper bounds rather than a format guess, same reasoning as
 * `integrations.ts`'s `ConnectBody`: push endpoints and keys are opaque,
 * browser-controlled strings whose exact shape is not this server's contract
 * to enforce beyond "not absurdly large".
 */
const SubscribeBody = z.object({
  endpoint: z.string().min(1).max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export async function registerPushSubscriptionRoutes(
  app: FastifyInstance,
  deps: Deps,
  env: AppEnv,
): Promise<void> {
  /**
   * The VAPID public key doubles as the `applicationServerKey` the browser's
   * `PushManager.subscribe()` needs — a VAPID public key is designed to be
   * public, so this route needs no confidentiality. It uses `requireMember`
   * anyway (costs nothing, and a logged-out visitor has no use for it) since
   * there is no precedent in this codebase for an authenticated-`/api`-prefix
   * route skipping it. `null` when this deployment never configured Web Push
   * — the frontend reads that as "push unavailable here", not an error.
   */
  app.get('/push/vapid-public-key', async (request, reply) => {
    requireMember(request, reply);
    return { publicKey: env.VAPID_PUBLIC_KEY ?? null };
  });

  app.post('/members/me/push-subscription', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const body = parse(SubscribeBody, request.body);

    // Upsert on the unique `endpoint`: a browser can resubscribe with the same
    // endpoint (e.g. after clearing app data and re-granting permission), and
    // the same endpoint can legitimately change owner if a different household
    // member subsequently logs in on the same browser profile — the most
    // recent subscriber is the one who should receive pushes to it.
    const subscription = await deps.db.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        memberId: ctx.memberId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: {
        memberId: ctx.memberId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      select: { id: true },
    });

    return reply.status(201).send({ id: subscription.id });
  });

  app.delete('/members/me/push-subscription/:id', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);

    // Ownership check and delete in one statement: a member must never be
    // able to delete another member's subscription (§36), and scoping the
    // `WHERE` rather than reading-then-deleting closes the gap a check
    // followed by a separate delete would leave open.
    const result = await deps.db.pushSubscription.deleteMany({
      where: { id: params.id, memberId: ctx.memberId },
    });
    if (result.count === 0) {
      throw new NotFoundError('Push-Subscription nicht gefunden.');
    }
    return reply.status(204).send();
  });
}
