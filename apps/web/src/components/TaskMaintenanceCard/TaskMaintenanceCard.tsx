import type { AdminTaskDefinitionDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { interpolate } from '../../utils/format';
import { Button } from '../Button/Button';
import { CategoryBadge } from '../CategoryBadge/CategoryBadge';
import { ErrorBanner } from '../ErrorBanner/ErrorBanner';
import { ValueChip } from '../ValueChip/ValueChip';
import styles from './TaskMaintenanceCard.module.css';

export function recurrenceSummary(
  def: Pick<
    AdminTaskDefinitionDto,
    'recurrenceType' | 'recurrenceInterval' | 'recurrenceWeekdays' | 'recurrenceDayOfMonth'
  >,
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

interface TaskMaintenanceCardProps {
  definition: AdminTaskDefinitionDto;
  error: string | null;
  archiving: boolean;
  materializing: boolean;
  reactivating: boolean;
  onEdit: () => void;
  onEligibility: () => void;
  onArchive: () => void;
  onMaterialize: () => void;
  onReactivate: () => void;
}

/**
 * Read-only summary + maintenance actions for one task definition, used on
 * `/verwaltung/aufgaben` (§17 admin config). Editing itself happens in the
 * sheet opened by "Bearbeiten" — this card has no editable fields.
 */
export function TaskMaintenanceCard({
  definition,
  error,
  archiving,
  materializing,
  reactivating,
  onEdit,
  onEligibility,
  onArchive,
  onMaterialize,
  onReactivate,
}: TaskMaintenanceCardProps) {
  const { de } = useStrings();
  const archived = definition.archivedAt !== null;

  return (
    <li className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={archived ? `${styles.name} ${styles.nameArchived}` : styles.name}>
            {definition.title}
          </span>
          {archived && (
            <span className={styles.archivedBadge}>{de.admin.taskDefinitions.archivedBadge}</span>
          )}
        </div>
        <span className={styles.hint}>
          {definition.category ? (
            <CategoryBadge name={definition.category.name} colorHex={definition.category.colorHex} />
          ) : (
            de.admin.taskDefinitions.noCategory
          )}
        </span>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className={styles.fields}>
        <div className={styles.baseValueCell}>
          <ValueChip value={definition.baseValue} baseValue={definition.baseValue} size="sm" showBase={false} />
        </div>
        <div className={styles.field}>
          <span>{de.admin.taskDefinitions.recurrence.title}</span>
          <span>{recurrenceSummary(definition, de)}</span>
        </div>
        <div className={`${styles.field} ${styles.buyoutField}`}>
          <span>{de.admin.taskDefinitions.buyoutEnabled}</span>
          <span>{definition.buyoutEnabled ? '✓' : '–'}</span>
        </div>
        {/* Multi-worker-tasks (Phase 4): only shown for a task that wants more
            than one worker — an EXACTLY(1) task (today's default) renders
            identically to before this feature. */}
        {definition.workerCount > 1 && (
          <div className={styles.field}>
            <span>{de.admin.taskDefinitions.workerCountMode}</span>
            <span>
              {interpolate(de.admin.taskDefinitions.workerCountSummary, {
                mode: de.admin.taskDefinitions.workerCountModes[definition.workerCountMode],
                count: definition.workerCount,
              })}
            </span>
          </div>
        )}
        {/* Intake "task-role-based-eligibility-and-preferred-assignee" — pure
            opt-in, same as the block above: a definition without either field
            set renders identically to before this feature. */}
        {definition.requiredRole !== null && (
          <div className={styles.field}>
            <span>{de.admin.taskDefinitions.requiredRole}</span>
            <span>{de.admin.taskDefinitions.requiredRoleValues[definition.requiredRole]}</span>
          </div>
        )}
        {definition.minAdminSlots !== null && (
          <div className={styles.field}>
            <span>{de.admin.taskDefinitions.minAdminSlots}</span>
            <span>{definition.minAdminSlots}</span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {archived ? (
          <Button size="sm" variant="secondary" onClick={onReactivate} loading={reactivating}>
            {de.admin.taskDefinitions.reactivate}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={onEdit}>
              {de.admin.taskDefinitions.edit}
            </Button>
            <Button size="sm" variant="secondary" onClick={onEligibility}>
              {de.admin.taskDefinitions.eligibilityButton}
            </Button>
            <Button size="sm" variant="secondary" onClick={onMaterialize} loading={materializing}>
              {de.admin.taskDefinitions.materializeButton}
            </Button>
            <Button size="sm" variant="danger" onClick={onArchive} loading={archiving}>
              {de.admin.taskDefinitions.archive}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
