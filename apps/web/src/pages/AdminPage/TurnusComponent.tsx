import { RecurrenceType } from '@haushaltsauktion/shared';
import { useSession } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { DurationInput } from '../../components/DurationInput/DurationInput';
import { TimeOfDayInput } from '../../components/TimeOfDayInput/TimeOfDayInput';
import { interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

/** The "Turnus" (recurrence) slice of a task definition draft — owned here so
 * `TaskDefinitionForm` doesn't need to know this shape's internals. */
export interface TurnusDraft {
  type: RecurrenceType;
  interval: number | null;
  weekdays: number[];
  dayOfMonth: number | null;
  timeOfDay: string;
  dueOffsetMinutes: number | null;
}

export function TurnusComponent({
  value,
  onChange,
}: {
  value: TurnusDraft;
  onChange: (patch: Partial<TurnusDraft>) => void;
}) {
  const { de } = useStrings();
  const r = de.admin.taskDefinitions.recurrence;
  const { data: session } = useSession();

  const toggleWeekday = (day: number) => {
    onChange({
      weekdays: value.weekdays.includes(day)
        ? value.weekdays.filter((d) => d !== day)
        : [...value.weekdays, day].sort((a, b) => a - b),
    });
  };

  return (
    <div className={styles.restrictionsForm}>
      <h3 className={styles.sectionTitle}>{r.title}</h3>
      <label className={styles.field}>
        <span>{r.type}</span>
        <select
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as RecurrenceType })}
        >
          {Object.values(RecurrenceType).map((t) => (
            <option key={t} value={t}>
              {r.types[t]}
            </option>
          ))}
        </select>
      </label>

      {value.type === 'EVERY_N_DAYS' && (
        <label className={styles.field}>
          <span>{r.interval}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={value.interval ?? ''}
            onChange={(e) =>
              onChange({ interval: e.target.value === '' ? null : parseInt(e.target.value, 10) || 1 })
            }
          />
        </label>
      )}

      {(value.type === 'WEEKDAYS' || value.type === 'WEEKLY') && (
        <div>
          <span>{r.weekdays}</span>
          <div className={styles.checkboxList}>
            {r.weekdayLabels.map((label, index) => (
              <label key={label} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={value.weekdays.includes(index + 1)}
                  onChange={() => toggleWeekday(index + 1)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {value.type === 'MONTHLY' && (
        <label className={styles.field}>
          <span>{r.dayOfMonth}</span>
          <input
            type="number"
            min={1}
            max={28}
            value={value.dayOfMonth ?? ''}
            onChange={(e) =>
              onChange({
                dayOfMonth: e.target.value === '' ? null : parseInt(e.target.value, 10) || 1,
              })
            }
          />
        </label>
      )}

      {value.type !== 'MANUAL' && (
        <>
          <label className={styles.field}>
            <span>{r.timeOfDay}</span>
            <TimeOfDayInput value={value.timeOfDay} onChange={(v) => onChange({ timeOfDay: v })} />
          </label>
          {session?.household && (
            <p className={styles.hint}>
              {interpolate(de.components.timezoneNote, { timezone: session.household.timezone })}
            </p>
          )}
          <label className={styles.field}>
            <span>{r.dueOffsetMinutes}</span>
            <DurationInput
              valueMinutes={value.dueOffsetMinutes}
              placeholder="∞"
              onChange={(minutes) => onChange({ dueOffsetMinutes: minutes })}
            />
          </label>
        </>
      )}
    </div>
  );
}
