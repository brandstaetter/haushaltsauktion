/**
 * A duration field that stores/emits minutes — matching every backend field's
 * unit — while letting the admin type in whichever unit is convenient. Every
 * raw `<input type="number">` for a minutes count in the admin UI used to
 * force "2 days" to be typed as `2880`; this replaces that arithmetic.
 *
 * The unit selector is local UI state, seeded once from the incoming value
 * (§28-style "best fit" heuristic — an existing `720` opens as `12` +
 * "Stunden", not `720` + "Minuten") and never resynced afterward, so picking
 * a unit does not fight the value the admin is actively typing into.
 */

import { useState } from 'react';

import { useStrings } from '../../context/StringsContext';
import styles from './DurationInput.module.css';

export type DurationUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export const MINUTES_PER_UNIT: Record<DurationUnit, number> = {
  MINUTES: 1,
  HOURS: 60,
  DAYS: 60 * 24,
};

/** The coarsest unit that still shows the value as a whole number. */
export function bestUnitFor(minutes: number | null): DurationUnit {
  if (minutes === null || minutes === 0) return 'MINUTES';
  if (minutes % MINUTES_PER_UNIT.DAYS === 0) return 'DAYS';
  if (minutes % MINUTES_PER_UNIT.HOURS === 0) return 'HOURS';
  return 'MINUTES';
}

export interface DurationInputProps {
  id?: string;
  valueMinutes: number | null;
  onChange: (minutes: number | null) => void;
  placeholder?: string;
}

export function DurationInput({ id, valueMinutes, onChange, placeholder }: DurationInputProps) {
  const { de } = useStrings();
  const [unit, setUnit] = useState<DurationUnit>(() => bestUnitFor(valueMinutes));

  const factor = MINUTES_PER_UNIT[unit];
  const displayValue = valueMinutes === null ? '' : valueMinutes / factor;

  return (
    <div className={styles.group}>
      {/* Every call site wraps this in `<label><span>Text</span>
          <DurationInput/></label>` with no explicit `htmlFor` — relying on
          implicit label association, which HTML only grants to the first
          labelable descendant. This input has to stay that first descendant
          (DOM order, independent of any visual order) or the wrapping
          label's text silently detaches from it — `getByLabel('Angebotsdauer')`
          and friends start finding nothing. */}
      <input
        id={id}
        type="number"
        min={0}
        step="any"
        value={displayValue}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          // Browsers let "0" + typed digit sit as "05" in the DOM, and the
          // controlled re-render below doesn't reliably overwrite it back to
          // "5" (React's number-input value diffing treats them as equal).
          // Strip the leading zero here so the field never shows it.
          const normalized = raw.replace(/^0+(?=\d)/, '');
          if (normalized !== raw) {
            e.target.value = normalized;
          }
          const parsed = parseFloat(normalized);
          onChange(Number.isFinite(parsed) ? Math.round(parsed * factor) : null);
        }}
      />
      <select
        aria-label={de.components.duration.unitLabel}
        value={unit}
        onChange={(e) => setUnit(e.target.value as DurationUnit)}
      >
        <option value="MINUTES">{de.components.duration.minutes}</option>
        <option value="HOURS">{de.components.duration.hours}</option>
        <option value="DAYS">{de.components.duration.days}</option>
      </select>
    </div>
  );
}
