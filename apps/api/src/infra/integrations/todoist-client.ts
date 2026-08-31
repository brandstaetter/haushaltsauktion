/**
 * The composed `TodoistPort` (Architektur Todoist §2, §8.1).
 *
 * Writes go through the Sync endpoint (exactly-once via the command `uuid`);
 * the project list is a plain hand-written GET (see `todoist-read.ts` for why
 * this is no longer SDK-backed). Both share one `FetchLike` injection point.
 * Nothing else in the codebase needs to know the two writes and the read are
 * separate request shapes — that split is an implementation detail of this
 * file, which is the point of having a port.
 */

import type { TodoistPort } from '../../app/integrations/ports.js';
import { createTodoistReadClient, type ProjectLister } from './todoist-read.js';
import { createTodoistSyncClient, type SyncClientOptions } from './todoist-sync.js';

export interface TodoistClientOptions extends SyncClientOptions {
  /** Overridden in tests; defaults to the fetch-backed reader. */
  projectLister?: ProjectLister;
}

export function createTodoistClient(options: TodoistClientOptions = {}): TodoistPort {
  const sync = createTodoistSyncClient(options);
  const reader = options.projectLister ?? createTodoistReadClient(options);

  return {
    createTask: sync.createTask,
    closeTask: sync.closeTask,
    listProjects: (token) => reader.listProjects(token),
  };
}
