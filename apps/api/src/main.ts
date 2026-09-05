/**
 * Process entry point (Architektur §7.1).
 *
 * Composition root: this is the one file that constructs the real `Deps` —
 * the Prisma client, the system clock, the crypto RNG, the pino logger and the
 * database notifier. Everything below it receives them as parameters, which is
 * what lets an integration test build the same graph with a seeded RNG and a
 * frozen clock and get deterministic behaviour out of production code.
 */

import { PrismaClient } from '@prisma/client';

import {
  cryptoRng,
  dbNotifier,
  systemClock,
  type Deps,
  type Logger,
} from './app/deps.js';
import { pushNotifier } from './app/notifications/pushNotifier.js';
import { loadEnv } from './config.js';
import { buildServer } from './infra/http/server.js';
import { createPushSender } from './infra/integrations/push-sender.js';
import { createSecretBox, parseKeyring } from './infra/integrations/secret-box.js';
import { createTodoistClient } from './infra/integrations/todoist-client.js';
import { startPushOutboxWorker } from './infra/jobs/push-outbox-worker.js';
import { startSweepWorker } from './infra/jobs/worker.js';
import { startTodoistWorker } from './infra/jobs/todoist-worker.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

  // A placeholder until Fastify's own pino instance exists; swapped below so
  // sweep logs land in the same stream as request logs.
  let logger: Logger = {
    debug: (obj, msg) => console.debug(msg ?? '', obj),
    info: (obj, msg) => console.info(msg ?? '', obj),
    warn: (obj, msg) => console.warn(msg ?? '', obj),
    error: (obj, msg) => console.error(msg ?? '', obj),
  };

  /**
   * The Todoist integration is composed only when a key is configured.
   *
   * A household that never enables it needs no encryption key, so the absence
   * of `INTEGRATION_ENCRYPTION_KEY` is a normal state rather than a
   * misconfiguration — `Deps.todoist`/`Deps.secrets` stay undefined and both
   * integration jobs become no-ops. `parseKeyring` throws on a malformed key,
   * which is deliberate: failing at boot beats failing on the first member who
   * tries to connect.
   */
  const hasKey =
    (env.INTEGRATION_ENCRYPTION_KEY ?? '') !== '' ||
    (env.INTEGRATION_ENCRYPTION_KEYS ?? '') !== '';
  const secrets = hasKey
    ? createSecretBox(parseKeyring(env.INTEGRATION_ENCRYPTION_KEY, env.INTEGRATION_ENCRYPTION_KEYS))
    : undefined;
  const todoist = hasKey ? createTodoistClient() : undefined;

  /**
   * Web Push is composed only when both VAPID keys are configured
   * (push-notifications §Architekturvorschlag, Phase 1) — the same `hasKey`
   * shape as Todoist above. A deployment that never sets them gets
   * `Deps.push === undefined`, which a later phase's `pushNotifier` decorator
   * must treat as "push not configured", not as a crash.
   */
  // Forwards to whatever `logger` is currently bound to, same trick as
  // `deps.logger`'s getter below — `createPushSender` is called before the
  // Fastify (pino) logger exists, so it cannot close over the final value.
  const lazyLogger: Logger = {
    debug: (obj, msg) => logger.debug(obj, msg),
    info: (obj, msg) => logger.info(obj, msg),
    warn: (obj, msg) => logger.warn(obj, msg),
    error: (obj, msg) => logger.error(obj, msg),
  };
  const push =
    env.VAPID_PUBLIC_KEY !== undefined &&
    env.VAPID_PUBLIC_KEY !== '' &&
    env.VAPID_PRIVATE_KEY !== undefined &&
    env.VAPID_PRIVATE_KEY !== ''
      ? createPushSender(
          {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
          },
          lazyLogger,
        )
      : undefined;

  const deps: Deps = {
    db,
    clock: systemClock,
    rng: cryptoRng,
    // Push-notifications §Architekturvorschlag, Phase 2 (rollback-safety
    // fix): when Web Push is configured, `dbNotifier` is wrapped so every
    // emit also enqueues `PushOutboxItem` rows, inside the same transaction
    // `inner.emit` just used — the decorator itself never touches the
    // transactional guarantee, and a rollback of the caller's transaction
    // takes the outbox rows with it. Actual delivery happens later, with no
    // transaction open, in `startPushOutboxWorker` below. A deployment
    // without VAPID keys keeps the bare `dbNotifier`, byte-for-byte today's
    // behaviour.
    notifier: push !== undefined ? pushNotifier(dbNotifier) : dbNotifier,
    get logger() {
      return logger;
    },
    ...(secrets !== undefined ? { secrets } : {}),
    ...(todoist !== undefined ? { todoist } : {}),
    ...(push !== undefined ? { push } : {}),
  };

  const app = await buildServer({ env, deps });
  logger = app.log as unknown as Logger;

  const worker = startSweepWorker(deps, env.SWEEP_INTERVAL_SECONDS);
  // Reconcile + dispatch. `TODOIST_INTERVAL_SECONDS=0` disables it — and is
  // also the single-reconciler guard: notification idempotency assumes exactly
  // one reconciler process, so any deployment running more than one API
  // instance must set it to `0` on all but one. No technical lock enforces
  // this yet — see `todoist-worker.ts`'s module doc (intake
  // "todoist-worker-not-multi-instance-safe") for why and what a real fix
  // would need.
  const todoistWorker = startTodoistWorker(deps, env.TODOIST_INTERVAL_SECONDS);
  if (todoist !== undefined && env.TODOIST_INTERVAL_SECONDS > 0) {
    logger.info(
      { intervalSeconds: env.TODOIST_INTERVAL_SECONDS },
      'todoist integration active',
    );
  }

  // Push-notifications §Architekturvorschlag, Phase 2 (rollback-safety fix):
  // started only when push is actually configured — no point polling an
  // empty `push_outbox_items` table forever on a deployment with no VAPID
  // keys, and `startPushOutboxWorker` itself already no-ops on
  // `deps.push === undefined`, but skipping the `setInterval` entirely here
  // keeps the intent visible at the call site too.
  const pushOutboxWorker =
    push !== undefined ? startPushOutboxWorker(deps, env.PUSH_OUTBOX_INTERVAL_SECONDS) : { stop: () => undefined };

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    worker.stop();
    todoistWorker.stop();
    pushOutboxWorker.stop();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((error: unknown) => {
  console.error('Start fehlgeschlagen:', error);
  process.exit(1);
});
