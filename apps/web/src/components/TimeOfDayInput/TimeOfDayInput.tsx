/**
 * A civil time-of-day picker. A native `<input type="time">`'s value is
 * exactly the `HH:mm` string the backend already stores and interprets
 * against the household's configured timezone (`next-occurrence.ts`'s
 * `civilToInstant`) — so this needs no format conversion, only the calendar
 * affordance a raw regex-validated text box never had.
 */

export interface TimeOfDayInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

export function TimeOfDayInput({ id, value, onChange }: TimeOfDayInputProps) {
  return <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />;
}
