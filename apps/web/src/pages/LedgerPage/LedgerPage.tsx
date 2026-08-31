import { useState } from 'react';
import { usePointTransactions } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { formatDate, formatNumber, signedNumber } from '../../utils/format';
import styles from './LedgerPage.module.css';

export function LedgerPage() {
  const { de } = useStrings();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, refetch } = usePointTransactions(cursor);

  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;
  if (isError) {
    return (
      <div className={styles.center}>
        <p>{de.error.loadFailed}</p>
        <Button onClick={() => refetch()}>{de.action.retry}</Button>
      </div>
    );
  }

  const rows = data?.items ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.ledger.title}</h1>
      {rows.length === 0 ? (
        <p className={styles.empty}>{de.ledger.empty}</p>
      ) : (
        <ol className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <div className={styles.heading}>
                <span className={styles.type}>
                  {de.ledger.type[row.type as keyof typeof de.ledger.type] ?? row.type}
                </span>
                <time dateTime={row.createdAt} className={styles.time}>
                  {formatDate(row.createdAt)}
                </time>
              </div>
              {row.taskInstanceTitle && (
                <p className={styles.task}>{row.taskInstanceTitle}</p>
              )}
              <div className={styles.numbers}>
                <span className={row.amount >= 0 ? styles.positive : styles.negative}>
                  {signedNumber(row.amount)}
                </span>
                <span className={styles.balance}>{formatNumber(row.balanceAfter)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data?.nextCursor && (
        <Button variant="secondary" onClick={() => setCursor(data.nextCursor ?? undefined)}>
          {de.action.loadMore}
        </Button>
      )}
    </div>
  );
}
