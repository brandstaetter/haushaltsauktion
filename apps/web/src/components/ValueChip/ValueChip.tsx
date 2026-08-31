import cn from 'classnames';
import { useStrings } from '../../context/StringsContext';
import { formatNumber } from '../../utils/format';
import styles from './ValueChip.module.css';

interface ValueChipProps {
  value: number;
  baseValue: number;
  buyoutCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showBase?: boolean;
}

export function ValueChip({
  value,
  baseValue,
  buyoutCount = 0,
  size = 'md',
  showBase = true,
}: ValueChipProps) {
  const { de } = useStrings();
  const tier = Math.min(buyoutCount, 3) as 0 | 1 | 2 | 3;
  const label = de.task.currentValue;
  const ariaLabel = `${label} ${formatNumber(value)} Punkte, ${interpolateBase(de.task.baseValue, baseValue)}, ${buyoutLabel(buyoutCount)}`;

  return (
    <div
      className={cn(styles.chip, styles[`tier${tier}`], styles[size])}
      aria-label={ariaLabel}
      role="img"
    >
      <span className={cn(styles.value, 'numeric')} aria-hidden="true">
        {formatNumber(value)}
      </span>
      {showBase && (
        <span className={styles.meta} aria-hidden="true">
          {interpolateBase(de.task.baseValue, baseValue)}
          {buyoutCount > 0 && ` · ${interpolateBuyout(de.task.buyoutCount, buyoutCount)}`}
        </span>
      )}
    </div>
  );
}

function interpolateBase(template: string, value: number) {
  return template.replace('{value}', formatNumber(value));
}

function interpolateBuyout(template: string, count: number) {
  return template.replace('{count}', String(count));
}

function buyoutLabel(count: number): string {
  if (count === 0) return 'noch nie freigekauft';
  if (count === 1) return 'einmal freigekauft';
  return `${count} mal freigekauft`;
}
