/**
 * Environment parsing (Architektur §7.1).
 *
 * Parsed once, at startup, with the same Zod the rest of the system validates
 * with. A missing `DATABASE_URL` should stop the process immediately with a
 * readable message, not surface as a connection error on the first request.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ist erforderlich.'),
  /** Keys the derived CSRF token (`csrfTokenFor`). Must be stable across restarts. */
  SESSION_SECRET: z.string().min(8, 'SESSION_SECRET muss mindestens 8 Zeichen haben.'),
  /** Cookies are `Secure` unless this is explicitly off — see `session.ts`. */
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 30),
  /** The interval sweep (PRD §2). 0 disables the worker; the endpoint still works. */
  SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated origins for the SPA in development. */
  CORS_ORIGINS: z.string().optional(),
  /**
   * Gates `POST /register` (household self-onboarding). When unset, the route
   * is never registered on the Fastify instance at all — see `server.ts` —
   * so the endpoint genuinely 404s rather than 403ing a live, discoverable
   * route.
   */
  SETUP_TOKEN: z.string().min(16).optional(),

  /**
   * AES-256-GCM key for third-party credentials at rest (Todoist §4).
   *
   * Deliberately stricter than `SESSION_SECRET` above: base64 that decodes to
   * **exactly** 32 bytes. `z.string().min(8)` would accept a 9-character string
   * and then fail inside `createCipheriv` on the first member who connects — a
   * boot-time error beats a runtime one nobody sees until it matters.
   *
   * Optional so a household that never enables the integration is not forced to
   * generate a key; `main.ts` builds the keyring only when needed.
   *
   * Treats `""` the same as absent, not just `undefined`. Docker Compose
   * substitutes an *empty string* for a referenced variable that isn't set in
   * `.env` (`INTEGRATION_ENCRYPTION_KEY: ${INTEGRATION_ENCRYPTION_KEY}`) — it
   * does not omit the variable from the container's environment. Without this,
   * an operator who simply never set the key (the documented, supported "I'm
   * not using this integration" state) gets a boot-time crash instead of the
   * silent no-op `main.ts`'s own `hasKey` check is designed to produce.
   */
  INTEGRATION_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === '' || Buffer.from(v, 'base64').length === 32, {
      message: 'INTEGRATION_ENCRYPTION_KEY muss base64-kodiert genau 32 Bytes ergeben.',
    }),
  /** Rotation window: `1:<base64>,2:<base64>`. Parsed by `parseKeyring`. */
  INTEGRATION_ENCRYPTION_KEYS: z.string().optional(),

  /**
   * The Todoist reconcile+dispatch worker. `0` disables it, mirroring
   * `SWEEP_INTERVAL_SECONDS`.
   *
   * **This is also the single-reconciler guard.** Notification idempotency
   * relies on exactly one reconciler process (see the architecture's §7): any
   * deployment running more than one API instance must set this to `0` on all
   * but one, which makes single-reconciler operation a configuration fact rather
   * than a hope. Note `0` disables the *worker*, not all Todoist traffic — a
   * member disconnecting on that instance still gets a best-effort close flush.
   */
  TODOIST_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),

  /**
   * Baked into the Docker image at build time (Dockerfile `ARG`/`ENV`,
   * `.github/workflows/deploy.yml`'s `build-and-push` job passes the same
   * short Git SHA it tags the image with) — not a runtime-environment
   * override, so every replica of one deployed image reports the same
   * value, and it only changes on an actual redeploy. `server.ts` sends it
   * on every response as `X-App-Version`; the web client compares it on
   * every call instead of waiting on the service worker's own update
   * lifecycle (intake "reliable-update-check-forced-reload-overlay").
   * Defaults to `'dev'` for local/dev runs where no image build set it —
   * the web bundle's own build-time default is the same string, so the two
   * sides trivially agree and never false-trigger outside a real deploy.
   */
  APP_VERSION: z.string().default('dev'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Ungültige Umgebungskonfiguration — ${detail}`);
  }
  return parsed.data;
}
