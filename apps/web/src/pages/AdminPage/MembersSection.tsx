import { useState } from 'react';
import cn from 'classnames';
import { Ban, KeyRound, Plus, Save } from 'lucide-react';
import type { MemberRole } from '@haushaltsauktion/shared';
import {
  useAdminCategories,
  useAdminMembers,
  useCreateMember,
  useResetMemberPassword,
  useTaskDefinitionLabels,
  useUpdateMember,
  useUpdateMemberRestrictions,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { AdminMemberDto, CategoryDto, TaskDefinitionSummaryDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Toast } from '../../components/Toast/Toast';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

/**
 * Maps a mutation's rejection onto a readable German message (§31 — no raw
 * error objects surfaced). `CATEGORY_IN_USE` here is `POST /admin/members`'s
 * pre-existing (not this phase's) code for "already a member of this
 * household" — a known, out-of-scope quirk in the backend's error vocabulary
 * that this UI works around rather than fixes.
 */
function memberErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { status?: number; code?: string; message?: string };
  if (apiErr.code === 'CATEGORY_IN_USE') return de.admin.members.errors.alreadyMember;
  if (apiErr.code === 'LAST_ADMIN') return de.admin.members.errors.lastAdmin;
  if (apiErr.code === 'VALIDATION_FAILED') return de.admin.members.errors.invalidAbsenceRange;
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.members.errors.generic;
}

// ───────────────────────── restrictions sheet ─────────────────────────

interface RestrictionsDraft {
  excludedCategoryIds: string[];
  excludedTaskIds: string[];
  absences: { startsAt: string; endsAt: string; reason: string }[];
}

function draftFromMember(member: AdminMemberDto): RestrictionsDraft {
  return {
    excludedCategoryIds: member.categoryExclusions.map((c) => c.categoryId),
    excludedTaskIds: member.taskEligibility
      .filter((t) => t.mode === 'EXCLUDED')
      .map((t) => t.taskDefinitionId),
    absences: member.absences.map((a) => ({
      startsAt: a.startsAt.slice(0, 10),
      endsAt: a.endsAt.slice(0, 10),
      reason: a.reason ?? '',
    })),
  };
}

function RestrictionsForm({
  member,
  categories,
  taskLabels,
  onClose,
}: {
  member: AdminMemberDto;
  categories: CategoryDto[];
  taskLabels: TaskDefinitionSummaryDto[];
  onClose: () => void;
}) {
  const { de } = useStrings();
  const updateRestrictions = useUpdateMemberRestrictions();
  const [draft, setDraft] = useState<RestrictionsDraft>(() => draftFromMember(member));
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      excludedCategoryIds: prev.excludedCategoryIds.includes(id)
        ? prev.excludedCategoryIds.filter((c) => c !== id)
        : [...prev.excludedCategoryIds, id],
    }));
  };

  const toggleTask = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      excludedTaskIds: prev.excludedTaskIds.includes(id)
        ? prev.excludedTaskIds.filter((t) => t !== id)
        : [...prev.excludedTaskIds, id],
    }));
  };

  const addAbsence = () => {
    setDraft((prev) => ({
      ...prev,
      absences: [...prev.absences, { startsAt: '', endsAt: '', reason: '' }],
    }));
  };

  const removeAbsence = (index: number) => {
    setDraft((prev) => ({ ...prev, absences: prev.absences.filter((_, i) => i !== index) }));
  };

  const updateAbsence = (
    index: number,
    patch: Partial<RestrictionsDraft['absences'][number]>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      absences: prev.absences.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  };

  const handleSubmit = () => {
    setError(null);
    for (const absence of draft.absences) {
      if (!absence.startsAt || !absence.endsAt || absence.endsAt <= absence.startsAt) {
        setError(de.admin.members.errors.invalidAbsenceRange);
        return;
      }
    }
    updateRestrictions.mutate(
      {
        id: member.id,
        body: {
          excludedCategoryIds: draft.excludedCategoryIds,
          excludedTaskDefinitionIds: draft.excludedTaskIds,
          absences: draft.absences.map((a) => ({
            startsAt: a.startsAt,
            endsAt: a.endsAt,
            reason: a.reason.trim() === '' ? null : a.reason.trim(),
          })),
        },
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(memberErrorMessage(err, de)),
      },
    );
  };

  return (
    <div className={styles.restrictionsForm}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.members.excludedCategories}</h3>
        {categories.length === 0 ? (
          <p className={styles.hint}>{de.admin.members.excludedCategoriesEmpty}</p>
        ) : (
          <div className={styles.checkboxList}>
            {categories.map((category) => (
              <label key={category.id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.excludedCategoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.members.excludedTasks}</h3>
        {taskLabels.length === 0 ? (
          <p className={styles.hint}>{de.admin.members.excludedTasksEmpty}</p>
        ) : (
          <div className={styles.checkboxList}>
            {taskLabels.map((task) => (
              <label key={task.id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.excludedTaskIds.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                />
                <span>{task.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.members.absences}</h3>
        {draft.absences.map((absence, index) => (
          <div key={index} className={styles.absenceRow}>
            <label className={styles.field}>
              <span>{de.admin.members.absenceStart}</span>
              <input
                type="date"
                value={absence.startsAt}
                onChange={(e) => updateAbsence(index, { startsAt: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>{de.admin.members.absenceEnd}</span>
              <input
                type="date"
                value={absence.endsAt}
                onChange={(e) => updateAbsence(index, { endsAt: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>{de.admin.members.absenceReason}</span>
              <input
                type="text"
                value={absence.reason}
                onChange={(e) => updateAbsence(index, { reason: e.target.value })}
              />
            </label>
            <Button variant="danger" onClick={() => removeAbsence(index)}>
              {de.admin.members.removeAbsence}
            </Button>
          </div>
        ))}
        <Button variant="secondary" onClick={addAbsence}>
          {de.admin.members.addAbsence}
        </Button>
      </div>

      <div className={styles.actions}>
        <Button onClick={handleSubmit} loading={updateRestrictions.isPending}>
          {de.admin.members.saveRestrictions}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {de.admin.members.cancel}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── temporary password reveal ─────────────────────────

function TemporaryPasswordNotice({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  const { de } = useStrings();
  return (
    <div className={styles.restrictionsForm}>
      <p className={styles.hint}>{de.admin.members.temporaryPasswordHint}</p>
      <p className={styles.temporaryPassword}>{password}</p>
      <div className={styles.actions}>
        <Button onClick={onClose}>{de.admin.members.temporaryPasswordClose}</Button>
      </div>
    </div>
  );
}

// ───────────────────────── reset-password sheet ─────────────────────────

function ResetPasswordForm({
  member,
  onClose,
  onDone,
}: {
  member: AdminMemberDto;
  onClose: () => void;
  onDone: (temporaryPassword: string) => void;
}) {
  const { de } = useStrings();
  const resetPassword = useResetMemberPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    resetPassword.mutate(
      { id: member.id, ...(password.trim() === '' ? {} : { password }) },
      {
        onSuccess: (result) => onDone(result.temporaryPassword),
        onError: (err) => setError(memberErrorMessage(err, de)),
      },
    );
  };

  return (
    <form className={styles.restrictionsForm} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <label className={styles.field}>
        <span>{de.admin.members.resetPasswordNewPassword}</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className={styles.hint}>{de.admin.members.resetPasswordHint}</span>
      </label>
      <div className={styles.actions}>
        <Button type="submit" loading={resetPassword.isPending}>
          {de.admin.members.resetPasswordConfirm}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.admin.members.cancel}
        </Button>
      </div>
    </form>
  );
}

// ───────────────────────── member row ─────────────────────────

interface MemberDraft {
  role: MemberRole;
  isActive: boolean;
  maxRandomAssignmentsPerWeek: number | null;
}

function draftFromRow(member: AdminMemberDto): MemberDraft {
  return {
    role: member.role,
    isActive: member.isActive,
    maxRandomAssignmentsPerWeek: member.maxRandomAssignmentsPerWeek,
  };
}

function sameDraft(a: MemberDraft, b: MemberDraft): boolean {
  return (
    a.role === b.role &&
    a.isActive === b.isActive &&
    a.maxRandomAssignmentsPerWeek === b.maxRandomAssignmentsPerWeek
  );
}

function MemberRow({
  member,
  draft,
  error,
  saving,
  onChange,
  onSave,
  onOpenRestrictions,
  onOpenResetPassword,
}: {
  member: AdminMemberDto;
  draft: MemberDraft;
  error: string | null;
  saving: boolean;
  onChange: (patch: Partial<MemberDraft>) => void;
  onSave: () => void;
  onOpenRestrictions: () => void;
  onOpenResetPassword: () => void;
}) {
  const { de } = useStrings();
  const dirty = !sameDraft(draft, draftFromRow(member));

  return (
    <li className={styles.memberRow}>
      <div className={styles.memberHeader}>
        <span className={styles.memberName}>{member.displayName}</span>
        <span className={styles.hint}>{member.user.email}</span>
      </div>

      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}

      <div className={styles.memberFields}>
        <label className={styles.field}>
          <span>{de.admin.members.role}</span>
          <select
            value={draft.role}
            onChange={(e) => onChange({ role: e.target.value as MemberRole })}
          >
            <option value="MEMBER">{de.admin.members.roleValues.MEMBER}</option>
            <option value="ADMIN">{de.admin.members.roleValues.ADMIN}</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>{de.admin.members.active}</span>
          <span className={cn(styles.memberFieldBox, styles.memberActiveBox)}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => onChange({ isActive: e.target.checked })}
            />
          </span>
        </label>
        <label className={styles.field}>
          <span>{de.admin.members.maxRandomAssignmentsPerWeek}</span>
          <input
            type="number"
            min={0}
            value={draft.maxRandomAssignmentsPerWeek ?? ''}
            placeholder="∞"
            onChange={(e) =>
              onChange({
                maxRandomAssignmentsPerWeek:
                  e.target.value === '' ? null : parseInt(e.target.value, 10) || 0,
              })
            }
          />
        </label>
        <div className={styles.field}>
          <span>{de.admin.members.balance}</span>
          <span className={styles.memberFieldBox}>{formatNumber(member.pointsCache)}</span>
        </div>
      </div>

      <div className={styles.rowActions}>
        <Button size="sm" icon={Save} onClick={onSave} loading={saving} disabled={!dirty}>
          {de.admin.members.save}
        </Button>
        <Button size="sm" icon={Ban} variant="secondary" onClick={onOpenRestrictions}>
          {de.admin.members.restrictionsButton}
        </Button>
        <Button size="sm" icon={KeyRound} variant="secondary" onClick={onOpenResetPassword}>
          {de.admin.members.resetPasswordButton}
        </Button>
      </div>
    </li>
  );
}

// ───────────────────────── add-member sheet ─────────────────────────

function AddMemberForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (temporaryPassword: string | null) => void;
}) {
  const { de } = useStrings();
  const createMember = useCreateMember();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<MemberRole>('MEMBER');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMember.mutate(
      {
        email,
        displayName,
        ...(password.trim() === '' ? {} : { password }),
        role,
      },
      {
        onSuccess: (result) => onCreated(result.temporaryPassword),
        onError: (err) => setError(memberErrorMessage(err, de)),
      },
    );
  };

  return (
    <form className={styles.restrictionsForm} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <label className={styles.field}>
        <span>{de.admin.members.email}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.members.displayName}</span>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.members.password}</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className={styles.hint}>{de.admin.members.passwordHint}</span>
      </label>
      <label className={styles.field}>
        <span>{de.admin.members.role}</span>
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          <option value="MEMBER">{de.admin.members.roleValues.MEMBER}</option>
          <option value="ADMIN">{de.admin.members.roleValues.ADMIN}</option>
        </select>
      </label>
      <div className={styles.actions}>
        <Button type="submit" loading={createMember.isPending}>
          {de.admin.members.create}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.admin.members.cancel}
        </Button>
      </div>
    </form>
  );
}

// ───────────────────────── section ─────────────────────────

export function MembersSection() {
  const { de } = useStrings();
  const { data, isLoading } = useAdminMembers();
  const { data: categoriesData } = useAdminCategories();
  const { data: taskLabelsData } = useTaskDefinitionLabels();
  const updateMember = useUpdateMember();

  const [addOpen, setAddOpen] = useState(false);
  const [restrictionsForId, setRestrictionsForId] = useState<string | null>(null);
  const [resetPasswordForId, setResetPasswordForId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const members = data?.items ?? [];
  const categories = categoriesData?.items ?? [];
  const taskLabels = taskLabelsData?.items ?? [];
  const restrictionsFor = members.find((m) => m.id === restrictionsForId) ?? null;
  const resetPasswordFor = members.find((m) => m.id === resetPasswordForId) ?? null;

  const query = filter.trim().toLowerCase();
  const filteredMembers =
    query === ''
      ? members
      : members.filter(
          (member) =>
            member.displayName.toLowerCase().includes(query) ||
            member.user.email.toLowerCase().includes(query),
        );

  const draftFor = (member: AdminMemberDto): MemberDraft => drafts[member.id] ?? draftFromRow(member);

  const handleChange = (member: AdminMemberDto, patch: Partial<MemberDraft>) => {
    setDrafts((prev) => ({ ...prev, [member.id]: { ...draftFor(member), ...patch } }));
  };

  const handleSave = (member: AdminMemberDto) => {
    const draft = draftFor(member);
    setRowErrors((prev) => ({ ...prev, [member.id]: null }));
    updateMember.mutate(
      { id: member.id, body: draft },
      {
        onSuccess: () => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[member.id];
            return next;
          });
        },
        onError: (err) =>
          setRowErrors((prev) => ({ ...prev, [member.id]: memberErrorMessage(err, de) })),
      },
    );
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.members}</h2>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <label className={styles.field}>
        <span className="visually-hidden">{de.admin.members.filterLabel}</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={de.admin.members.filterPlaceholder}
        />
      </label>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : members.length === 0 ? (
        <p className={styles.hint}>{de.admin.members.empty}</p>
      ) : filteredMembers.length === 0 ? (
        <p className={styles.hint}>{de.admin.members.filterEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {filteredMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              draft={draftFor(member)}
              error={rowErrors[member.id] ?? null}
              saving={updateMember.isPending && updateMember.variables?.id === member.id}
              onChange={(patch) => handleChange(member, patch)}
              onSave={() => handleSave(member)}
              onOpenRestrictions={() => setRestrictionsForId(member.id)}
              onOpenResetPassword={() => setResetPasswordForId(member.id)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={() => setAddOpen(true)}
        aria-label={de.admin.members.addButton}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      <Sheet open={addOpen} onOpenChange={setAddOpen} title={de.admin.members.addTitle}>
        <AddMemberForm
          onClose={() => setAddOpen(false)}
          onCreated={(newTemporaryPassword) => {
            setAddOpen(false);
            setMessage(de.admin.members.createSuccess);
            if (newTemporaryPassword) setTemporaryPassword(newTemporaryPassword);
          }}
        />
      </Sheet>

      <Sheet
        open={restrictionsFor !== null}
        onOpenChange={(open) => !open && setRestrictionsForId(null)}
        title={
          restrictionsFor
            ? interpolate(de.admin.members.restrictionsTitle, { name: restrictionsFor.displayName })
            : de.admin.members.restrictionsButton
        }
      >
        {restrictionsFor && (
          <RestrictionsForm
            member={restrictionsFor}
            categories={categories}
            taskLabels={taskLabels}
            onClose={() => setRestrictionsForId(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={resetPasswordFor !== null}
        onOpenChange={(open) => !open && setResetPasswordForId(null)}
        title={
          resetPasswordFor
            ? interpolate(de.admin.members.resetPasswordTitle, { name: resetPasswordFor.displayName })
            : de.admin.members.resetPasswordButton
        }
      >
        {resetPasswordFor && (
          <ResetPasswordForm
            member={resetPasswordFor}
            onClose={() => setResetPasswordForId(null)}
            onDone={(newTemporaryPassword) => {
              setResetPasswordForId(null);
              setMessage(de.admin.members.resetPasswordSuccess);
              setTemporaryPassword(newTemporaryPassword);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={temporaryPassword !== null}
        onOpenChange={(open) => !open && setTemporaryPassword(null)}
        title={de.admin.members.temporaryPasswordHeading}
      >
        {temporaryPassword && (
          <TemporaryPasswordNotice
            password={temporaryPassword}
            onClose={() => setTemporaryPassword(null)}
          />
        )}
      </Sheet>
    </section>
  );
}
