/**
 * Bugfix "reliable-update-check-forced-reload-overlay" — the server must
 * send its build/deploy identifier on every response, not just a dedicated
 * version route, so the web client's version check
 * (apps/web/src/api/versionCheck.ts) fires on the very next call after a
 * redeploy no matter which endpoint that happens to be, error responses
 * included.
 *
 * Requires a live Postgres: `docker compose up -d db && npm run db:migrate`
 * (`buildTestServer`'s PrismaClient connects even though `/healthz` itself
 * never queries it).
 */

import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { buildTestServer, testDb } from './_fixture.js';

describe('X-App-Version response header', () => {
  it('defaults to "dev" when APP_VERSION is unset (local/dev, matches the web client\'s own default)', async () => {
    const db = testDb();
    let app: FastifyInstance | undefined;
    try {
      app = await buildTestServer(db);
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.headers['x-app-version']).toBe('dev');
    } finally {
      await app?.close();
      await db.$disconnect();
    }
  });

  it('reflects APP_VERSION on success and error responses alike', async () => {
    const db = testDb();
    let app: FastifyInstance | undefined;
    try {
      app = await buildTestServer(db, { APP_VERSION: 'abc123def456' });
      await app.ready();

      const ok = await app.inject({ method: 'GET', url: '/healthz' });
      expect(ok.headers['x-app-version']).toBe('abc123def456');

      const notFound = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.headers['x-app-version']).toBe('abc123def456');
    } finally {
      await app?.close();
      await db.$disconnect();
    }
  });
});
