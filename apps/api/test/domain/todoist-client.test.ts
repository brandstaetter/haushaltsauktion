/**
 * Todoist client + failure classification (Architektur Todoist §8, §12).
 *
 * **No test here touches the network.** `fetch` is injected, which is the same
 * discipline `deps.ts` already applies to `Clock`, `Rng` and `Notifier`. A live
 * test would be flaky, would need a real token in CI, and would create tasks in
 * somebody's actual Todoist account.
 *
 * Two of these cases encode findings from probing the real API, and both are the
 * kind of thing a plausible implementation gets wrong:
 *   - 401 carries `Retry-After`, so it must NOT be treated as retryable;
 *   - `error_code` is not the HTTP status (`477` alongside `http_code: 401`).
 */

import { describe, expect, it, vi } from 'vitest';

import { createTodoistSyncClient } from '../../src/infra/integrations/todoist-sync.js';
import { toTodoistDue } from '../../src/infra/integrations/todoist-due.js';
import {
  classifyHttpFailure,
  parseRetryAfter,
} from '../../src/infra/integrations/todoist-errors.js';

const NOW = new Date('2026-08-31T12:00:00Z');
const TOKEN = 'test-token';

const CREATE = {
  commandUuid: '11111111-1111-4111-8111-111111111111',
  content: 'Bad putzen',
  description: 'Wert: 6 Punkte',
  projectId: null,
  dueAt: null,
  timezone: 'Europe/Berlin',
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function clientReturning(response: Response | (() => Promise<never>)) {
  // Params are annotated so `mock.calls` is typed as the real fetch tuple
  // rather than `[]` — otherwise the request-shape assertions cannot compile.
  const fetchImpl = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
    typeof response === 'function' ? await response() : response,
  );
  return { client: createTodoistSyncClient({ fetchImpl, now: () => NOW }), fetchImpl };
}

describe('sync createTask — transport and request shape', () => {
  it('posts form-encoded commands with the outbox id as the command uuid', async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, {
        sync_status: { [CREATE.commandUuid]: 'ok' },
        temp_id_mapping: { [`tmp-${CREATE.commandUuid}`]: '9012345678' },
      }),
    );

    const result = await client.createTask(TOKEN, CREATE);
    expect(result).toEqual({ ok: true, value: { kind: 'CREATED', externalTaskId: '9012345678' } });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.todoist.com/api/v1/sync');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const params = new URLSearchParams(String(init?.body));
    const commands = JSON.parse(params.get('commands') ?? '[]');
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('item_add');
    // The uuid is what makes a retry exactly-once; it must be sent verbatim.
    expect(commands[0].uuid).toBe(CREATE.commandUuid);
    expect(commands[0].temp_id).toBe(`tmp-${CREATE.commandUuid}`);
    expect(commands[0].args.content).toBe('Bad putzen');
  });

  it('coerces a numeric task id to a string, since v1 ids are opaque strings', async () => {
    const { client } = clientReturning(
      jsonResponse(200, {
        sync_status: { [CREATE.commandUuid]: 'ok' },
        temp_id_mapping: { [`tmp-${CREATE.commandUuid}`]: 9012345678 },
      }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result).toMatchObject({ ok: true, value: { externalTaskId: '9012345678' } });
  });

  it('omits project_id and due when absent rather than sending nulls', async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, {
        sync_status: { [CREATE.commandUuid]: 'ok' },
        temp_id_mapping: { [`tmp-${CREATE.commandUuid}`]: '1' },
      }),
    );
    await client.createTask(TOKEN, CREATE);
    const params = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const args = JSON.parse(params.get('commands') ?? '[]')[0].args;
    expect(args).not.toHaveProperty('project_id');
    expect(args).not.toHaveProperty('due');
  });
});

describe('sync createTask — the ORPHANED case (§8.2)', () => {
  it('reports ACCEPTED_WITHOUT_ID when the command is ok but no id comes back', async () => {
    // This is the exact condition that maps to OutboxStatus.ORPHANED: the task
    // exists at Todoist and we have irrecoverably lost the handle to it.
    const { client } = clientReturning(
      jsonResponse(200, { sync_status: { [CREATE.commandUuid]: 'ok' }, temp_id_mapping: {} }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result).toEqual({ ok: true, value: { kind: 'ACCEPTED_WITHOUT_ID' } });
  });

  it('also reports ACCEPTED_WITHOUT_ID when temp_id_mapping is missing entirely', async () => {
    // Defensive, and now known to be defensive rather than load-bearing.
    //
    // A live probe against a real account settled the open question: replaying a
    // command with an already-executed `uuid` DOES still return
    // `temp_id_mapping`, with the same id — so the crash-window case (Todoist
    // committed, our Tx B did not) resolves normally on retry and never reaches
    // this branch.
    //
    // The branch is kept because that behaviour is undocumented, was measured on
    // one account at one API version, and the failure it guards — a task in the
    // member's Todoist that we can never manage again — is both invisible and
    // permanent. One enum value and one branch is a cheap hedge against a
    // contract that was never written down.
    const { client } = clientReturning(
      jsonResponse(200, { sync_status: { [CREATE.commandUuid]: 'ok' } }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result).toEqual({ ok: true, value: { kind: 'ACCEPTED_WITHOUT_ID' } });
  });
});

describe('sync createTask — per-command failures inside HTTP 200', () => {
  it('treats a rejected command as a failure even though the transport said 200', async () => {
    const { client } = clientReturning(
      jsonResponse(200, {
        sync_status: {
          [CREATE.commandUuid]: {
            error: 'Invalid project id',
            error_tag: 'INVALID_ARGUMENT',
            error_code: 20,
            http_code: 400,
          },
        },
      }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('PERMANENT_REQUEST');
    expect(result.failure.errorTag).toBe('INVALID_ARGUMENT');
  });

  it('treats a missing sync_status entry as transient, not as success', async () => {
    // We cannot confirm the write; retrying is idempotent, assuming is not.
    const { client } = clientReturning(jsonResponse(200, { sync_status: {} }));
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('TRANSIENT');
  });

  it('treats a 2xx with an unparseable body as transient', async () => {
    const { client } = clientReturning(
      new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('TRANSIENT');
  });
});

describe('sync — HTTP-level failures (the Phase 4 gate)', () => {
  it('401 is permanent-auth and is NOT given a retry hint, despite Retry-After', async () => {
    // The live API really does send Retry-After on 401. A client that keyed off
    // the header would retry a dead token forever and never tell the member.
    const { client } = clientReturning(
      jsonResponse(
        401,
        {
          error: 'Invalid token',
          error_code: 401,
          error_tag: 'AUTH_INVALID_TOKEN',
          http_code: 401,
          error_extra: { event_id: 'abc123', retry_after: 1 },
        },
        { 'retry-after': '1' },
      ),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('PERMANENT_AUTH');
    expect(result.failure.retryAfterSeconds).toBeUndefined();
    expect(result.failure.errorTag).toBe('AUTH_INVALID_TOKEN');
    expect(result.failure.eventId).toBe('abc123');
  });

  it('403 is permanent-auth', async () => {
    const { client } = clientReturning(jsonResponse(403, { error: 'Forbidden' }));
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('PERMANENT_AUTH');
  });

  it('429 is transient and carries Retry-After', async () => {
    const { client } = clientReturning(
      jsonResponse(429, { error: 'Too many requests' }, { 'retry-after': '42' }),
    );
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('TRANSIENT');
    expect(result.failure.retryAfterSeconds).toBe(42);
  });

  it('429 without the header falls back to the body, then to undefined — never NaN', async () => {
    const withBody = clientReturning(
      jsonResponse(429, { error: 'slow down', error_extra: { retry_after: 7 } }),
    );
    const a = await withBody.client.createTask(TOKEN, CREATE);
    if (a.ok) throw new Error('unreachable');
    expect(a.failure.retryAfterSeconds).toBe(7);

    const bare = clientReturning(jsonResponse(429, { error: 'slow down' }));
    const b = await bare.client.createTask(TOKEN, CREATE);
    if (b.ok) throw new Error('unreachable');
    expect(b.failure.retryAfterSeconds).toBeUndefined();
    expect(Number.isNaN(b.failure.retryAfterSeconds as unknown as number)).toBe(false);
  });

  it('500 and 503 are transient', async () => {
    for (const status of [500, 502, 503]) {
      const { client } = clientReturning(jsonResponse(status, { error: 'oops' }));
      const result = await client.createTask(TOKEN, CREATE);
      if (result.ok) throw new Error('unreachable');
      expect(result.failure.kind, `status ${status}`).toBe('TRANSIENT');
    }
  });

  it('400 and 422 are permanent-request and leave the integration untouched', async () => {
    for (const status of [400, 422]) {
      const { client } = clientReturning(jsonResponse(status, { error: 'bad request' }));
      const result = await client.createTask(TOKEN, CREATE);
      if (result.ok) throw new Error('unreachable');
      expect(result.failure.kind, `status ${status}`).toBe('PERMANENT_REQUEST');
    }
  });

  it('a timeout (AbortError) is transient', async () => {
    const { client } = clientReturning(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    });
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('TRANSIENT');
    expect(result.failure.message).toMatch(/Zeitlimit/);
  });

  it('a network error is transient', async () => {
    const { client } = clientReturning(async () => {
      throw new TypeError('fetch failed');
    });
    const result = await client.createTask(TOKEN, CREATE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('TRANSIENT');
  });
});

describe('sync closeTask', () => {
  const CLOSE = { commandUuid: '22222222-2222-4222-8222-222222222222', externalTaskId: '9012345678' };

  it('sends item_close with the external id', async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, { sync_status: { [CLOSE.commandUuid]: 'ok' } }),
    );
    const result = await client.closeTask(TOKEN, CLOSE);
    expect(result.ok).toBe(true);

    const params = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const command = JSON.parse(params.get('commands') ?? '[]')[0];
    expect(command.type).toBe('item_close');
    expect(command.uuid).toBe(CLOSE.commandUuid);
    expect(command.args.id).toBe('9012345678');
  });

  it('treats a 404 on close as benign — the task is already gone', async () => {
    const { client } = clientReturning(jsonResponse(404, { error: 'Item not found' }));
    const result = await client.closeTask(TOKEN, CLOSE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure.kind).toBe('BENIGN_GONE');
  });
});

describe('classifyHttpFailure — error_code is not the status', () => {
  it('classifies on the HTTP status, ignoring a Todoist-internal error_code', () => {
    // The live /projects probe returned exactly this pairing.
    const failure = classifyHttpFailure({
      status: 401,
      body: { error: 'Unauthorized', error_tag: 'UNAUTHORIZED', error_code: 477, http_code: 401 },
      retryAfterHeader: '4',
      now: NOW,
      operation: 'CREATE_TASK',
    });
    expect(failure.kind).toBe('PERMANENT_AUTH');
    expect(failure.retryAfterSeconds).toBeUndefined();
  });

  it('a 404 on create is a real failure, not benign', () => {
    const failure = classifyHttpFailure({
      status: 404,
      body: {},
      retryAfterHeader: null,
      now: NOW,
      operation: 'CREATE_TASK',
    });
    expect(failure.kind).toBe('PERMANENT_REQUEST');
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds', () => {
    expect(parseRetryAfter('30', NOW)).toBe(30);
    expect(parseRetryAfter('  0 ', NOW)).toBe(0);
  });

  it('reads an HTTP date as a delta', () => {
    expect(parseRetryAfter(new Date(NOW.getTime() + 60_000).toUTCString(), NOW)).toBe(60);
  });

  it('clamps a past date to zero and an absurd value to a day', () => {
    expect(parseRetryAfter(new Date(NOW.getTime() - 60_000).toUTCString(), NOW)).toBe(0);
    expect(parseRetryAfter('999999999', NOW)).toBe(86_400);
  });

  it('rejects nonsense rather than returning NaN', () => {
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter('', NOW)).toBeUndefined();
    expect(parseRetryAfter('soon', NOW)).toBeUndefined();
    expect(parseRetryAfter('-5', NOW)).toBeUndefined();
  });
});

describe('toTodoistDue', () => {
  it('returns null when there is no due date', () => {
    expect(toTodoistDue(null, 'Europe/Berlin')).toBeNull();
  });

  it('sends midnight-in-household-timezone as an all-day date', () => {
    // 2026-09-05T00:00 Berlin is 2026-09-04T22:00Z. Reading the UTC parts would
    // put this chore on the 4th — a day early.
    const dueAt = new Date('2026-09-04T22:00:00Z');
    expect(toTodoistDue(dueAt, 'Europe/Berlin')).toEqual({
      date: '2026-09-05',
      timezone: 'Europe/Berlin',
    });
  });

  it('sends a timed due date as an absolute UTC instant', () => {
    const dueAt = new Date('2026-09-05T07:30:00Z');
    expect(toTodoistDue(dueAt, 'Europe/Berlin')).toEqual({ date: '2026-09-05T07:30:00Z' });
  });

  it('falls back to UTC on an invalid timezone rather than losing the task', () => {
    const dueAt = new Date('2026-09-05T00:00:00Z');
    expect(toTodoistDue(dueAt, 'Not/AZone')).toEqual({ date: '2026-09-05', timezone: 'UTC' });
  });

  it('handles a timezone west of UTC without shifting the day', () => {
    // 2026-09-05T00:00 New York is 2026-09-05T04:00Z.
    const dueAt = new Date('2026-09-05T04:00:00Z');
    expect(toTodoistDue(dueAt, 'America/New_York')).toEqual({
      date: '2026-09-05',
      timezone: 'America/New_York',
    });
  });
});
