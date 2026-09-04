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
import { loadEnv } from './config.js';
import { buildServer } from './infra/http/server.js';
import { createSecretBox, parseKeyring } from './infra/integrations/secret-box.js';
import { createTodoistClient } from './infra/integrations/todoist-client.js';
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

  const deps: Deps = {
    db,
    clock: systemClock,
    rng: cryptoRng,
    notifier: dbNotifier,
    get logger() {
      return logger;
    },
    ...(secrets !== undefined ? { secrets } : {}),
    ...(todoist !== undefined ? { todoist } : {}),
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

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    worker.stop();
    todoistWorker.stop();
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
