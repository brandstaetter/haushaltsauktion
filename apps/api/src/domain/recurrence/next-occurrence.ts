/**
 * Recurrence rules (Architektur §1.4, CLAUDE.md §18).
 *
 * Explicit fields, not RRULE: §18 lists exactly seven cases, and an RRULE
 * dependency plus a parser is more surface than the feature is worth (§43).
 *
 * Materialization anchors on the **scheduled** occurrence, never on
 * `lastCompletedAt`, so a missed week does not shift the series forward.
 *
 * Pure: no Prisma, no `Date.now()`, no `Math.random` (§7.2) — every instant is
 * a parameter.
 */

import {
  addCivilDays,
  civilDateIn,
  civilToInstant,
  isoWeekday,
  parseTimeOfDay,
  RecurrenceType,
  type CivilDate,
} from '@haushaltsauktion/shared';

/** §1.4 — the default occurrence time when a definition sets none. */
export const DEFAULT_TIME_OF_DAY = { hour: 6, minute: 0 } as const;

export interface RecurrenceRule {
  type: RecurrenceType;
  /** N, for `EVERY_N_DAYS`. */
  interval: number | null;
  /** 1 = Mon … 7 = Sun. For `WEEKDAYS`, and as the `WEEKLY` anchor. */
  weekdays: readonly number[];
  /** 1–28, for `MONTHLY`. Capped so no month is skipped (§1.4). */
  dayOfMonth: number | null;
  /** `"HH:mm"` in the household timezone. */
  timeOfDay: string | null;
  /** `dueAt = occurrenceStart + dueOffsetMinutes`. */
  dueOffsetMinutes: number | null;
}

/** Guard against a malformed rule spinning: no real rule needs more steps. */
const MAX_STEPS = 400;

function nextCandidate(rule: RecurrenceRule, from: CivilDate, step: number): CivilDate | null {
  switch (rule.type) {
    case RecurrenceType.ONCE:
    case RecurrenceType.MANUAL:
      return null;

    case RecurrenceType.DAILY:
      return addCivilDays(from, step);

    case RecurrenceType.EVERY_N_DAYS: {
      const n = rule.interval ?? 1;
      return addCivilDays(from, Math.max(1, n) * step);
    }

    case RecurrenceType.WEEKDAYS: {
      // Scan forward for the next listed weekday. With no weekdays configured
      // the rule has nothing to fire on, which is a configuration error rather
      // than a reason to fall back to "every day".
      if (rule.weekdays.length === 0) return null;
      const wanted = new Set(rule.weekdays);
      let found = 0;
      for (let offset = 1; offset <= 7 * step + 7; offset += 1) {
        const candidate = addCivilDays(from, offset);
        if (wanted.has(isoWeekday(candidate))) {
          found += 1;
          if (found === step) return candidate;
        }
      }
      return null;
    }

    case RecurrenceType.WEEKLY: {
      const anchor = rule.weekdays[0];
      if (anchor === undefined) return addCivilDays(from, 7 * step);
      // First occurrence lands on the anchor weekday; later ones step by weeks.
      for (let offset = 1; offset <= 7; offset += 1) {
        const candidate = addCivilDays(from, offset);
        if (isoWeekday(candidate) === anchor) return addCivilDays(candidate, 7 * (step - 1));
      }
      return addCivilDays(from, 7 * step);
    }

    case RecurrenceType.MONTHLY: {
      const day = rule.dayOfMonth ?? from.day;
      const monthIndex = from.year * 12 + (from.month - 1) + step;
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      return { year, month, day: Math.min(day, 28) };
    }
  }
}

/**
 * The next occurrence strictly after `after`, or `null` when the rule produces
 * none (`ONCE` and `MANUAL` never recur automatically).
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  after: Date,
  timeZone: string,
): Date | null {
  if (rule.type === RecurrenceType.ONCE || rule.type === RecurrenceType.MANUAL) return null;

  const time = parseTimeOfDay(rule.timeOfDay) ?? DEFAULT_TIME_OF_DAY;
  const from = civilDateIn(after, timeZone);

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const candidate = nextCandidate(rule, from, step);
    if (candidate === null) return null;
    const instant = civilToInstant(candidate, time, timeZone);
    // MONTHLY can produce a candidate in the same month as `from`, and any rule
    // can land on `from` itself at an earlier time of day; both must be skipped.
    if (instant.getTime() > after.getTime()) return instant;
  }
  return null;
}

/** §3.2 — the optional due date derived from an occurrence start. */
export function dueAtFor(rule: RecurrenceRule, occurrenceStart: Date): Date | null {
  if (rule.dueOffsetMinutes === null) return null;
  return new Date(occurrenceStart.getTime() + rule.dueOffsetMinutes * 60_000);
}

// ───────────────────────── derived timing (§5.8) ─────────────────────────

export interface OfferWindowInput {
  publishedAt: Date;
  dueAt: Date | null;
  offerDurationMinutes: number;
  /** OQ-4 — lets a household guarantee the draw happens before the chore is late. */
  leadMinutesBeforeDue: number;
}

/**
 * §5.8:
 *   `offerExpiresAt = min(publishedAt + offerDurationMinutes,
 *                         dueAt - leadMinutesBeforeDue)`
 *
 * At the default `leadMinutesBeforeDue = 0` the clamp reduces to `dueAt`, which
 * is the spec's implicit behaviour. The result is never before `publishedAt`:
 * a task published after its own due date is offered for an instant rather than
 * being retroactively expired.
 */
export function offerExpiresAt(input: OfferWindowInput): Date {
  const byDuration = input.publishedAt.getTime() + input.offerDurationMinutes * 60_000;
  if (input.dueAt === null) return new Date(byDuration);

  const byDueDate = input.dueAt.getTime() - input.leadMinutesBeforeDue * 60_000;
  return new Date(Math.max(input.publishedAt.getTime(), Math.min(byDuration, byDueDate)));
}

/**
 * §5.8 — `expiryDeadline = dueAt ?? next occurrence start`.
 *
 * `null` means the instance never expires on its own. That is intended for a
 * `MANUAL` or `ONCE` task with no due date (OQ-4): an ad-hoc chore should stay
 * open until it is done or cancelled.
 */
export function expiryDeadline(
  rule: RecurrenceRule,
  instance: { scheduledFor: Date; dueAt: Date | null },
  timeZone: string,
): Date | null {
  if (instance.dueAt !== null) return instance.dueAt;
  return nextOccurrence(rule, instance.scheduledFor, timeZone);
}
