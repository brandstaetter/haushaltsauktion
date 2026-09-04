import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { MemberRole, RecurrenceType, WorkerCountMode } from '@haushaltsauktion/shared';
import {
  useAdminCategories,
  useAdminMembers,
  useAdminTaskDefinitionDetail,
  useAdminTaskDefinitions,
  useArchiveTaskDefinition,
  useCancelInstance,
  useCancelOpenInstancesOfDefinition,
  useCreateTaskDefinition,
  useMaterializeTaskDefinition,
  useReactivateTaskDefinition,
  useSession,
  useUpdateTaskDefinition,
  useUpdateTaskEligibility,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type {
  AdminMemberDto,
  AdminTaskDefinitionDto,
  AdminTaskInstanceRowDto,
  CategoryDto,
  RecurrenceDto,
} from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { DurationInput } from '../../components/DurationInput/DurationInput';
import { Sheet } from '../../components/Sheet/Sheet';
import { TaskMaintenanceCard } from '../../components/TaskMaintenanceCard/TaskMaintenanceCard';
import { TimeOfDayInput } from '../../components/TimeOfDayInput/TimeOfDayInput';
import { Toast } from '../../components/Toast/Toast';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

/**
 * Maps a task-definition mutation's rejection onto a readable German message
 * (§31), mirroring `memberErrorMessage` in `MembersSection.tsx`.
 * `HAS_OPEN_INSTANCES` is `DELETE /admin/task-definitions/:id`'s conflict
 * when open instances still exist for the definition being archived.
 */
function taskDefinitionErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string; details?: { count?: number }; message?: string };
  if (apiErr.code === 'HAS_OPEN_INSTANCES') {
    return interpolate(de.admin.taskDefinitions.errors.hasOpenInstances, {
      count: apiErr.details?.count ?? 0,
    });
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.taskDefinitions.errors.generic;
}

/** Intake "admin-cancel-or-sync-open-instances-on-definition-change". */
function cancelInstanceErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'ILLEGAL_TRANSITION') {
    return de.admin.taskDefinitions.instances.errors.illegalTransition;
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.taskDefinitions.instances.errors.generic;
}

// ───────────────────────── create/edit sheet ─────────────────────────

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
  recurrence: {
    type: RecurrenceType;
    interval: number | null;
    weekdays: number[];
    dayOfMonth: number | null;
    timeOfDay: string;
    dueOffsetMinutes: number | null;
  };
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

function RecurrenceFields({
  value,
  onChange,
}: {
  value: TaskDefinitionDraft['recurrence'];
  onChange: (patch: Partial<TaskDefinitionDraft['recurrence']>) => void;
}) {
  const { de } = useStrings();
  const r = de.admin.taskDefinitions.recurrence;
  const { data: session } = useSession();

  const toggleWeekday = (day: number) => {
    onChange({
      weekdays: value.weekdays.includes(day)
        ? value.weekdays.filter((d) => d !== day)
        : [...value.weekdays, day].sort((a, b) => a - b),
    });
  };

  return (
    <div className={styles.restrictionsForm}>
      <h3 className={styles.sectionTitle}>{r.title}</h3>
      <label className={styles.field}>
        <span>{r.type}</span>
        <select
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as RecurrenceType })}
        >
          {Object.values(RecurrenceType).map((t) => (
            <option key={t} value={t}>
              {r.types[t]}
            </option>
          ))}
        </select>
      </label>

      {value.type === 'EVERY_N_DAYS' && (
        <label className={styles.field}>
          <span>{r.interval}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={value.interval ?? ''}
            onChange={(e) =>
              onChange({ interval: e.target.value === '' ? null : parseInt(e.target.value, 10) || 1 })
            }
          />
        </label>
      )}

      {(value.type === 'WEEKDAYS' || value.type === 'WEEKLY') && (
        <div>
          <span>{r.weekdays}</span>
          <div className={styles.checkboxList}>
            {r.weekdayLabels.map((label, index) => (
              <label key={label} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={value.weekdays.includes(index + 1)}
                  onChange={() => toggleWeekday(index + 1)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {value.type === 'MONTHLY' && (
        <label className={styles.field}>
          <span>{r.dayOfMonth}</span>
          <input
            type="number"
            min={1}
            max={28}
            value={value.dayOfMonth ?? ''}
            onChange={(e) =>
              onChange({
                dayOfMonth: e.target.value === '' ? null : parseInt(e.target.value, 10) || 1,
              })
            }
          />
        </label>
      )}

      {value.type !== 'MANUAL' && (
        <>
          <label className={styles.field}>
            <span>{r.timeOfDay}</span>
            <TimeOfDayInput value={value.timeOfDay} onChange={(v) => onChange({ timeOfDay: v })} />
          </label>
          {session?.household && (
            <p className={styles.hint}>
              {interpolate(de.components.timezoneNote, { timezone: session.household.timezone })}
            </p>
          )}
          <label className={styles.field}>
            <span>{r.dueOffsetMinutes}</span>
            <DurationInput
              valueMinutes={value.dueOffsetMinutes}
              placeholder="∞"
              onChange={(minutes) => onChange({ dueOffsetMinutes: minutes })}
            />
          </label>
        </>
      )}
    </div>
  );
}

// ───────────────────────── live instances ─────────────────────────

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
  const instances = data?.instances ?? [];

  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [allError, setAllError] = useState<string | null>(null);

  const assigneeLabel = (instance: AdminTaskInstanceRowDto): string => {
    if (instance.assignments.length === 0) return t.unassigned;
    // Multi-worker-tasks (Phase 4): join every active slot's holder — for an
    // `EXACTLY(1)` instance this is exactly the previous single-name label.
    return instance.assignments
      .map((assignment) =>
        interpolate(t.assignedTo, {
          name: assignment.member.displayName,
          kind: t.kindLabels[assignment.kind],
        }),
      )
      .join(', ');
  };

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
          >
            {t.cancelAllButton}
          </Button>
          <ul className={styles.checkboxList}>
            {instances.map((instance) => (
              <li key={instance.id} className={styles.instanceRow}>
                <Link to={`/aufgaben/${instance.id}`}>
                  <span>{de.task.status[instance.status]}</span>
                  <span>{formatNumber(instance.currentValue)}</span>
                  {instance.workerCount > 1 && (
                    <span>
                      {interpolate(de.task.slotsOccupied, {
                        occupied: instance.activeSlotCount,
                        total: instance.workerCount,
                      })}
                    </span>
                  )}
                  <span>{assigneeLabel(instance)}</span>
                </Link>
                {rowErrors[instance.id] && (
                  <div className={styles.message} role="alert">
                    {rowErrors[instance.id]}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleCancel(instance.id)}
                  loading={cancellingId === instance.id}
                >
                  {t.cancelButton}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TaskDefinitionForm({
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

      <RecurrenceFields value={draft.recurrence} onChange={updateRecurrence} />

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

// ───────────────────────── eligibility sheet ─────────────────────────

interface EligibilityDraft {
  included: string[];
  excluded: string[];
  /** Intake "task-role-based-eligibility-and-preferred-assignee" — soft, so
   * kept independent of included/excluded rather than sharing their toggle. */
  preferred: string[];
}

function eligibilityDraftFromDefinition(def: AdminTaskDefinitionDto): EligibilityDraft {
  return {
    included: def.eligibility.filter((e) => e.mode === 'INCLUDED').map((e) => e.memberId),
    excluded: def.eligibility.filter((e) => e.mode === 'EXCLUDED').map((e) => e.memberId),
    preferred: def.preferredAssignees.map((p) => p.memberId),
  };
}

function EligibilityForm({
  definition,
  members,
  onClose,
}: {
  definition: AdminTaskDefinitionDto;
  members: AdminMemberDto[];
  onClose: () => void;
}) {
  const { de } = useStrings();
  const updateEligibility = useUpdateTaskEligibility();
  const [draft, setDraft] = useState<EligibilityDraft>(() =>
    eligibilityDraftFromDefinition(definition),
  );
  const [error, setError] = useState<string | null>(null);

  const toggleIncluded = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      included: prev.included.includes(id)
        ? prev.included.filter((m) => m !== id)
        : [...prev.included, id],
      excluded: prev.excluded.filter((m) => m !== id),
    }));
  };

  const toggleExcluded = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      excluded: prev.excluded.includes(id)
        ? prev.excluded.filter((m) => m !== id)
        : [...prev.excluded, id],
      included: prev.included.filter((m) => m !== id),
    }));
  };

  // Independent of included/excluded — a preference is soft and never
  // exclusive with a hard rule (see EligibilityDraft's comment).
  const togglePreferred = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      preferred: prev.preferred.includes(id)
        ? prev.preferred.filter((m) => m !== id)
        : [...prev.preferred, id],
    }));
  };

  const handleSubmit = () => {
    setError(null);
    updateEligibility.mutate(
      { id: definition.id, body: draft },
      { onSuccess: onClose, onError: (err) => setError(taskDefinitionErrorMessage(err, de)) },
    );
  };

  return (
    <div className={styles.restrictionsForm}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityHint}</p>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityIncluded}</h3>
        {members.length === 0 ? (
          <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityIncludedEmpty}</p>
        ) : (
          <div className={styles.checkboxList}>
            {members.map((member) => (
              <label key={member.id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.included.includes(member.id)}
                  onChange={() => toggleIncluded(member.id)}
                />
                <span>{member.displayName}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityExcluded}</h3>
        <div className={styles.checkboxList}>
          {members.map((member) => (
            <label key={member.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.excluded.includes(member.id)}
                onChange={() => toggleExcluded(member.id)}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityPreferred}</h3>
        <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityPreferredHint}</p>
        <div className={styles.checkboxList}>
          {members.map((member) => (
            <label key={member.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.preferred.includes(member.id)}
                onChange={() => togglePreferred(member.id)}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={handleSubmit} loading={updateEligibility.isPending}>
          {de.admin.taskDefinitions.saveEligibility}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {de.admin.taskDefinitions.cancel}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── section ─────────────────────────

export function TaskDefinitionsSection() {
  const { de } = useStrings();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading } = useAdminTaskDefinitions(includeArchived);
  const { data: categoriesData } = useAdminCategories();
  const { data: membersData } = useAdminMembers();
  const archiveDefinition = useArchiveTaskDefinition();
  const materializeDefinition = useMaterializeTaskDefinition();
  const reactivateDefinition = useReactivateTaskDefinition();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eligibilityForId, setEligibilityForId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [materializingId, setMaterializingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const definitions = data?.items ?? [];
  const categories = categoriesData?.items ?? [];
  const members = (membersData?.items ?? []).filter((m) => m.isActive);
  const editing = definitions.find((d) => d.id === editingId) ?? null;
  const eligibilityFor = definitions.find((d) => d.id === eligibilityForId) ?? null;

  const query = filter.trim().toLowerCase();
  const filteredDefinitions =
    query === ''
      ? definitions
      : definitions.filter(
          (definition) =>
            definition.title.toLowerCase().includes(query) ||
            (definition.category?.name.toLowerCase().includes(query) ?? false),
        );

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };

  const handleArchive = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setArchivingId(definition.id);
    archiveDefinition.mutate(definition.id, {
      onSuccess: () => {
        setArchivingId(null);
        setMessage(de.admin.taskDefinitions.archivedSuccess);
      },
      onError: (err) => {
        setArchivingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  const handleMaterialize = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setMaterializingId(definition.id);
    materializeDefinition.mutate(definition.id, {
      onSuccess: () => {
        setMaterializingId(null);
        setMessage(de.admin.taskDefinitions.materializedSuccess);
      },
      onError: (err) => {
        setMaterializingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  const handleReactivate = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setReactivatingId(definition.id);
    reactivateDefinition.mutate(definition.id, {
      onSuccess: () => {
        setReactivatingId(null);
        setMessage(de.admin.taskDefinitions.reactivatedSuccess);
      },
      onError: (err) => {
        setReactivatingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.taskDefinitions}</h2>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <label className={styles.field}>
        <span className="visually-hidden">{de.admin.taskDefinitions.filterLabel}</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={de.admin.taskDefinitions.filterPlaceholder}
        />
      </label>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <span>{de.admin.taskDefinitions.includeArchived}</span>
      </label>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : definitions.length === 0 ? (
        <p className={styles.hint}>{de.admin.taskDefinitions.empty}</p>
      ) : filteredDefinitions.length === 0 ? (
        <p className={styles.hint}>{de.admin.taskDefinitions.filterEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {filteredDefinitions.map((definition) => (
            <TaskMaintenanceCard
              key={definition.id}
              definition={definition}
              error={rowErrors[definition.id] ?? null}
              archiving={archivingId === definition.id}
              materializing={materializingId === definition.id}
              reactivating={reactivatingId === definition.id}
              onEdit={() => openEdit(definition.id)}
              onEligibility={() => setEligibilityForId(definition.id)}
              onArchive={() => handleArchive(definition)}
              onMaterialize={() => handleMaterialize(definition)}
              onReactivate={() => handleReactivate(definition)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={openCreate}
        aria-label={de.admin.taskDefinitions.addButton}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      <Sheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? de.admin.taskDefinitions.editTitle : de.admin.taskDefinitions.addTitle}
      >
        <TaskDefinitionForm
          initial={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setMessage(
              editing ? de.admin.taskDefinitions.saved : de.admin.taskDefinitions.createSuccess,
            );
          }}
        />
      </Sheet>

      <Sheet
        open={eligibilityFor !== null}
        onOpenChange={(open) => !open && setEligibilityForId(null)}
        title={
          eligibilityFor
            ? interpolate(de.admin.taskDefinitions.eligibilityTitle, { title: eligibilityFor.title })
            : de.admin.taskDefinitions.eligibilityButton
        }
      >
        {eligibilityFor && (
          <EligibilityForm
            definition={eligibilityFor}
            members={members}
            onClose={() => setEligibilityForId(null)}
          />
        )}
      </Sheet>
    </section>
  );
}
