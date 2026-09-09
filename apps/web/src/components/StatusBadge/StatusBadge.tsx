import cn from 'classnames';
import { TaskStatus } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: string;
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: styles.draft,
  [TaskStatus.AVAILABLE]: styles.available,
  [TaskStatus.ASSIGNED]: styles.assigned,
  [TaskStatus.COMPLETED]: styles.completed,
  [TaskStatus.CANCELLED]: styles.cancelled,
  [TaskStatus.PAUSED]: styles.paused,
  [TaskStatus.EXPIRED]: styles.expired,
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { de } = useStrings();
  const label =
    de.task.status[status as keyof typeof de.task.status] ?? status.toLowerCase();
  const statusClass = STATUS_CLASS[status as TaskStatus];
  return <span className={cn(styles.badge, statusClass)}>{label}</span>;
}
