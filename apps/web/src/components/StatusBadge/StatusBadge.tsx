import { useStrings } from '../../context/StringsContext';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { de } = useStrings();
  const label =
    de.task.status[status as keyof typeof de.task.status] ?? status.toLowerCase();
  return <span className={styles.badge}>{label}</span>;
}
