import { useStrings } from '../../context/StringsContext';
import { ValueChip } from '../ValueChip/ValueChip';
import styles from './PointsCard.module.css';

interface PointsCardProps {
  balance: number;
}

/** "Dein Punktestand" card (§19 Dashboard). No base value/buyout row to left-align against, so the chip is centered. */
export function PointsCard({ balance }: PointsCardProps) {
  const { de } = useStrings();

  return (
    <div className={styles.card}>
      <span className={styles.label}>{de.dashboard.balance}</span>
      <ValueChip value={balance} baseValue={balance} showBase={false} size="lg" />
    </div>
  );
}
