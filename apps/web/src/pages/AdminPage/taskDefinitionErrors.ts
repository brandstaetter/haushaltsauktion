import { ApiError } from '../../api/client';
import type { Strings } from '../../strings/de';
import { interpolate } from '../../utils/format';

/**
 * Maps a task-definition mutation's rejection onto a readable German message
 * (§31), mirroring `memberErrorMessage` in `MembersSection.tsx`.
 * `HAS_OPEN_INSTANCES` is `DELETE /admin/task-definitions/:id`'s conflict
 * when open instances still exist for the definition being archived.
 *
 * Shared between `TaskDefinitionsSection` (archive/materialize/reactivate,
 * eligibility) and `TaskDefinitionForm` (create/edit) — kept in its own
 * module so neither has to import the other for it.
 */
export function taskDefinitionErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string; details?: { count?: number }; message?: string };
  if (apiErr.code === 'HAS_OPEN_INSTANCES') {
    return interpolate(de.admin.taskDefinitions.errors.hasOpenInstances, {
      count: apiErr.details?.count ?? 0,
    });
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.taskDefinitions.errors.generic;
}
