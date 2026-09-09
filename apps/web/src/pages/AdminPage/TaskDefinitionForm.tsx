import { useState } from 'react';
import { MemberRole, RecurrenceType, WorkerCountMode } from '@haushaltsauktion/shared';
import {
  useAdminTaskDefinitionDetail,
  useCancelInstance,
  useCancelOpenInstancesOfDefinition,
  useCreateTaskDefinition,
  useRevokeAssignment,
  useUpdateTaskDefinition,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { AdminTaskDefinitionDto, AdminTaskInstanceRowDto, CategoryDto, RecurrenceDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { DurationInput } from '../../components/DurationInput/DurationInput';
import { Toast } from '../../components/Toast/Toast';
import { interpolate } from '../../utils/format';
import { taskDefinitionErrorMessage } from './taskDefinitionErrors';
import { InstanceRow } from './InstanceRow';
import { TurnusComponent, type TurnusDraft } from './TurnusComponent';
import styles from './AdminPage.module.css';

/** Intake "admin-cancel-or-sync-open-instances-on-definition-change". */
function cancelInstanceErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'ILLEGAL_TRANSITION') {
    return de.admin.taskDefinitions.instances.errors.illegalTransition;
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.taskDefinitions.instances.errors.generic;
}

/** Same error shape as `TaskDetailPage`'s own unassign form (§26 revoke path). */
function unassignInstanceErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'ASSIGNMENT_CLOSED') {
    return de.admin.taskDefinitions.instances.errors.alreadyHandled;
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.taskDefinitions.instances.errors.generic;
}

interface TaskDefinitionDraft {
  title: string;
  description: string;
  categoryId: string | null;
  baseValue: number;
  estimatedMinutes: number | null;
  buyoutEnabled: boolean;
  isActive: boolean;
  /** Multi-worker-tasks (Phase 4). */
  workerCountMode: WorkerCountMode;
  workerCount: number;
  /** Intake "task-role-based-eligibility-and-preferred-assignee". */
  requiredRole: MemberRole | null;
  minAdminSlots: number | null;
  recurrence: TurnusDraft;
}

function emptyDraft(): TaskDefinitionDraft {
  return {
    title: '',
    description: '',
    categoryId: null,
    baseValue: 1,
    estimatedMinutes: null,
    buyoutEnabled: true,
    isActive: true,
    // Parity with today's implicit single-worker behavior (§ Phase 4 default).
    workerCountMode: WorkerCountMode.EXACTLY,
    workerCount: 1,
    requiredRole: null,
    minAdminSlots: null,
    recurrence: {
      type: RecurrenceType.WEEKLY,
      interval: null,
      weekdays: [],
      dayOfMonth: null,
      timeOfDay: '',
      dueOffsetMinutes: null,
    },
  };
}

function draftFromDefinition(def: AdminTaskDefinitionDto): TaskDefinitionDraft {
  return {
    title: def.title,
    description: def.description ?? '',
    categoryId: def.categoryId,
    baseValue: def.baseValue,
    estimatedMinutes: def.estimatedMinutes,
    buyoutEnabled: def.buyoutEnabled,
    isActive: def.isActive,
    workerCountMode: def.workerCountMode,
    workerCount: def.workerCount,
    requiredRole: def.requiredRole,
    minAdminSlots: def.minAdminSlots,
    recurrence: {
      type: def.recurrenceType,
      interval: def.recurrenceInterval,
      weekdays: def.recurrenceWeekdays,
      dayOfMonth: def.recurrenceDayOfMonth,
      timeOfDay: def.recurrenceTimeOfDay ?? '',
      dueOffsetMinutes: def.dueOffsetMinutes,
    },
  };
}

function toWriteBody(draft: TaskDefinitionDraft): {
  title: string;
  description: string | null;
  categoryId: string | null;
  baseValue: number;
  estimatedMinutes: number | null;
  buyoutEnabled: boolean;
  isActive: boolean;
  workerCountMode: WorkerCountMode;
  workerCount: number;
  requiredRole: MemberRole | null;
  minAdminSlots: number | null;
  recurrence: RecurrenceDto;
} {
  const type = draft.recurrence.type;
  const workerCount = Math.max(1, draft.workerCount);
  return {
    title: draft.title,
    description: draft.description.trim() === '' ? null : draft.description,
    categoryId: draft.categoryId,
    baseValue: draft.baseValue,
    estimatedMinutes: draft.estimatedMinutes,
    buyoutEnabled: draft.buyoutEnabled,
    isActive: draft.isActive,
    // Client-side floor, mirroring the server's `.min(1)` (§ Phase 4 task):
    // don't let the admin submit an invalid count in the first place.
    workerCountMode: draft.workerCountMode,
    workerCount,
    requiredRole: draft.requiredRole,
    // Hidden (and so unreachable) once workerCount drops back to 1 — clear it
    // rather than silently submit a stale value the admin can no longer see.
    minAdminSlots: workerCount > 1 ? draft.minAdminSlots : null,
    recurrence: {
      type,
      interval: type === 'EVERY_N_DAYS' ? draft.recurrence.interval : null,
      weekdays: type === 'WEEKDAYS' || type === 'WEEKLY' ? draft.recurrence.weekdays : [],
      dayOfMonth: type === 'MONTHLY' ? draft.recurrence.dayOfMonth : null,
      timeOfDay:
        type !== 'MANUAL' && draft.recurrence.timeOfDay.trim() !== ''
          ? draft.recurrence.timeOfDay.trim()
          : null,
      dueOffsetMinutes: type !== 'MANUAL' ? draft.recurrence.dueOffsetMinutes : null,
    },
  };
}

/**
 * §17/§23 visibility: what a definition has actually produced and who holds
 * it, so an admin editing it can see at a glance what's in flight before
 * changing base values or eligibility out from under it. Was read-only —
 * cancelling an open instance (including one already `ASSIGNED`) is the
 * action intake "admin-cancel-or-sync-open-instances-on-definition-change"
 * adds, both per-instance and for every open instance of this definition at
 * once (the actual trigger case: the definition just changed).
 */
function LiveInstancesList({ definitionId }: { definitionId: string }) {
  const { de } = useStrings();
  const t = de.admin.taskDefinitions.instances;
  const { data, isLoading } = useAdminTaskDefinitionDetail(definitionId);
  const cancelInstance = useCancelInstance();
  const cancelAll = useCancelOpenInstancesOfDefinition();
  const revokeAssignment = useRevokeAssignment();
  const instances = data?.instances ?? [];

  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [allError, setAllError] = useState<string | null>(null);

  // Copilot review (PR #63): the bulk cancel and every per-instance cancel
  // shared no lock, so one in-flight cancel didn't stop another from firing
  // — overlapping mutations against the same definition's instances. One
  // action (bulk cancel, per-instance cancel, or unassign) at a time; every
  // button disables while any of them is in flight, not just the one that
  // started it.
  const anyActionInFlight = cancellingId !== null || cancelAll.isPending || unassigningId !== null;

  const handleCancel = (instanceId: string) => {
    setRowErrors((prev) => ({ ...prev, [instanceId]: null }));
    setCancellingId(instanceId);
    cancelInstance.mutate(
      { id: instanceId },
      {
        onSuccess: () => {
          setCancellingId(null);
          setMessage(t.cancelSuccess);
        },
        onError: (err) => {
          setCancellingId(null);
          setRowErrors((prev) => ({ ...prev, [instanceId]: cancelInstanceErrorMessage(err, de) }));
        },
      },
    );
  };

  const handleUnassign = (instance: AdminTaskInstanceRowDto) => {
    setRowErrors((prev) => ({ ...prev, [instance.id]: null }));
    setUnassigningId(instance.id);
    revokeAssignment.mutate(
      {
        instanceId: instance.id,
        reason: null,
        // Multi-worker-tasks: the backend rejects with `AMBIGUOUS_ASSIGNMENT`
        // once more than one slot is active without a target — this row
        // action only ever targets the first slot, same limitation as the
        // rest of this list (no per-assignee UI here yet).
        assignmentId: instance.assignments[0]?.id,
      },
      {
        onSuccess: () => {
          setUnassigningId(null);
          setMessage(t.unassignSuccess);
        },
        onError: (err) => {
          setUnassigningId(null);
          setRowErrors((prev) => ({ ...prev, [instance.id]: unassignInstanceErrorMessage(err, de) }));
        },
      },
    );
  };

  const handleCancelAll = () => {
    setAllError(null);
    cancelAll.mutate(
      { id: definitionId },
      {
        onSuccess: (result) => {
          setMessage(interpolate(t.cancelAllSuccess, { cancelled: result.cancelled }));
        },
        onError: (err) => setAllError(cancelInstanceErrorMessage(err, de)),
      },
    );
  };

  return (
    <div className={styles.restrictionsForm}>
      <h3 className={styles.sectionTitle}>{t.title}</h3>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : instances.length === 0 ? (
        <p className={styles.hint}>{t.empty}</p>
      ) : (
        <>
          {allError && (
            <div className={styles.message} role="alert">
              {allError}
            </div>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={handleCancelAll}
            loading={cancelAll.isPending}
            disabled={anyActionInFlight}
          >
            {t.cancelAllButton}
          </Button>
          <ul className={styles.checkboxList}>
            {instances.map((instance) => (
              <InstanceRow
                key={instance.id}
                instance={instance}
                baseValue={data?.baseValue ?? instance.currentValue}
                error={rowErrors[instance.id] ?? null}
                cancelling={cancellingId === instance.id}
                unassigning={unassigningId === instance.id}
                disabled={anyActionInFlight}
                onCancel={() => handleCancel(instance.id)}
                onUnassign={() => handleUnassign(instance)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The create/edit sheet's form, extracted from `TaskDefinitionsSection` so
 * it can be reasoned about (and eventually tested) independently of the
 * list/filter/archive machinery around it. */
export function TaskDefinitionForm({
  initial,
  categories,
  onClose,
  onSaved,
}: {
  initial: AdminTaskDefinitionDto | null;
  categories: CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { de } = useStrings();
  const createDefinition = useCreateTaskDefinition();
  const updateDefinition = useUpdateTaskDefinition();
  const [draft, setDraft] = useState<TaskDefinitionDraft>(() =>
    initial ? draftFromDefinition(initial) : emptyDraft(),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<TaskDefinitionDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));
  const updateRecurrence = (patch: Partial<TaskDefinitionDraft['recurrence']>) =>
    setDraft((prev) => ({ ...prev, recurrence: { ...prev.recurrence, ...patch } }));

  const pending = createDefinition.isPending || updateDefinition.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = toWriteBody(draft);
    if (initial) {
      updateDefinition.mutate(
        { id: initial.id, body },
        { onSuccess: onSaved, onError: (err) => setError(taskDefinitionErrorMessage(err, de)) },
      );
    } else {
      createDefinition.mutate(body, {
        onSuccess: onSaved,
        onError: (err) => setError(taskDefinitionErrorMessage(err, de)),
      });
    }
  };

  return (
    <form className={styles.restrictionsForm} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.titleField}</span>
        <input
          type="text"
          required
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.description}</span>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.category}</span>
        <select
          value={draft.categoryId ?? ''}
          onChange={(e) => update({ categoryId: e.target.value === '' ? null : e.target.value })}
        >
          <option value="">{de.admin.taskDefinitions.noCategory}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.baseValue}</span>
        <input
          type="number"
          min={0}
          required
          value={draft.baseValue}
          onChange={(e) => update({ baseValue: parseInt(e.target.value, 10) || 0 })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.estimatedMinutes}</span>
        <DurationInput
          valueMinutes={draft.estimatedMinutes}
          placeholder="∞"
          onChange={(minutes) => update({ estimatedMinutes: minutes })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.workerCountMode}</span>
        <select
          value={draft.workerCountMode}
          onChange={(e) => update({ workerCountMode: e.target.value as WorkerCountMode })}
        >
          {Object.values(WorkerCountMode).map((mode) => (
            <option key={mode} value={mode}>
              {de.admin.taskDefinitions.workerCountModes[mode]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.workerCount}</span>
        <input
          type="number"
          min={1}
          max={20}
          required
          value={draft.workerCount}
          // Same idiom as `baseValue` above: don't clamp on every keystroke
          // (clamping to the floor while the field is transiently empty
          // makes it un-clearable — typing a replacement digit would
          // concatenate onto the clamped value instead of replacing it).
          // `toWriteBody`'s `Math.max(1, ...)` is the real floor at submit.
          onChange={(e) => update({ workerCount: parseInt(e.target.value, 10) || 0 })}
        />
      </label>
      {/* Multi-worker-tasks (Phase 4) parity: only meaningful once more than
          one helper slot exists — hidden otherwise, same as workerCountMode's
          UI grouping above. */}
      {draft.workerCount > 1 && (
        <label className={styles.field}>
          <span>{de.admin.taskDefinitions.minAdminSlots}</span>
          <input
            type="number"
            min={0}
            max={20}
            value={draft.minAdminSlots ?? ''}
            placeholder="–"
            onChange={(e) =>
              update({
                minAdminSlots: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0,
              })
            }
          />
          <span className={styles.hint}>{de.admin.taskDefinitions.minAdminSlotsHint}</span>
        </label>
      )}
      <label className={styles.field}>
        <span>{de.admin.taskDefinitions.requiredRole}</span>
        <select
          value={draft.requiredRole ?? ''}
          onChange={(e) =>
            update({ requiredRole: e.target.value === '' ? null : (e.target.value as MemberRole) })
          }
        >
          <option value="">{de.admin.taskDefinitions.requiredRoleNone}</option>
          <option value={MemberRole.MEMBER}>
            {de.admin.taskDefinitions.requiredRoleValues.MEMBER}
          </option>
          <option value={MemberRole.ADMIN}>
            {de.admin.taskDefinitions.requiredRoleValues.ADMIN}
          </option>
        </select>
      </label>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.buyoutEnabled}
          onChange={(e) => update({ buyoutEnabled: e.target.checked })}
        />
        <span>{de.admin.taskDefinitions.buyoutEnabled}</span>
      </label>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => update({ isActive: e.target.checked })}
        />
        <span>{de.admin.taskDefinitions.active}</span>
      </label>

      <TurnusComponent value={draft.recurrence} onChange={updateRecurrence} />

      {initial && <LiveInstancesList definitionId={initial.id} />}

      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          {initial ? de.admin.taskDefinitions.save : de.admin.taskDefinitions.create}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.admin.taskDefinitions.cancel}
        </Button>
      </div>
    </form>
  );
}
