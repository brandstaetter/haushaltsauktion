---
title: "Verlauf: RE_OFFERED (and CANCELLED) history events render as the raw enum literal, not a message"
status: pending
priority: normal
target: apps/web/src/strings/de.ts
---

## Description

`RE_OFFERED` is a real, wired history event type — it's in the Prisma enum
(`apps/api/prisma/schema.prisma:101`), the shared `HistoryEvent` union with a
`{ value: number; offerExpiresAt: string | null }` payload
(`packages/shared/src/api/history.ts:35`), and it's written by **three**
different use-cases every time a task gets re-offered after leaving an
assignment:

- `apps/api/src/app/assignment/reopen.ts:190` — after a voluntary release or
  an admin revoke (T9/T10).
- `apps/api/src/app/buyout/executeBuyout.ts:250` — after every buyout.
- `apps/api/src/app/tasks/rejectCompletion.ts:260` — after an admin rejects a
  completion with the "back to market" outcome.

`de.history.eventTypes` (`apps/web/src/strings/de.ts:196-219`) has no
`RE_OFFERED` entry. `renderEvent`'s fallback
(`apps/web/src/pages/HistoryPage/HistoryPage.tsx:60-61`) kicks in and renders
the raw literal `"RE_OFFERED: {taskTitle}"` instead of a real sentence — and
because three separate flows write this type, it's not a rare edge case, it's
one of the more common lines in Verlauf. This is the same class of gap as the
`REVOKED` string that was just added (see git history for
`de.history.eventTypes.REVOKED`) — `RE_OFFERED` was apparently missed at the
same time despite being wired just as long.

**Second confirmed gap found while checking for others:** `CANCELLED` has the
same problem. It's in the shared `HistoryEvent` union
(`packages/shared/src/api/history.ts:43`, payload `{ reason: string | null }`)
and is actually written — just not via a literal `'CANCELLED'` string, which
is why a direct grep for it initially looked clean. It's constructed
dynamically in the shared `instanceAction` handler in
`apps/api/src/infra/http/routes/admin.ts:940-952`, alongside `OFFERED`,
`PAUSED`, and `RESUMED` (which *do* have `de.ts` strings) for the admin
`publish`/`pause`/`resume`/`cancel` instance actions. `CANCELLED` is also
missing from `de.history.eventTypes`, so admin-cancelled tasks hit the same
raw-literal fallback.

A full cross-check of `HistoryEvent`'s 21 variants against
`de.history.eventTypes` (`apps/web/src/strings/de.ts:196-219`) turned up
exactly these two gaps — every other event type already has a string.

## Acceptance Criteria

- Add `de.history.eventTypes.RE_OFFERED`, following the sibling `OFFERED`
  pattern (`'{task} wurde angeboten — Wert {value}'`) since both event types
  share the same payload shape — something like
  `'{task} wurde erneut angeboten — Wert {value}'`, using the existing
  `{task}`/`{value}` interpolation `renderEvent` already supports
  (`HistoryPage.tsx:63,65`) — no changes needed to `renderEvent` itself.
- Add `de.history.eventTypes.CANCELLED` too, e.g.
  `'{task} wurde abgebrochen'` (its `{ reason }` payload isn't currently
  interpolated by `renderEvent` — either extend `renderEvent` with a
  `{reason}` replacement backed by `event.payload.reason`, or keep the string
  reason-free for now and note the omission; don't silently drop the reason
  without a decision).
- Confirm `RE_OFFERED` renders correctly for all three writers (release/revoke,
  buyout, reject-completion-to-market) by checking their `payload.value`
  actually carries the new current value at the moment of re-offering, not the
  old one — verify against each call site above rather than assuming.
