---
title: "Reusable duration and date/time entry components for the admin UI"
status: completed
priority: normal
target: apps/web/src/components/, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx
---

## Description

Every time-duration field in the admin UI is a raw `<input type="number">` that expects a plain count of minutes, with no unit selector:

- `TaskDefinitionsSection.tsx:266-278` — `dueOffsetMinutes` ("Fälligkeit nach Start")
- `TaskDefinitionsSection.tsx:369-386` — `estimatedMinutes` ("geschätzter Aufwand")
- `AdminSettingsPage.tsx:73-81` — `offerDurationMinutes` ("Angebotsdauer")

Setting a due offset of "2 days" today means typing `2880` and doing the math yourself. There's no minutes/hours/days toggle anywhere.

Every time-of-day field is a raw, unvalidated-beyond-regex text box, not a real picker:

- `TaskDefinitionsSection.tsx:255-264` — `recurrenceTimeOfDay`, `type="text"` with `pattern="^\d{2}:\d{2}$"`, placeholder `"HH:mm"`. No native `<input type="time">`, no calendar/clock affordance.

There is no "plain date" *and* "date and time" input pair anywhere reusable — the only native date picker in the app is `MembersSection.tsx:196-208`'s absence start/end (`type="date"`, date-only, which is fine as-is for a whole-day absence range). There's nothing for entering an actual date+time.

**On the local-vs-server-time concern, specifically:** the backend timezone handling itself already looks correct — `apps/api/src/domain/recurrence/next-occurrence.ts` explicitly combines a civil `recurrenceTimeOfDay` string with the household's configured IANA `timezone` via `civilToInstant(candidate, time, timeZone)` to compute the real instant, and `apps/web/src/utils/format.ts`'s display formatters use the *viewer's* browser timezone (via `Intl.DateTimeFormat` with no explicit `timeZone` override), which is the right default for displaying an absolute instant back to a human. The actual gap is **transparency, not correctness**: `household.timezone` is fetched into the frontend's session type (`apps/web/src/api/types.ts:14`) but is never displayed or referenced anywhere in the UI — grep confirms zero other usages. So when an admin types "14:00" into the `recurrenceTimeOfDay` box, nothing tells them this is interpreted in the *household's* configured zone (e.g. `Europe/Vienna`), not necessarily their own device's zone — which matters if an admin configures the household while traveling, or the household's zone is ever changed from the device default.

## Acceptance Criteria

- A reusable `DurationInput` component (new, under `apps/web/src/components/`) — a numeric field plus a minutes/hours/days unit selector, storing/emitting the underlying value in minutes (matching every backend field's unit) so no call site needs to change its data model. Wired into `dueOffsetMinutes`, `estimatedMinutes`, and `offerDurationMinutes`. Whichever unit best fits the current stored value should be the default displayed unit (e.g. an existing `720` shows as `12` + "Stunden", not `720` + "Minuten") — pick a reasonable magnitude heuristic and don't force users to always see raw minutes.
- `recurrenceTimeOfDay` moves from the raw regex-text box to a native `<input type="time">` (or an equivalent reusable `TimeOfDayInput` component), keeping the existing `HH:mm` civil-time storage format the backend already expects.
- Wherever a civil time-of-day or recurrence schedule is entered or edited, the household's configured timezone (`household.timezone` — already available in the session/config, just unused today) is shown explicitly nearby (e.g. "Zeiten gelten in: Europe/Vienna"), so it's never ambiguous which zone a typed time means.
- No change to backend timezone logic — `civilToInstant`/`offerExpiresAt`/the recurrence formulas already handle the household-timezone math correctly; this ticket is UI-only (input ergonomics + timezone transparency), not a backend fix.
- New components get the same test-coverage bar as existing ones (see `TaskDefinitionsSection.test.tsx` for the pattern) — cover the minutes↔hours↔days conversion round-trip and that the emitted value is still correct raw minutes for the API.
