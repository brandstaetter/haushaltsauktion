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
