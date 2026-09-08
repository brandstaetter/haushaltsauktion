import type { PointTransactionDto } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import { formatDate, formatTime, signedNumber } from '../../utils/format';
import { ValueChip } from '../ValueChip/ValueChip';
import styles from './LedgerRow.module.css';

interface LedgerRowProps {
  transaction: PointTransactionDto;
}

export function LedgerRow({ transaction }: LedgerRowProps) {
  const { de } = useStrings();

  return (
    <li className={styles.row}>
      <div className={styles.heading}>
        <span className={styles.type}>
          {de.ledger.type[transaction.type as keyof typeof de.ledger.type] ?? transaction.type}
        </span>
        <time dateTime={transaction.createdAt} className={styles.time}>
          {formatDate(transaction.createdAt)}, {formatTime(transaction.createdAt)}
        </time>
      </div>
      {transaction.taskInstanceTitle && (
        <p className={styles.task}>{transaction.taskInstanceTitle}</p>
      )}
      <div className={styles.numbers}>
        <span className={transaction.amount >= 0 ? styles.positive : styles.negative}>
          {signedNumber(transaction.amount)}
        </span>
        <ValueChip
          value={transaction.balanceAfter}
          baseValue={transaction.balanceAfter}
          showBase={false}
          size="sm"
        />
      </div>
    </li>
  );
}
