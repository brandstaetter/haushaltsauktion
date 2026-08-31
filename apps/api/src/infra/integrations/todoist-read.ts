/**
 * The read path: the member's project list, for the settings picker
 * (Architektur Todoist §8.1).
 *
 * **Revised after PR review.** This originally used the official
 * `@doist/todoist-sdk` — official types, maintained against v1, no
 * transcription of a response schema. That reasoning still holds, but the
 * package declares `engines.node: ">=24"` while this repo's CI and deploy
 * workflows pin Node 20 (`.github/workflows/{deploy,restore-drill}.yml`), a
 * real compatibility risk flagged by automated PR review rather than caught
 * before merge. Bumping the platform's Node version to accommodate a single
 * read-only GET call would be a much larger, riskier change than the
 * dependency it's working around.
 *
 * So this file now hand-writes the GET the same way `todoist-sync.ts`
 * hand-writes the two writes — same `FetchLike` injection, same error
 * classification, same narrow return type (`listProjects` only ever
 * surfaces `{id, name}`, so a wire-format change upstream cannot ripple
 * into `app/` or the web client). `@doist/todoist-sdk` has been removed
 * from `apps/api/package.json` entirely; nothing else in the codebase
 * referenced it.
 */

import type { TodoistProject, TodoistResult } from '../../app/integrations/ports.js';
import {
  classifyHttpFailure,
  classifyTransportError,
  parseErrorBody,
} from './todoist-errors.js';

const PROJECTS_URL = 'https://api.todoist.com/api/v1/projects';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Injected so tests never construct a real client. */
export interface ProjectLister {
  listProjects(token: string): Promise<TodoistResult<TodoistProject[]>>;
}

/** Matches `todoist-sync.ts`'s injection point so both clients share one fetch impl. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ReadClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export function createTodoistReadClient(options: ReadClientOptions = {}): ProjectLister {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? ((): Date => new Date());

  return {
    async listProjects(token) {
      let response: Response;
      try {
        response = await doFetch(PROJECTS_URL, {
          method: 'GET',
          headers: {
            // Identical header for a personal token and an OAuth access token —
            // see todoist-sync.ts.
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return { ok: false, failure: classifyTransportError(error) };
      }

      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        // A non-JSON body on an error status is still classifiable by status; on
        // a 2xx it means we cannot confirm anything, which is a transient
        // failure rather than an empty project list.
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
            // A failed project list is never a "benign gone" case.
            operation: 'CREATE_TASK',
          }),
        };
      }

      // The endpoint returns a paginated envelope; only `results` matters
      // here, and a household's project count is far below one page.
      const raw = (json as { results?: unknown } | null)?.results;
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
    },
  };
}
