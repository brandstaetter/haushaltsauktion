/**
 * The two Todoist writes, over the Sync endpoint (Architektur Todoist §8.1).
 *
 * **Why hand-written rather than generated or SDK.** Todoist publishes no
 * downloadable OpenAPI document (`openapi.json` and `openapi.yaml` both 404; the
 * docs are Redoc-rendered with no exposed spec), so codegen had nothing
 * authoritative to consume. The official `@doist/todoist-sdk` is REST-only and
 * therefore has **no idempotency mechanism** — and two earlier revisions of this
 * design spent three review cycles building, and failing to specify, a
 * subsystem to compensate for that. The Sync endpoint's per-command `uuid`
 * gives exactly-once delivery outright:
 *
 *   > "Todoist will not execute a command that has same UUID as a previously
 *   > executed command."
 *
 * So this file is a deliberate, scoped exception to the project's
 * generate-don't-transcribe preference: a three-field command envelope is a
 * different risk profile from a full response schema, and choosing it **deleted**
 * an entire failure-handling subsystem rather than adding one. The read path
 * still uses the SDK — see `todoist-read.ts`.
 *
 * **Transport shape** (from the docs, and the live 401 probe): the request is
 * `application/x-www-form-urlencoded` with a `commands` field holding a JSON
 * array; the response is JSON. Crucially the endpoint answers **HTTP 200 and
 * then reports each command's fate individually** in `sync_status`, so a 200 is
 * not success — `sync_status[uuid]` must be checked.
 */

import type {
  CloseTaskCommand,
  CreateTaskCommand,
  CreateTaskOutcome,
  TodoistFailure,
  TodoistResult,
} from '../../app/integrations/ports.js';
import { toTodoistDue } from './todoist-due.js';
import {
  classifyCommandFailure,
  classifyHttpFailure,
  classifyTransportError,
  parseErrorBody,
} from './todoist-errors.js';

const SYNC_URL = 'https://api.todoist.com/api/v1/sync';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Injected so tests never touch the network. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SyncClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

interface SyncResponse {
  // `| undefined` explicitly: the project sets `exactOptionalPropertyTypes`, so
  // "may be absent" and "may be undefined" are distinct.
  sync_status?: Record<string, unknown> | undefined;
  temp_id_mapping?: Record<string, unknown> | undefined;
}

function parseSyncResponse(raw: unknown): SyncResponse {
  if (typeof raw !== 'object' || raw === null) return {};
  const body = raw as Record<string, unknown>;
  return {
    sync_status:
      typeof body.sync_status === 'object' && body.sync_status !== null
        ? (body.sync_status as Record<string, unknown>)
        : undefined,
    temp_id_mapping:
      typeof body.temp_id_mapping === 'object' && body.temp_id_mapping !== null
        ? (body.temp_id_mapping as Record<string, unknown>)
        : undefined,
  };
}

export function createTodoistSyncClient(options: SyncClientOptions = {}) {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? ((): Date => new Date());

  async function postCommands(
    token: string,
    command: Record<string, unknown>,
    operation: 'CREATE_TASK' | 'CLOSE_TASK',
  ): Promise<TodoistResult<SyncResponse>> {
    const body = new URLSearchParams({ commands: JSON.stringify([command]) });

    let response: Response;
    try {
      response = await doFetch(SYNC_URL, {
        method: 'POST',
        headers: {
          // Identical header for a personal token and an OAuth access token,
          // which is what keeps the deferred OAuth work additive.
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, failure: classifyTransportError(error) };
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // A non-JSON body on an error status is still classifiable by status; on a
      // 2xx it means we cannot confirm anything, which is a transient failure.
      if (response.ok) {
        return {
          ok: false,
          failure: {
            kind: 'TRANSIENT',
            status: response.status,
            message: 'Todoist antwortete 2xx, aber ohne verwertbaren JSON-Body.',
          },
        };
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: classifyHttpFailure({
          status: response.status,
          body: parseErrorBody(json),
          retryAfterHeader: response.headers.get('retry-after'),
          now: now(),
          operation,
        }),
      };
    }

    return { ok: true, value: parseSyncResponse(json) };
  }

  /**
   * Reads this command's own verdict out of `sync_status`.
   *
   * `"ok"` is success. Anything else is a per-command rejection carrying its own
   * `http_code`. A **missing** entry is treated as transient rather than
   * success: we cannot confirm the write, so retrying (idempotent, same `uuid`)
   * is safer than assuming it happened.
   */
  function commandVerdict(
    sync: SyncResponse,
    uuid: string,
    operation: 'CREATE_TASK' | 'CLOSE_TASK',
  ): { ok: true } | { ok: false; failure: TodoistFailure } {
    const entry = sync.sync_status?.[uuid];
    if (entry === 'ok') return { ok: true };
    if (entry === undefined) {
      return {
        ok: false,
        failure: {
          kind: 'TRANSIENT',
          message: `Todoist meldete keinen Status für Kommando ${uuid}.`,
        },
      };
    }
    return { ok: false, failure: classifyCommandFailure(entry, operation, now()) };
  }

  return {
    async createTask(
      token: string,
      command: CreateTaskCommand,
    ): Promise<TodoistResult<CreateTaskOutcome>> {
      // `temp_id` is how Sync hands back the new id, via `temp_id_mapping`.
      // Deriving it from the command uuid keeps a retry byte-identical.
      const tempId = `tmp-${command.commandUuid}`;
      const due = toTodoistDue(command.dueAt, command.timezone);

      const args: Record<string, unknown> = {
        content: command.content,
        description: command.description,
      };
      if (command.projectId !== null) args.project_id = command.projectId;
      if (due !== null) args.due = due;
      if (command.priority !== undefined) args.priority = command.priority;

      const result = await postCommands(
        token,
        { type: 'item_add', uuid: command.commandUuid, temp_id: tempId, args },
        'CREATE_TASK',
      );
      if (!result.ok) return result;

      const verdict = commandVerdict(result.value, command.commandUuid, 'CREATE_TASK');
      if (!verdict.ok) return { ok: false, failure: verdict.failure };

      const mapped = result.value.temp_id_mapping?.[tempId];
      if (typeof mapped === 'string' && mapped !== '') {
        return { ok: true, value: { kind: 'CREATED', externalTaskId: mapped } };
      }
      if (typeof mapped === 'number') {
        return { ok: true, value: { kind: 'CREATED', externalTaskId: String(mapped) } };
      }

      // Command accepted, no id returned. The task exists and we have no handle
      // to it — §8.2's case, and the reason `ORPHANED` is an absorbing state.
      // This branch also covers a *replayed* command uuid if Todoist omits the
      // mapping on dedup, which is undocumented and could not be verified
      // without a live account token.
      return { ok: true, value: { kind: 'ACCEPTED_WITHOUT_ID' } };
    },

    async closeTask(token: string, command: CloseTaskCommand): Promise<TodoistResult<void>> {
      const result = await postCommands(
        token,
        { type: 'item_close', uuid: command.commandUuid, args: { id: command.externalTaskId } },
        'CLOSE_TASK',
      );
      if (!result.ok) return result;

      const verdict = commandVerdict(result.value, command.commandUuid, 'CLOSE_TASK');
      if (!verdict.ok) return { ok: false, failure: verdict.failure };
      return { ok: true, value: undefined };
    },
  };
}
