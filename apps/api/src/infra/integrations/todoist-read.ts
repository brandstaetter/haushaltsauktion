/**
 * The read path: the member's project list, for the settings picker
 * (Architektur Todoist §8.1).
 *
 * This is the half where the official `@doist/todoist-sdk` earns its place —
 * official types, maintained against v1, and no transcription of a response
 * schema. Verified before adoption: v15.0.2 targets `api.todoist.com/api/v1/`
 * and its dist contains no reference to the retired v2 REST base path — which
 * matters, because that path now answers HTTP 410 (confirmed by live probe).
 * The literal string is deliberately not written here, so the repository-wide
 * grep gate for it stays a plain, exception-free check.
 *
 * The SDK's own types are deliberately **not** re-exported. `listProjects`
 * narrows to the two fields the picker needs, so an SDK major version cannot
 * ripple into `app/` or the web client.
 */

import { TodoistApi } from '@doist/todoist-sdk';

import type { TodoistProject, TodoistResult } from '../../app/integrations/ports.js';
import { classifyHttpFailure, classifyTransportError, parseErrorBody } from './todoist-errors.js';

/** Injected so tests never construct a real client. */
export interface ProjectLister {
  listProjects(token: string): Promise<TodoistResult<TodoistProject[]>>;
}

/**
 * Digs an HTTP status out of whatever the SDK threw.
 *
 * The SDK does not export a typed error class we can rely on across majors, so
 * this reads defensively rather than instanceof-ing something that may vanish.
 * An unrecognised shape is treated as transient — the safe default, since the
 * alternative would be marking a member's token invalid on an SDK quirk.
 */
function statusFromUnknownError(error: unknown): { status?: number | undefined; body: unknown } {
  if (typeof error !== 'object' || error === null) return { body: null };
  const candidate = error as Record<string, unknown>;

  const direct =
    typeof candidate.httpStatusCode === 'number'
      ? candidate.httpStatusCode
      : typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : undefined;

  const responseData =
    typeof candidate.responseData === 'object' && candidate.responseData !== null
      ? candidate.responseData
      : typeof candidate.body === 'object' && candidate.body !== null
        ? candidate.body
        : null;

  return { status: direct, body: responseData };
}

export function createTodoistReadClient(now: () => Date = () => new Date()): ProjectLister {
  return {
    async listProjects(token) {
      try {
        const api = new TodoistApi(token);
        const response = await api.getProjects();
        // The SDK returns a paginated envelope; only `results` matters here, and
        // a household's project count is far below one page.
        const raw = (response as { results?: unknown }).results;
        const rows = Array.isArray(raw) ? raw : [];
        const projects: TodoistProject[] = rows.flatMap((row) => {
          if (typeof row !== 'object' || row === null) return [];
          const project = row as Record<string, unknown>;
          const id = project.id;
          const name = project.name;
          if (typeof id !== 'string' && typeof id !== 'number') return [];
          if (typeof name !== 'string') return [];
          return [{ id: String(id), name }];
        });
        return { ok: true, value: projects };
      } catch (error) {
        const { status, body } = statusFromUnknownError(error);
        if (status === undefined) {
          return { ok: false, failure: classifyTransportError(error) };
        }
        return {
          ok: false,
          failure: classifyHttpFailure({
            status,
            body: parseErrorBody(body),
            retryAfterHeader: null,
            now: now(),
            // A failed project list is never a "benign gone" case.
            operation: 'CREATE_TASK',
          }),
        };
      }
    },
  };
}
