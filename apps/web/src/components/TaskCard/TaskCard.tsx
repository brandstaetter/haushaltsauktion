import type { AvailableTaskDto, HouseholdTaskAssigneeDto } from '@haushaltsauktion/shared';
import { Clock } from 'lucide-react';
import { useStrings } from '../../context/StringsContext';
import { formatShortDate, interpolate } from '../../utils/format';
import { Button } from '../Button/Button';
import { CategoryBadge } from '../CategoryBadge/CategoryBadge';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { ValueChip } from '../ValueChip/ValueChip';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: AvailableTaskDto;
  onAction?: (action: 'volunteer' | 'complete', task: AvailableTaskDto) => void;
  actionLabel?: string;
  /**
   * Who currently holds the task — additive/opt-in only (the household-wide
   * "Alle Aufgaben" tab passes it; every other caller omits it, so this
   * component's default rendering is unchanged). `null` for an `AVAILABLE`
   * task (nothing to show), an object for `ASSIGNED`.
   */
  assignee?: HouseholdTaskAssigneeDto | null;
}

export function TaskCard({ task, onAction, actionLabel, assignee }: TaskCardProps) {
  const { de } = useStrings();

  const meta: string[] = [];
  if (task.dueAt) {
    meta.push(formatDue(de, task.dueAt, task.isOverdue));
  }
  if (task.estimatedMinutes) {
    meta.push(
      de.task.estimatedMinutes.replace('{minutes}', String(task.estimatedMinutes)),
    );
  }

  const isHeld = task.status === 'ASSIGNED';
  const ctaLabel = actionLabel ?? (isHeld ? de.action.complete : de.action.volunteer);

  return (
    <article className={styles.card} aria-labelledby={`task-${task.id}-title`}>
      <div className={styles.header}>
        <h3 id={`task-${task.id}-title`} className={styles.title}>
          {task.title}
        </h3>
        {task.category && (
          <CategoryBadge name={task.category.name} colorHex={task.category.colorHex} />
        )}
      </div>
      {task.status !== 'AVAILABLE' && <StatusBadge status={task.status} />}
      {assignee && (
        <p className={styles.assignee}>
          {interpolate(de.task.assignedTo, { name: assignee.displayName })}
          {' · '}
          {de.task.assignmentKind[assignee.kind]}
        </p>
      )}
      {meta.length > 0 && (
        <p className={styles.meta}>
          <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
          {meta.join(' · ')}
        </p>
      )}
      <div className={styles.row}>
        <ValueChip
          value={task.currentValue}
          baseValue={task.baseValue}
          buyoutCount={task.buyoutCount}
          size="md"
        />
        {onAction && (
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              onAction(isHeld ? 'complete' : 'volunteer', task)
            }
            disabled={!isHeld && !task.canVolunteer}
          >
            {ctaLabel}
          </Button>
        )}
      </div>
    </article>
  );
}

function formatDue(de: typeof import('../../strings/de').de, iso: string, overdue: boolean): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (isToday) return overdue ? de.task.dueSince.replace('{when}', 'heute') : de.task.dueToday;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return de.task.dueTomorrow;
  return de.task.due.replace('{when}', formatShortDate(iso));
}
