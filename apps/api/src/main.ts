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
import { startSweepWorker } from './infra/jobs/worker.js';

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

  const deps: Deps = {
    db,
    clock: systemClock,
    rng: cryptoRng,
    notifier: dbNotifier,
    get logger() {
      return logger;
    },
  };

  const app = await buildServer({ env, deps });
  logger = app.log as unknown as Logger;

  const worker = startSweepWorker(deps, env.SWEEP_INTERVAL_SECONDS);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    worker.stop();
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
