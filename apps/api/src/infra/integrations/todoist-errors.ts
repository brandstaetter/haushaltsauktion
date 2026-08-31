/**
 * Todoist failure classification (Architektur Todoist §8).
 *
 * Two things here were established by probing the live API rather than read from
 * the docs, and both would be easy to get wrong:
 *
 *  1. **`Retry-After` is sent on 401, not only on 429.** An unauthenticated
 *     `POST /api/v1/sync` came back `401` with `Retry-After: 1`. So the naive
 *     rule "the header is present, therefore retry" would retry a dead token
 *     forever and never raise `INVALID_CREDENTIALS` — the member would keep
 *     believing their chores were in Todoist. Status decides; the header is only
 *     consulted for 429.
 *
 *  2. **`error_code` is not the HTTP status.** `GET /api/v1/projects` returned
 *     `{"error_code": 477, ..., "http_code": 401}`. Classification therefore
 *     keys off the transport status, never the body's `error_code`.
 */

import type { TodoistFailure } from '../../app/integrations/ports.js';

/** The error envelope Todoist returns, and also the per-command failure shape. */
export interface TodoistErrorBody {
  // `| undefined` throughout — `exactOptionalPropertyTypes` is on.
  error?: string | undefined;
  error_tag?: string | undefined;
  error_code?: number | undefined;
  http_code?: number | undefined;
  error_extra?: { event_id?: string | undefined; retry_after?: number | undefined } | undefined;
}

export function parseErrorBody(raw: unknown): TodoistErrorBody {
  if (typeof raw !== 'object' || raw === null) return {};
  const body = raw as Record<string, unknown>;
  const extra =
    typeof body.error_extra === 'object' && body.error_extra !== null
      ? (body.error_extra as Record<string, unknown>)
      : {};
  return {
    error: typeof body.error === 'string' ? body.error : undefined,
    error_tag: typeof body.error_tag === 'string' ? body.error_tag : undefined,
    error_code: typeof body.error_code === 'number' ? body.error_code : undefined,
    http_code: typeof body.http_code === 'number' ? body.http_code : undefined,
    error_extra: {
      event_id: typeof extra.event_id === 'string' ? extra.event_id : undefined,
      retry_after: typeof extra.retry_after === 'number' ? extra.retry_after : undefined,
    },
  };
}

/** `Retry-After` is seconds, or an HTTP date. Returns seconds, or undefined. */
export function parseRetryAfter(header: string | null, now: Date): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (trimmed === '') return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    // A negative or absurd value is a bad header, not an instruction.
    return seconds >= 0 ? Math.min(seconds, 24 * 3600) : undefined;
  }
  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return undefined;
  const delta = Math.ceil((asDate - now.getTime()) / 1000);
  return delta > 0 ? Math.min(delta, 24 * 3600) : 0;
}

export interface ClassifyInput {
  status: number;
  body: TodoistErrorBody;
  retryAfterHeader: string | null;
  now: Date;
  /** Closing an already-deleted task is benign; creating into a missing project is not. */
  operation: 'CREATE_TASK' | 'CLOSE_TASK';
}

export function classifyHttpFailure(input: ClassifyInput): TodoistFailure {
  const { status, body, operation } = input;
  const base = {
    status,
    errorTag: body.error_tag,
    eventId: body.error_extra?.event_id,
    message: body.error ?? `Todoist antwortete ${status}.`,
  };

  if (status === 401 || status === 403) {
    // Deliberately no retryAfterSeconds, even though the live API sends the
    // header here. See the module doc.
    return { ...base, kind: 'PERMANENT_AUTH' };
  }

  if (status === 429) {
    const fromHeader = parseRetryAfter(input.retryAfterHeader, input.now);
    const fromBody = body.error_extra?.retry_after;
    return {
      ...base,
      kind: 'TRANSIENT',
      // The header wins; the body's `retry_after` is the documented fallback.
      // Absence must fall through to the caller's computed backoff, never NaN —
      // Phase 1 found the header documented as only *may* be returned.
      retryAfterSeconds: fromHeader ?? (typeof fromBody === 'number' ? fromBody : undefined),
    };
  }

  if (status === 404 && operation === 'CLOSE_TASK') {
    return { ...base, kind: 'BENIGN_GONE' };
  }

  if (status >= 500) return { ...base, kind: 'TRANSIENT' };

  // 400, 404-on-create, 422 and any other 4xx: our request, our bug. Leave the
  // integration untouched — the member's token is fine.
  if (status >= 400) return { ...base, kind: 'PERMANENT_REQUEST' };

  return { ...base, kind: 'PERMANENT_REQUEST' };
}

/** A network error, DNS failure, or an aborted request (timeout). */
export function classifyTransportError(error: unknown): TodoistFailure {
  const isAbort =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError';
  return {
    kind: 'TRANSIENT',
    message: isAbort
      ? 'Todoist antwortete nicht innerhalb des Zeitlimits.'
      : `Netzwerkfehler bei Todoist: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/**
 * A per-command failure inside a 200 response's `sync_status`.
 *
 * The Sync endpoint returns HTTP 200 and reports each command's fate
 * individually, so a transport-level 200 does not mean the write happened. The
 * per-command object carries its own `http_code`, which is what gets classified.
 */
export function classifyCommandFailure(
  raw: unknown,
  operation: 'CREATE_TASK' | 'CLOSE_TASK',
  now: Date,
): TodoistFailure {
  const body = parseErrorBody(raw);
  return classifyHttpFailure({
    status: body.http_code ?? 400,
    body,
    retryAfterHeader: null,
    now,
    operation,
  });
}
