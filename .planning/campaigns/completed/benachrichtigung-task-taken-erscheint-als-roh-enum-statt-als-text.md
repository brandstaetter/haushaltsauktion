---
version: 1
id: "98887c22-4e85-4d89-98e6-d35c61f3618a"
status: completed
started: "2026-09-03T03:27:52.396Z"
completed_at: "2026-09-03T05:31:00.000Z"
direction: "Benachrichtigung TASK_TAKEN erscheint als Roh-Enum statt als Text"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Benachrichtigung TASK_TAKEN erscheint als Roh-Enum statt als Text

Status: completed
Started: 2026-09-03T03:27:52.396Z
Direction: Benachrichtigung TASK_TAKEN erscheint als Roh-Enum statt als Text

## Claimed Scope
- apps/web/src/strings/de.ts, apps/web/src/components/NotificationBell/NotificationBell.tsx

## Intake Source

- File: .planning/intake/notification-task-taken-missing-i18n.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Bei freiwilliger Übernahme einer Aufgabe (`POST /tasks/:id/volunteer`)
sendet der Server eine `TASK_TAKEN`-Benachrichtigung
(`apps/api/src/app/tasks/volunteerForTask.ts:179-187` — bewusst ein
eigener Typ, nicht `TASK_ASSIGNED`, weil letzterer "zufällig
zugewiesen" bedeutet und an anderer Stelle darauf verlassen wird). In
der Glocke (`NotificationBell.tsx:25-38`, `renderMessage()`) schlägt
das Rendern fehl auf den Roh-Enum-Namen zurück, wenn kein Eintrag in
`de.notifications.types` existiert (`if (!template) return n.type;`,
Zeile 30) — und `TASK_TAKEN` fehlt dort tatsächlich
(`apps/web/src/strings/de.ts:212-217` enthält nur `TASK_ASSIGNED`,
`TASK_COMPLETED`, `TASK_VALUE_INCREASED`, `ADMIN_NO_CANDIDATES`). Genau
dieses Muster ("Roh-Enum statt Text") wurde für den Verlauf bereits
einmal behoben (Intake `history-re-offered-missing-i18n`, abgeschlossen).

Keine Backend-Änderung nötig: `taskTitle` (das `{task}`-Platzhalter in
den Templates) wird bereits generisch für jede Benachrichtigung mit
`taskInstanceId` aufgelöst (`apps/api/src/app/queries/reads.ts:273`,
`n.instance?.definition.title`), unabhängig vom Typ — `TASK_TAKEN`s
`emit()`-Aufruf setzt `taskInstanceId` bereits (Zeile 185), `taskTitle`
kommt also schon korrekt an. Es fehlt nur der Template-String.

**Zwei verwandte, aber aktuell nicht auslösbare Lücken, gefunden beim
Abgleich mit dem vollständigen Enum** (`packages/shared/src/domain/enums.ts:121-130`):
`TASK_AVAILABLE` und `TASK_DUE_SOON` fehlen ebenfalls in
`de.notifications.types`, aber kein Backend-Code sendet aktuell einen
dieser beiden Typen (§24 sieht sie als künftige Events vor, noch nicht
verdrahtet) — daher heute nicht live reproduzierbar. Trotzdem sinnvoll,
sie in derselben Änderung mit abzudecken, damit ihre Einführung später
nicht denselben Fehler wiederholt.

## Acceptance Criteria

- `de.notifications.types.TASK_TAKEN` liefert einen deutschen Text mit
  `{task}`- und `{value}`-Platzhaltern (Vorbild: `TASK_COMPLETED`s
  bestehende Formulierung), sodass eine freiwillige Übernahme in der
  Glocke lesbar erscheint statt als `TASK_TAKEN`.
- `de.notifications.types.TASK_AVAILABLE` und `.TASK_DUE_SOON` ebenfalls
  ergänzt, mit sinnvollen Platzhaltern passend zu ihrer Bedeutung in
  §24, auch wenn sie aktuell noch nicht ausgelöst werden.
- Kein Fallback auf den Roh-Enum-Namen mehr für einen der drei Typen.
- Regressionstest (Komponente oder Unit) für `renderMessage()`: eine
  `TASK_TAKEN`-Notification mit gesetztem `taskTitle`/`payload.value`
  ergibt den erwarteten deutschen Text, nicht `"TASK_TAKEN"`.
- `npm run typecheck` und `npm run lint` bleiben grün.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |  complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | 2 files changed: apps/web/src/strings/de.ts (+4 lines: TASK_AVAILABLE, TASK_TAKEN, TASK_DUE_SOON added to de.notifications.types), apps/web/src/components/NotificationBell/NotificationBell.test.tsx (+7 lines: dedicated TASK_TAKEN regression test) | verified | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test -w apps/web: 19 files, 111/111 pass (110 existing + 1 new TASK_TAKEN test; the existing generic "covers every de.notifications.types key" test now also covers TASK_AVAILABLE and TASK_DUE_SOON automatically). | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/benachrichtigung-task-taken-erscheint-als-roh-enum-statt-als-text.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-03T03:27:52.396Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-03 (build): Confirmed no backend change needed by reading
  `volunteerForTask.ts:179-187` and `reads.ts:273` directly — `TASK_TAKEN`'s
  `emit()` call already sets `taskInstanceId`, and `taskTitle` is resolved
  generically from the linked instance for any notification type, not
  type-specific. Added three template strings to `de.notifications.types`:
  `TASK_TAKEN` ("Du hast „{task}“ übernommen — aktueller Wert {value}",
  mirroring `TASK_ASSIGNED`'s phrasing but for a voluntary pickup rather
  than a random draw), plus `TASK_AVAILABLE` and `TASK_DUE_SOON` (not yet
  emitted by any backend code, but present in the shared enum since §24 —
  added now so a future emitter doesn't reintroduce this same fallback bug).
  Added a dedicated `renderMessage()` test for `TASK_TAKEN` matching the
  existing per-type test style; the file's existing generic
  "covers every defined type" test automatically extended to the two new
  keys without needing separate cases, since it iterates
  `Object.keys(de.notifications.types)`.
  Reason: minimal, additive i18n fix — no runtime behavior other than the
  notification bell's rendered text changes.

## Active Context

All four phases complete. `npm run typecheck`/`lint`/`test -w apps/web`
all pass. Local review package generated.

## Completion Record

- Completed At: 2026-09-03T05:31:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting the same commit/PR go-ahead pattern as other campaigns this
  session)
- Verification: npm run typecheck, npm run lint, npm run test -w apps/web
  (111/111) all pass
- No open items for reviewer — small, additive, backend-untouched fix.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: apps/web/src/strings/de.ts, apps/web/src/components/NotificationBell/NotificationBell.test.tsx
Blocking: none
