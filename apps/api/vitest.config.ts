import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Point at the shared package's source so the domain suite runs without a
      // prior `tsc -b` of packages/shared.
      '@haushaltsauktion/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // `test/domain/**` is pure and runs anywhere. `test/integration/**` drives
    // the real Fastify app against a real Postgres and needs
    // `docker compose up -d db && npm run db:migrate` first.
    include: ['test/domain/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'node',
    // Each integration file owns its own `test-…`-prefixed household, so files
    // may run in parallel — but the tests *within* a file gate on shared row
    // locks and must not. That is Vitest's default; stated here because the
    // concurrency suite depends on it.
    fileParallelism: true,
    sequence: { concurrent: false },
    // argon2id in `beforeAll` plus lock-gated races exceed the 5s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
