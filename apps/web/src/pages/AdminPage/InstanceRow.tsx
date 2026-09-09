import { Link } from 'react-router';
import type { AdminTaskInstanceRowDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { ValueChip } from '../../components/ValueChip/ValueChip';
import { interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

/** One row of `LiveInstancesList` — link to the instance plus its own cancel
 * action, extracted so it can be reasoned about (and previewed in Storybook)
 * independently of the list/bulk-cancel machinery around it. */
export function InstanceRow({
  instance,
  baseValue,
  error,
  cancelling,
  unassigning,
  disabled,
  onCancel,
  onUnassign,
}: {
  instance: AdminTaskInstanceRowDto;
  /** The owning definition's base value — instances don't carry their own
   * (only `currentValue`, which drifts up per buyout), so the caller passes
   * it down from the definition it already has in scope. */
  baseValue: number;
  error: string | null;
  cancelling: boolean;
  unassigning: boolean;
  disabled: boolean;
  onCancel: () => void;
  onUnassign: () => void;
}) {
  const { de } = useStrings();
  const t = de.admin.taskDefinitions.instances;

  const assigneeLabel = (): string => {
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

  return (
    <li className={styles.instanceRow}>
      <Link to={`/aufgaben/${instance.id}`} className={styles.instanceLink}>
        <span className={styles.instanceStatus}>
          <StatusBadge status={instance.status} />
        </span>
        <span className={styles.instanceValue}>
          <ValueChip value={instance.currentValue} baseValue={baseValue} size="sm" />
        </span>
        {instance.workerCount > 1 && (
          <span className={styles.instanceSlots}>
            {interpolate(de.task.slotsOccupied, {
              occupied: instance.activeSlotCount,
              total: instance.workerCount,
            })}
          </span>
        )}
        <span className={styles.instanceAssignee}>{assigneeLabel()}</span>
      </Link>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <div className={styles.instanceActions}>
        {/* Only ever meaningful once a person actually holds the instance —
            AVAILABLE (no assignments yet) leaves nothing to release, so the
            button stays visible for layout stability but disabled instead of
            disappearing. */}
        <Button
          size="sm"
          variant="secondary"
          onClick={onUnassign}
          loading={unassigning}
          disabled={disabled || instance.assignments.length === 0}
        >
          {t.unassignButton}
        </Button>
        <Button size="sm" variant="danger" onClick={onCancel} loading={cancelling} disabled={disabled}>
          {t.cancelButton}
        </Button>
      </div>
    </li>
  );
}
