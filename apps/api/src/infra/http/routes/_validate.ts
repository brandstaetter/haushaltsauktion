/**
 * Request validation at the HTTP boundary (Architektur §7.2, §36).
 *
 * Every body, query and param is parsed with Zod before a use-case sees it, so
 * a use-case never has to defend against a missing field or a string where a
 * number belongs. Failures become `422 VALIDATION_FAILED` with per-field
 * messages the form can attach to its inputs (§3.13).
 */

import { z } from 'zod';

import { ValidationError } from '../../../domain/errors.js';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('VALIDATION_FAILED', 'Ungültige Eingabe.', {
      fieldErrors: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}

/** `?limit=` / `?cursor=` shared by every paginated endpoint (§3.1). */
export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const IdParam = z.object({ id: z.string().min(1).max(64) });
export const InstanceIdParam = z.object({ instanceId: z.string().min(1).max(64) });

/** §4.6 — optional everywhere. Omitting it accepts whatever the current state is. */
export const ExpectedVersion = z.coerce.number().int().min(0).optional();
