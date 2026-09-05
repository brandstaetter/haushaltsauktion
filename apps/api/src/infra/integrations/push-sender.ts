/**
 * The composed `PushSender` (push-notifications §Architekturvorschlag, Phase 1).
 *
 * Thin wrapper around `web-push`'s `sendNotification`. Two things this file is
 * careful about:
 *
 * 1. **Never throws.** `web-push` rejects on any non-200 from the push
 *    service; every rejection is caught here and turned into a
 *    `PushSendResult` value. The research doc's whole point is that a push
 *    failure must never propagate into the use-case that triggered it — the
 *    `Notifier` decorator (later phase) that calls this fires it best-effort,
 *    after commit, and cannot be allowed to blow up the caller.
 * 2. **VAPID details travel per call, not via the module-global
 *    `web-push.setVapidDetails`.** The global setter would make two
 *    `createPushSender` instances (e.g. a test and the running server, or two
 *    households with different keys in a hypothetical future) stomp on each
 *    other's configuration. Passing `vapidDetails` in `RequestOptions` keeps
 *    this sender self-contained.
 */

import webpush, { WebPushError } from 'web-push';

import type { Logger } from '../../app/deps.js';
import type { PushSendResult, PushSender, PushSubscriptionKeys } from '../../app/integrations/ports.js';

export interface PushSenderOptions {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or `https:` contact — `web-push` requires one per VAPID request. */
  subject: string;
}

/** 404 = the push service has forgotten the endpoint; 410 = Gone, same effect. */
const GONE_STATUS_CODES = new Set([404, 410]);

export function createPushSender(options: PushSenderOptions, logger: Logger): PushSender {
  return {
    async send(subscription: PushSubscriptionKeys, payload: Record<string, unknown>): Promise<PushSendResult> {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          {
            vapidDetails: {
              subject: options.subject,
              publicKey: options.publicKey,
              privateKey: options.privateKey,
            },
          },
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof WebPushError) {
          const gone = GONE_STATUS_CODES.has(error.statusCode);
          logger.warn(
            { endpoint: subscription.endpoint, statusCode: error.statusCode, gone },
            'push-Zustellung fehlgeschlagen',
          );
          return { ok: false, gone };
        }
        // Network error, timeout, or anything else `web-push` did not wrap in
        // a `WebPushError` — not proof the subscription itself is bad.
        logger.warn({ endpoint: subscription.endpoint, error }, 'push-Zustellung fehlgeschlagen (kein HTTP-Status)');
        return { ok: false, gone: false };
      }
    },
  };
}
