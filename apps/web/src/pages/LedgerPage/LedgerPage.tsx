import { useState } from 'react';
import { usePointTransactions } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { LedgerRow } from '../../components/LedgerRow/LedgerRow';
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
            <LedgerRow key={row.id} transaction={row} />
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
