import { useState } from 'react';
import { useHistory } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { formatDate } from '../../utils/format';
import styles from './HistoryPage.module.css';

export function HistoryPage() {
  const { de } = useStrings();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, refetch } = useHistory({ cursor });

  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;
  if (isError) {
    return (
      <div className={styles.center}>
        <p>{de.error.loadFailed}</p>
        <Button onClick={() => refetch()}>{de.action.retry}</Button>
      </div>
    );
  }

  const events = data?.items ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.history}</h1>
      {events.length === 0 ? (
        <p className={styles.empty}>{de.history.empty}</p>
      ) : (
        <ol className={styles.list} aria-live="polite">
          {events.map((event) => (
            <li key={event.id} className={styles.item}>
              <time dateTime={event.createdAt} className={styles.time}>
                {formatDate(event.createdAt)}
              </time>
              <p className={styles.summary}>{renderEvent(de, event)}</p>
            </li>
          ))}
        </ol>
      )}
      {data?.nextCursor && (
        <Button
          variant="secondary"
          onClick={() => setCursor(data.nextCursor ?? undefined)}
          loading={isLoading}
        >
          {de.action.loadMore}
        </Button>
      )}
    </div>
  );
}

function renderEvent(
  de: typeof import('../../strings/de').de,
  event: { type: string; taskTitle: string; member: { displayName: string } | null; payload: Record<string, unknown> },
): string {
  const member = event.member?.displayName ?? '—';
  const t = de.history.eventTypes[event.type as keyof typeof de.history.eventTypes];
  if (!t) return `${event.type}: ${event.taskTitle}`;
  return t
    .replace('{task}', event.taskTitle)
    .replace('{member}', member)
    .replace('{value}', String(event.payload.value ?? ''))
    .replace('{cost}', String(event.payload.cost ?? ''))
    .replace('{points}', String(event.payload.amount ?? ''))
    .replace('{n}', String(event.payload.candidateCount ?? event.payload.consideredCount ?? ''));
}
