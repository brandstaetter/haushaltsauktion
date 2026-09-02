/**
 * `@haushaltsauktion/shared` — the only package both `apps/api` and `apps/web`
 * may import (Architektur §7.3).
 *
 * It carries the enums, the reason codes, the error vocabulary, the DTO types,
 * the configuration schema and the formula parser. It deliberately does **not**
 * carry the domain functions that compute binding values: those live in
 * `apps/api/src/domain`, unreachable from the browser, because §36 makes the
 * server the sole authority on every price, reward and resulting value.
 */

export * from './domain/enums.js';
export * from './domain/reasons.js';
export * from './domain/ids.js';
export * from './config/index.js';
export * from './formula/index.js';
export * from './api/index.js';
export {
  weekKey,
  isSameWeek,
  isoWeekOf,
  isoWeekday,
  civilDateIn,
  civilDateKey,
  dayKey,
  parseCivilDateKey,
  civilDaysBetween,
  daysBetween,
  addCivilDays,
  timeZoneOffsetMs,
  civilToInstant,
  parseTimeOfDay,
} from './time/week.js';
export type { CivilDate } from './time/week.js';
