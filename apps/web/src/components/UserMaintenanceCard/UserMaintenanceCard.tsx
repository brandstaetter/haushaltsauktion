import type { MemberRole } from '@haushaltsauktion/shared';
import type { AdminMemberDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import { formatNumber } from '../../utils/format';
import { Button } from '../Button/Button';
import { ErrorBanner } from '../ErrorBanner/ErrorBanner';
import styles from './UserMaintenanceCard.module.css';

export interface UserDraft {
  role: MemberRole;
  isActive: boolean;
  maxRandomAssignmentsPerWeek: number | null;
}

export function draftFromMember(member: AdminMemberDto): UserDraft {
  return {
    role: member.role,
    isActive: member.isActive,
    maxRandomAssignmentsPerWeek: member.maxRandomAssignmentsPerWeek,
  };
}

export function sameDraft(a: UserDraft, b: UserDraft): boolean {
  return (
    a.role === b.role &&
    a.isActive === b.isActive &&
    a.maxRandomAssignmentsPerWeek === b.maxRandomAssignmentsPerWeek
  );
}

interface UserMaintenanceCardProps {
  member: AdminMemberDto;
  draft: UserDraft;
  error: string | null;
  saving: boolean;
  onChange: (patch: Partial<UserDraft>) => void;
  onSave: () => void;
  onOpenRestrictions: () => void;
  onOpenResetPassword: () => void;
  onOpenAdjustPoints: () => void;
}

/**
 * Editable member row used on `/verwaltung/benutzer` (§17 admin config):
 * role, active flag, and weekly random-assignment cap are edited inline;
 * restrictions (category/task exclusions, absences) and password reset
 * open their own sheets rather than living in this card.
 */
export function UserMaintenanceCard({
  member,
  draft,
  error,
  saving,
  onChange,
  onSave,
  onOpenRestrictions,
  onOpenResetPassword,
  onOpenAdjustPoints,
}: UserMaintenanceCardProps) {
  const { de } = useStrings();
  const dirty = !sameDraft(draft, draftFromMember(member));

  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <span className={styles.name}>{member.displayName}</span>
        <span className={styles.hint}>{member.user.email}</span>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className={styles.fields}>
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
          <span className={`${styles.fieldBox} ${styles.activeBox}`}>
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
          <span
            className={`${styles.fieldBox} ${styles.readonlyBox}`}
            title={de.admin.members.balanceReadonlyHint}
          >
            {formatNumber(member.pointsCache)}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty}>
          {de.admin.members.save}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenRestrictions}>
          {de.admin.members.restrictionsButton}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenResetPassword}>
          {de.admin.members.resetPasswordButton}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenAdjustPoints}>
          {de.admin.members.adjustPointsButton}
        </Button>
      </div>
    </li>
  );
}
