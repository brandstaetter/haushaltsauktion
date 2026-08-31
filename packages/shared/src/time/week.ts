/**
 * ISO week boundaries in the household timezone (Architektur §5.6, OQ-6).
 *
 * `maximumBuyoutsPerWeek`, `maxRandomAssignmentsPerWeek` and the fairness
 * counters all need a definition of "diese Woche". A rolling seven-day window
 * was rejected: "du hast noch einen Freikauf diese Woche" is only
 * comprehensible if the week visibly resets, and a rolling window cannot state
 * when the limit lifts.
 *
 * Implemented on `Intl.DateTimeFormat`, which every supported runtime ships, so
 * the boundary needs no date library and behaves identically on client and
 * server. Pure: the instant is always a parameter.
 */

export interface CivilDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatterCache.set(timeZone, created);
  return created;
}

/** The calendar date `instant` falls on, as seen from `timeZone`. */
export function civilDateIn(instant: Date, timeZone: string): CivilDate {
  // 'en-CA' formats as YYYY-MM-DD, which needs no locale-specific parsing.
  const parts = formatterFor(timeZone).format(instant).split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Zeitzone ${timeZone} lieferte kein verwertbares Datum.`);
  }
  return { year, month, day };
}

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: CivilDate): number {
  const utc = Date.UTC(date.year, date.month - 1, date.day);
  const day = new Date(utc).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** ISO-8601 week number and week-numbering year for a civil date. */
export function isoWeekOf(date: CivilDate): { weekYear: number; week: number } {
  // Shift to the Thursday of this ISO week; that Thursday's calendar year is
  // the ISO week-numbering year, by definition.
  const utc = Date.UTC(date.year, date.month - 1, date.day);
  const thursday = new Date(utc);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoWeekday(date));

  const weekYear = thursday.getUTCFullYear();
  const jan4 = Date.UTC(weekYear, 0, 4);
  const jan4Weekday = isoWeekday({ year: weekYear, month: 1, day: 4 });
  const firstMonday = jan4 - (jan4Weekday - 1) * 86_400_000;

  const week = Math.floor((thursday.getTime() - firstMonday) / (7 * 86_400_000)) + 1;
  return { weekYear, week };
}

/**
 * The stable key for a week, e.g. `'2026-W35'`. Client and server compute it
 * with this same function so both agree on what "diese Woche" means.
 */
export function weekKey(instant: Date, timeZone: string): string {
  const { weekYear, week } = isoWeekOf(civilDateIn(instant, timeZone));
  return `${String(weekYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

/** True when both instants fall in the same ISO week of `timeZone`. */
export function isSameWeek(a: Date, b: Date, timeZone: string): boolean {
  return weekKey(a, timeZone) === weekKey(b, timeZone);
}

/** Whole days between two instants, floored. Used by the fairness window (§6.8). */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

// ───────────── civil-date arithmetic for the recurrence rules (§1.4) ─────────────

const MS_PER_DAY = 86_400_000;

/** Shift a calendar date by whole days, rolling months and years correctly. */
export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * The offset of `timeZone` at `instant`, in milliseconds east of UTC.
 *
 * Derived by asking `Intl` what wall-clock time the instant maps to and
 * measuring the difference, so DST transitions are handled by the platform's
 * timezone database rather than by a table maintained here.
 */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const field = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  // Milliseconds are not in the formatted parts, so compare on whole seconds.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Turn a wall-clock date and time in `timeZone` into an absolute instant.
 *
 * The offset depends on the instant we are trying to find, so the guess is
 * corrected once. One correction is enough for every real timezone: offsets
 * change by at most a couple of hours, and a second pass would only differ
 * inside a DST gap, where any answer is a convention anyway.
 */
export function civilToInstant(
  date: CivilDate,
  time: { hour: number; minute: number },
  timeZone: string,
): Date {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  const firstGuess = new Date(wallClock - timeZoneOffsetMs(new Date(wallClock), timeZone));
  const corrected = wallClock - timeZoneOffsetMs(firstGuess, timeZone);
  return new Date(corrected);
}

/** Parse `"HH:mm"`. Returns `null` for anything malformed. */
export function parseTimeOfDay(value: string | null | undefined): {
  hour: number;
  minute: number;
} | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}
