import { useState } from 'react';
import { RecurrenceType } from '@haushaltsauktion/shared';
import {
  useAdminCategories,
  useAdminMembers,
  useAdminTaskDefinitions,
  useArchiveTaskDefinition,
  useCreateTaskDefinition,
  useUpdateTaskDefinition,
  useUpdateTaskEligibility,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type {
  AdminMemberDto,
  AdminTaskDefinitionDto,
  CategoryDto,
  RecurrenceDto,
} from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
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

function recurrenceSummary(
  def: Pick<AdminTaskDefinitionDto, 'recurrenceType' | 'recurrenceInterval' | 'recurrenceWeekdays' | 'recurrenceDayOfMonth'>,
  de: Strings,
): string {
  const r = de.admin.taskDefinitions.recurrence;
  switch (def.recurrenceType) {
    case 'ONCE':
      return r.summary.ONCE;
    case 'DAILY':
      return r.summary.DAILY;
    case 'WEEKLY':
      return r.summary.WEEKLY;
    case 'MANUAL':
      return r.summary.MANUAL;
    case 'WEEKDAYS': {
      const days = def.recurrenceWeekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => r.weekdayLabels[d - 1] ?? String(d))
        .join(', ');
      return interpolate(r.summary.WEEKDAYS, { days: days || '–' });
    }
    case 'EVERY_N_DAYS':
      return interpolate(r.summary.EVERY_N_DAYS, { n: def.recurrenceInterval ?? '?' });
    case 'MONTHLY':
      return interpolate(r.summary.MONTHLY, { day: def.recurrenceDayOfMonth ?? '?' });
    default:
      return def.recurrenceType;
  }
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
  recurrence: RecurrenceDto;
} {
  const type = draft.recurrence.type;
  return {
    title: draft.title,
    description: draft.description.trim() === '' ? null : draft.description,
    categoryId: draft.categoryId,
    baseValue: draft.baseValue,
    estimatedMinutes: draft.estimatedMinutes,
    buyoutEnabled: draft.buyoutEnabled,
    isActive: draft.isActive,
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
            <input
              type="text"
              placeholder="HH:mm"
              pattern="^\d{2}:\d{2}$"
              value={value.timeOfDay}
              onChange={(e) => onChange({ timeOfDay: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>{r.dueOffsetMinutes}</span>
            <input
              type="number"
              min={0}
              value={value.dueOffsetMinutes ?? ''}
              placeholder="∞"
              onChange={(e) =>
                onChange({
                  dueOffsetMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </label>
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
        <input
          type="number"
          min={0}
          value={draft.estimatedMinutes ?? ''}
          placeholder="∞"
          onChange={(e) =>
            update({
              estimatedMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) || 0,
            })
          }
        />
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
}

function eligibilityDraftFromDefinition(def: AdminTaskDefinitionDto): EligibilityDraft {
  return {
    included: def.eligibility.filter((e) => e.mode === 'INCLUDED').map((e) => e.memberId),
    excluded: def.eligibility.filter((e) => e.mode === 'EXCLUDED').map((e) => e.memberId),
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
      included: prev.included.includes(id)
        ? prev.included.filter((m) => m !== id)
        : [...prev.included, id],
      excluded: prev.excluded.filter((m) => m !== id),
    }));
  };

  const toggleExcluded = (id: string) => {
    setDraft((prev) => ({
      excluded: prev.excluded.includes(id)
        ? prev.excluded.filter((m) => m !== id)
        : [...prev.excluded, id],
      included: prev.included.filter((m) => m !== id),
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

// ───────────────────────── definition row ─────────────────────────

function DefinitionRow({
  definition,
  error,
  archiving,
  onEdit,
  onEligibility,
  onArchive,
}: {
  definition: AdminTaskDefinitionDto;
  error: string | null;
  archiving: boolean;
  onEdit: () => void;
  onEligibility: () => void;
  onArchive: () => void;
}) {
  const { de } = useStrings();
  const archived = definition.archivedAt !== null;

  return (
    <li className={styles.memberRow}>
      <div className={styles.memberHeader}>
        <span className={styles.memberName}>{definition.title}</span>
        <span className={styles.hint}>
          {definition.category?.name ?? de.admin.taskDefinitions.noCategory}
          {archived && ` · ${de.admin.taskDefinitions.archivedBadge}`}
        </span>
      </div>

      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}

      <div className={styles.memberFields}>
        <div className={styles.field}>
          <span>{de.admin.taskDefinitions.baseValue}</span>
          <span>{formatNumber(definition.baseValue)}</span>
        </div>
        <div className={styles.field}>
          <span>{de.admin.taskDefinitions.recurrence.title}</span>
          <span>{recurrenceSummary(definition, de)}</span>
        </div>
        <div className={styles.field}>
          <span>{de.admin.taskDefinitions.buyoutEnabled}</span>
          <span>{definition.buyoutEnabled ? '✓' : '–'}</span>
        </div>
      </div>

      <div className={styles.rowActions}>
        <Button variant="secondary" onClick={onEdit}>
          {de.admin.taskDefinitions.edit}
        </Button>
        <Button variant="secondary" onClick={onEligibility}>
          {de.admin.taskDefinitions.eligibilityButton}
        </Button>
        {!archived && (
          <Button variant="danger" onClick={onArchive} loading={archiving}>
            {de.admin.taskDefinitions.archive}
          </Button>
        )}
      </div>
    </li>
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

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eligibilityForId, setEligibilityForId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const definitions = data?.items ?? [];
  const categories = categoriesData?.items ?? [];
  const members = (membersData?.items ?? []).filter((m) => m.isActive);
  const editing = definitions.find((d) => d.id === editingId) ?? null;
  const eligibilityFor = definitions.find((d) => d.id === eligibilityForId) ?? null;

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

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.taskDefinitions}</h2>

      {message && (
        <div className={styles.message} role="status">
          {message}
        </div>
      )}

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
      ) : (
        <ul className={styles.list}>
          {definitions.map((definition) => (
            <DefinitionRow
              key={definition.id}
              definition={definition}
              error={rowErrors[definition.id] ?? null}
              archiving={archivingId === definition.id}
              onEdit={() => openEdit(definition.id)}
              onEligibility={() => setEligibilityForId(definition.id)}
              onArchive={() => handleArchive(definition)}
            />
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={openCreate}>
        {de.admin.taskDefinitions.addButton}
      </Button>

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
