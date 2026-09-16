import cn from 'classnames';
import type { TaskValueGrowthDto } from '@haushaltsauktion/shared';
import { TrendingUp } from 'lucide-react';
import { useStrings } from '../../context/StringsContext';
import { formatNumber } from '../../utils/format';
import styles from './ValueChip.module.css';

interface ValueChipProps {
  value: number;
  baseValue: number;
  buyoutCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showBase?: boolean;
  /**
   * Intake "time-based-value-growth". When present, the chip says what makes
   * this number climb — §31 forbids a rule the member cannot see. `null` (the
   * default everywhere else) renders exactly the chip that existed before.
   */
  growth?: TaskValueGrowthDto | null;
}

export function ValueChip({
  value,
  baseValue,
  buyoutCount = 0,
  size = 'md',
  showBase = true,
  growth = null,
}: ValueChipProps) {
  const { de } = useStrings();
  const tier = Math.min(buyoutCount, 3) as 0 | 1 | 2 | 3;
  const label = de.task.currentValue;
  const growthText = growth === null ? null : growthLabel(de, growth);
  const ariaLabel =
    `${label} ${formatNumber(value)} Punkte, ${interpolateBase(de.task.baseValue, baseValue)}, ${buyoutLabel(buyoutCount)}` +
    (growthText === null ? '' : `, ${growthText}`);

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
      {growthText !== null && (
        <span className={styles.growth} aria-hidden="true">
          <TrendingUp size={12} strokeWidth={2} aria-hidden="true" />
          {growthText}
        </span>
      )}
    </div>
  );
}

/**
 * "steigt um 1 pro Stunde" / "... , max. 20". Rendered from the rate the
 * server sent with the card, never from a constant baked in here — an admin
 * changing the rate must change what members are told.
 */
function growthLabel(
  de: typeof import('../../strings/de').de,
  growth: TaskValueGrowthDto,
): string {
  const template =
    growth.maximumValue === null ? de.task.valueGrowth : de.task.valueGrowthCapped;
  return template
    .replace('{points}', formatNumber(growth.pointsPerInterval))
    .replace('{interval}', intervalLabel(de, growth.intervalMinutes))
    .replace('{max}', formatNumber(growth.maximumValue ?? 0));
}

function intervalLabel(de: typeof import('../../strings/de').de, minutes: number): string {
  if (minutes === 60) return de.task.valueGrowthHour;
  if (minutes % 60 === 0) return de.task.valueGrowthHours.replace('{count}', String(minutes / 60));
  return de.task.valueGrowthMinutes.replace('{count}', String(minutes));
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
