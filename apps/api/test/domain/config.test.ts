/**
 * `loadEnv` (Architektur §7.1, Todoist §4).
 *
 * Regression coverage for the production incident where Docker Compose's
 * `INTEGRATION_ENCRYPTION_KEY: ${INTEGRATION_ENCRYPTION_KEY}` substituted an
 * empty string for an unset variable rather than omitting it, which crashed
 * the process at boot instead of leaving the integration disabled.
 */

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/config.js';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  SESSION_SECRET: 'at-least-8-chars',
};

const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

describe('loadEnv — INTEGRATION_ENCRYPTION_KEY', () => {
  it('accepts an absent key', () => {
    const env = loadEnv({ ...BASE_ENV });
    expect(env.INTEGRATION_ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts an empty string the same as absent (the Compose substitution case)', () => {
    const env = loadEnv({ ...BASE_ENV, INTEGRATION_ENCRYPTION_KEY: '' });
    expect(env.INTEGRATION_ENCRYPTION_KEY).toBe('');
  });

  it('accepts a well-formed 32-byte base64 key', () => {
    const env = loadEnv({ ...BASE_ENV, INTEGRATION_ENCRYPTION_KEY: VALID_KEY });
    expect(env.INTEGRATION_ENCRYPTION_KEY).toBe(VALID_KEY);
  });

  it('rejects a non-empty key that does not decode to 32 bytes', () => {
    expect(() =>
      loadEnv({ ...BASE_ENV, INTEGRATION_ENCRYPTION_KEY: 'too-short' }),
    ).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });
});
