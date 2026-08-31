/**
 * Mapping `TaskInstance.dueAt` onto a Todoist `due` object
 * (Architektur Todoist §13, open item 3).
 *
 * Todoist accepts three forms in `due.date`: an all-day `YYYY-MM-DD`, a
 * *floating* `YYYY-MM-DDTHH:mm:ss` (interpreted in the user's own Todoist
 * timezone), and an absolute UTC `YYYY-MM-DDTHH:mm:ssZ`.
 *
 * Two decisions, both because the household's timezone is the authority here and
 * the member's Todoist timezone is not knowable to us:
 *
 *  - **A due date with a time component is sent as absolute UTC.** Floating
 *    would silently re-interpret "Saturday 09:00" in whatever timezone the
 *    member's Todoist account happens to use, which for a household spanning a
 *    border would put the chore on the wrong clock. UTC pins the instant, and
 *    Todoist renders it in the member's own zone — which is what they want to
 *    see.
 *  - **A midnight-in-household-timezone due date is sent as all-day.** HA stores
 *    `dueAt` as a timestamp, so "due Saturday" arrives as Saturday 00:00 local.
 *    Sending that as an instant would show up as a task due at midnight, and in
 *    a timezone west of the household it would land on **Friday**. The date must
 *    therefore be computed *in the household timezone*, not from the UTC parts.
 */

export interface TodoistDue {
  date: string;
  /** Only set for the all-day form, to pin which day is meant. */
  timezone?: string;
}

/**
 * Renders an instant's calendar parts in a given IANA timezone.
 *
 * `Intl.DateTimeFormat` with `timeZone` is the only correct way to do this in
 * Node without a date library; arithmetic on the UTC parts is off by the offset.
 */
function partsInZone(
  at: Date,
  timeZone: string,
): { year: string; month: string; day: string; hour: string; minute: string; second: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: found.year ?? '1970',
    month: found.month ?? '01',
    day: found.day ?? '01',
    hour: found.hour ?? '00',
    minute: found.minute ?? '00',
    second: found.second ?? '00',
  };
}

/** Two digits, for building the UTC instant string without a library. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * @param dueAt the instance's due timestamp, or null
 * @param timezone `Household.timezone` (e.g. `Europe/Berlin`)
 * @returns a Todoist `due` object, or null when the task has no due date
 */
export function toTodoistDue(dueAt: Date | null, timezone: string): TodoistDue | null {
  if (dueAt === null) return null;

  let parts: ReturnType<typeof partsInZone>;
  try {
    parts = partsInZone(dueAt, timezone);
  } catch {
    // An invalid IANA name must not cost the member their Todoist task. Fall
    // back to UTC and still deliver something correct-to-the-instant.
    parts = partsInZone(dueAt, 'UTC');
    timezone = 'UTC';
  }

  const isMidnightLocal = parts.hour === '00' && parts.minute === '00' && parts.second === '00';

  if (isMidnightLocal) {
    // All-day. The date is the household's calendar day, which is why it is read
    // back out of the zoned parts rather than from `dueAt.toISOString()`.
    return { date: `${parts.year}-${parts.month}-${parts.day}`, timezone };
  }

  // Absolute instant, UTC. No `timezone` field: `Z` already pins it.
  const iso =
    `${dueAt.getUTCFullYear()}-${pad(dueAt.getUTCMonth() + 1)}-${pad(dueAt.getUTCDate())}` +
    `T${pad(dueAt.getUTCHours())}:${pad(dueAt.getUTCMinutes())}:${pad(dueAt.getUTCSeconds())}Z`;
  return { date: iso };
}
