import { useState } from 'react';
import { useHistory } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { formatDate, formatTime } from '../../utils/format';
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
              <div className={styles.meta}>
                <time dateTime={event.createdAt} className={styles.time}>
                  {formatDate(event.createdAt)}, {formatTime(event.createdAt)}
                </time>
                {event.pushNotified && (
                  <span
                    className={styles.pushIcon}
                    role="img"
                    aria-label={de.history.pushSentLabel}
                    title={de.history.pushSentLabel}
                  >
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M2 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Zm1.4.2 6.1 4.9a1 1 0 0 0 1 0l6.1-4.9-.5-.9H3.9l-.5.9ZM3 6.3V15h14V6.3l-6.1 4.9a2 2 0 0 1-2.6 0L3 6.3Z"
                      />
                    </svg>
                  </span>
                )}
              </div>
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

export function renderEvent(
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
    .replace('{to}', String(event.payload.to ?? ''))
    .replace('{cost}', String(event.payload.cost ?? ''))
    .replace('{points}', String(event.payload.amount ?? ''))
    .replace('{n}', String(event.payload.candidateCount ?? event.payload.consideredCount ?? ''));
}
