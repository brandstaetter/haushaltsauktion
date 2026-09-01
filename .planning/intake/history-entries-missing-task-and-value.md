---
title: "History entries missing task name and new value (NO_VOLUNTEER, VALUE_RESET, RANDOMLY_ASSIGNED)"
status: completed
priority: normal
target: apps/web/src/strings/de.ts, apps/web/src/pages/HistoryPage/HistoryPage.tsx
campaign: history-entries-missing-task-name-and-new-value-no-volunteer-value-reset-randoml
---

## Description

Three entries in the "Verlauf" (history) view are unreadable in a household with more than one open task, reported directly from the UI:

- **"Zufallszuweisung an Elke"** — doesn't say for which task. Same shape as the other two below: `RANDOMLY_ASSIGNED: 'Zufallszuweisung an {member}'` (`de.ts:188`) has no `{task}` placeholder either, and `event.taskTitle` is available on this event the same way it is on every other one.

- **"Keine freiwillige Übernahme"** — doesn't say which task. `de.history.eventTypes.NO_VOLUNTEER` (`apps/web/src/strings/de.ts:187`) has no `{task}` placeholder, unlike its sibling `OFFERED: '{task} wurde angeboten — Wert {value}'` (line 186). This isn't a missing-data problem: `HistoryPage.tsx`'s `renderEvent` (`apps/web/src/pages/HistoryPage/HistoryPage.tsx:55-69`) already receives `event.taskTitle` on every event and substitutes `{task}` when the template has one — `NO_VOLUNTEER`'s template simply never references it.

- **"Aufgabenwert auf zurückgesetzt"** — renders with no number at all (literally a double space where the value should be). `VALUE_RESET: 'Aufgabenwert auf {value} zurückgesetzt'` (`de.ts:195`) interpolates `{value}` from `event.payload.value` (`HistoryPage.tsx:65`), but both places that write a `VALUE_RESET` history event — `apps/api/src/app/tasks/completeTask.ts:239-246` and `apps/api/src/app/assignment/runAssignmentSweep.ts:314-320` — write the payload as `{ from, to, strategy }`, never a `value` key. `event.payload.value` is always `undefined` for this event type, so the placeholder silently resolves to an empty string. Same missing-`{task}`-placeholder issue as `NO_VOLUNTEER` applies here too.

Worth a quick check whether the same missing-`{task}` gap applies to other task-scoped event types in the same table (`ASSIGNMENT_ACCEPTED`, `VALUE_INCREASED`, `EXPIRED`, `RELEASED`, `PAUSED`, `RESUMED` all currently lack `{task}` too) — scope that as part of the same pass rather than a second ticket, since it's the identical one-line fix repeated.

## Acceptance Criteria

- `NO_VOLUNTEER` and `RANDOMLY_ASSIGNED` (and any other task-scoped event type found missing it) include `{task}` in their templates and render the actual task title, matching `OFFERED`'s pattern.
- `VALUE_RESET` renders the actual new value — either the frontend reads `{to}` instead of `{value}` for this event type, or the backend's payload gains a `value` key at both write sites (`completeTask.ts`, `runAssignmentSweep.ts`); pick whichever keeps `renderEvent`'s replace-chain from needing a type-specific branch, since every other event type there is a flat `{placeholder}` → `payload[key]` mapping.
- Existing history-rendering tests (if any) cover both fixed strings with a real payload, not just the empty-payload case that let the `{value}` gap through.
