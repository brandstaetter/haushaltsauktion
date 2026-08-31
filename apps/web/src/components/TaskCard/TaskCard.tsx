import type { AvailableTaskDto } from '@haushaltsauktion/shared';
import { Clock } from 'lucide-react';
import { useStrings } from '../../context/StringsContext';
import { formatShortDate } from '../../utils/format';
import { Button } from '../Button/Button';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { ValueChip } from '../ValueChip/ValueChip';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: AvailableTaskDto;
  onAction?: (action: 'volunteer' | 'complete', task: AvailableTaskDto) => void;
  actionLabel?: string;
}

export function TaskCard({ task, onAction, actionLabel }: TaskCardProps) {
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
        {task.category && <span className={styles.category}>{task.category.name}</span>}
      </div>
      {task.status !== 'AVAILABLE' && <StatusBadge status={task.status} />}
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
            size="md"
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
