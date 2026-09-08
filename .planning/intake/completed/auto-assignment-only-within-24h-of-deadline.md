---
title: "Random assignment should only trigger within 24h of a task's deadline"
status: completed
priority: normal
target: apps/api/src/domain/recurrence/next-occurrence.ts, apps/api/src/app/assignment/runAssignmentSweep.ts, packages/shared/src/config/defaults.ts
---

## Description

Today, a task gets randomly assigned far earlier than its actual deadline suggests it should — regardless of how much time is actually left, and even for tasks with no deadline at all.

**Current mechanism** (`apps/api/src/domain/recurrence/next-occurrence.ts:137-153`, §5.8):

```
offerExpiresAt = min(publishedAt + offerDurationMinutes, dueAt - leadMinutesBeforeDue)
```

with defaults `offerDurationMinutes: 60` and `leadMinutesBeforeDue: 0` (`packages/shared/src/config/defaults.ts:38-39`). `runAssignmentSweep.ts`'s sweep (§the `ripe` query) randomly assigns any `AVAILABLE` instance once `offerExpiresAt <= now`.

Two concrete problems this produces:

1. **A task due in 5 days still gets randomly assigned ~1 hour after being posted.** `min()` picks whichever is sooner, and the 60-minute `offerDurationMinutes` timer is almost always sooner than `dueAt - leadMinutesBeforeDue` unless the task was posted less than ~61 minutes before its own deadline. `leadMinutesBeforeDue` exists (OQ-4) but only shifts the due-date side of the `min()` — it doesn't stop the short duration timer from winning.
2. **A task with no `dueAt` at all (`dueAt === null`) still gets randomly assigned on the same 60-minute timer** (`offerExpiresAt` falls back to `publishedAt + offerDurationMinutes` per line 149) — there's no deadline concept to anchor "within 24h of the deadline" against.

**Decisions made with the user before filing this** (not yet built):
- Tasks with **no due date** should **never** be auto-assigned — they stay `AVAILABLE` indefinitely until someone volunteers, full stop. This is a real behavior change from today's fallback timer, but low blast radius: all 6 seed task definitions (`apps/api/prisma/seed.ts:80-162`) already set `dueOffsetMinutes`, so every currently-seeded recurring task does compute a `dueAt`. It mainly affects admin-defined tasks that deliberately have no due offset, and true `MANUAL`/`ONCE` tasks with no due date set.
- Tasks **with** a due date should only be randomly assigned once the deadline is **less than 24 hours away** — not on a fixed short timer regardless of how far off the deadline is.

## What needs to change (starting point for whoever builds this — not prescriptive on the exact mechanism)

The `min(byDuration, byDueDate)` shape in `offerExpiresAt()` is the wrong operator for this: it needs `byDueDate` to *win* whenever a due date exists, not just whichever is sooner. A `dueAt`-anchored rework looks roughly like:

```
if dueAt === null:  offerExpiresAt = null   // never auto-expires → never auto-assigned
else:                offerExpiresAt = max(publishedAt, dueAt - 24h)
```

This means `offerDurationMinutes` stops being the dominant trigger for due-dated tasks. Worth deciding during build, not here:
- Should the existing `leadMinutesBeforeDue` config field (`assignment.leadMinutesBeforeDue`, OQ-4) just become this 24h threshold (default bumped from `0` to `1440`), reusing what's already admin-configurable per CLAUDE.md §16-17's "no hardcoded game rules" principle? That seems like the natural fit rather than inventing a second, overlapping config key.
- Does `offerDurationMinutes` still mean anything for a due-dated task afterward, or does it become exclusively the fallback timer for non-recurring/no-due-date tasks (which per the decision above would no longer even use it, since those never auto-assign)? If it becomes fully unused, that's a config field to deprecate/remove, not just leave dangling — check the admin config UI and its docs/copy too.
- `runAssignmentSweep.ts:389-390` logs the `NO_VOLUNTEER` history event with `payload: { offerDurationMinutes: config.assignment.offerDurationMinutes }` — once the real reason an offer closed is "within 24h of deadline" rather than "duration elapsed," that payload (and whatever renders it) should say the true reason, per the Fairness-Transparenz principle (CLAUDE.md §32 — "Der Benutzer muss ... keine versteckten Regeln haben").
- `nextOccurrence`/`expiryDeadline` (`next-occurrence.ts:156-169`) governs a *different* concern (when the whole task instance expires and a new occurrence gets materialized) — confirm this change doesn't need to touch that path, only `offerExpiresAt`.

## Acceptance Criteria

- A task instance with `dueAt === null` is never randomly assigned by the sweep; it remains `AVAILABLE` until voluntarily taken (or manually assigned/administered).
- A task instance with a `dueAt` is not randomly assigned while more than 24 hours remain before `dueAt`; once fewer than 24 hours remain, the normal sweep/random-draw behavior (candidate filtering, fairness weighting, audit log) applies unchanged.
- The 24-hour threshold is admin-configurable (reusing or replacing `assignment.leadMinutesBeforeDue`), not hardcoded — per CLAUDE.md §16-17.
- A task posted with less than 24 hours already remaining before its deadline is still assignable promptly (doesn't wait for a full 24h that's already elapsed) — matches the existing `max(publishedAt, ...)` floor behavior in `offerExpiresAt`.
- Existing recurrence/timing tests (`apps/api/test/domain/recurrence.test.ts`) are updated to cover both the null-`dueAt` (never expires) and near-deadline cases, not just the current `min()` clamp behavior.
- The reason a task's offer closed (duration elapsed vs. deadline approaching) stays visible wherever it's currently surfaced (history log, "why was I assigned" transparency view) rather than silently changing meaning.
