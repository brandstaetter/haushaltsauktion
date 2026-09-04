---
version: 1
id: "5e49c46d-8fac-4163-ace5-70558cc7f516"
status: completed
started: "2026-09-04T12:48:42.740Z"
completed_at: "2026-09-04T14:49:58.000Z"
direction: "Verlauf: STREAK_BONUS_AWARDED wird als rohes Enum-Literal statt als Text angezeigt"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Verlauf: STREAK_BONUS_AWARDED wird als rohes Enum-Literal statt als Text angezeigt

Status: completed
Started: 2026-09-04T12:48:42.740Z
Direction: Verlauf: STREAK_BONUS_AWARDED wird als rohes Enum-Literal statt als Text angezeigt

## Claimed Scope
- apps/web/src/strings/de.ts

## Intake Source

- File: .planning/intake/history-streak-bonus-awarded-missing-i18n.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`STREAK_BONUS_AWARDED` ist ein regulärer, verdrahteter `HistoryEventType`
(`packages/shared/src/domain/enums.ts`) — geschrieben in `completeTask.ts:412`, wenn
eine Tages-Streak-Erledigung einen Bonus auslöst (intake
"daily-completion-streak-bonus"). Der Payload trägt `memberId`, `amount` und
`streakLength` (`completeTask.ts:413-418`).

`de.history.eventTypes` (`apps/web/src/strings/de.ts:203-228`) hat für diesen Typ
aber keinen Eintrag. `renderEvent()` in `HistoryPage.tsx:60-61` fällt bei einem
fehlenden Key auf `` `${event.type}: ${event.taskTitle}` `` zurück — im Verlauf
erscheint also buchstäblich "STREAK_BONUS_AWARDED: <Aufgabentitel>" statt eines
lesbaren deutschen Satzes. Derselbe Bug-Mechanismus wie bei den bereits behobenen
Intake-Items "history-re-offered-missing-i18n" (`RE_OFFERED`/`CANCELLED`) und
"notification-task-taken-missing-i18n" (`TASK_TAKEN`) — hier nur für einen anderen,
neueren Event-Typ, der beim Hinzufügen des Streak-Features offenbar übersehen wurde.

`renderEvent()`s `{points}`-Platzhalter liest bereits `payload.amount` (wird z. B. für
`POINTS_AWARDED` verwendet) und kann für den Bonusbetrag wiederverwendet werden, ohne
`renderEvent()` selbst zu ändern.

## Acceptance Criteria

- `de.history.eventTypes.STREAK_BONUS_AWARDED` existiert mit einem Text im Stil der
  bestehenden Einträge (z. B. orientiert an `POINTS_AWARDED`: "{member} erhält
  {points} Punkte für {task}" — hier sinngemäß als Serien-Bonus, ggf. mit
  `streakLength` aus dem Payload, sofern ohne Änderung an `renderEvent()`s
  Platzhaltern sinnvoll einbaubar).
- Im Verlauf erscheint für dieses Ereignis kein rohes Enum-Literal mehr.
- Kein Code-Pfad außerhalb von `de.ts` muss sich ändern (reiner i18n-Fix, wie bei den
  beiden vorherigen ähnlichen Items).

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
| phase:2 | implementation-diff | file_diff | yes | apps/web/src/strings/de.ts (+2), apps/web/src/pages/HistoryPage/HistoryPage.test.tsx (+12) | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 361/361, web 136/136 all passing; npm run typecheck clean; npm run lint clean | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/verlauf-streak-bonus-awarded-wird-als-rohes-enum-literal-statt-als-text-angezeig.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T12:48:42.740Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T14:49:58.000Z: Implemented, verified, and packaged in one session.
  Added `de.history.eventTypes.STREAK_BONUS_AWARDED: '{member} erhält {points}
  Punkte Serien-Bonus für {task}'` — reuses `renderEvent()`'s existing
  `{points}` placeholder (already mapped to `payload.amount`), no code change
  outside `de.ts` needed, matching the acceptance criteria exactly. Added a
  regression test to `HistoryPage.test.tsx` mirroring the existing
  `RE_OFFERED`/`CANCELLED` tests. Full suite (641 tests) + typecheck + lint
  pass.

## Active Context

All 4 phases complete. Implementation, verification, and local review package
done. No PR was created yet — this is a tiny, single-string i18n fix, ready
for the user to review and decide on commit/PR.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished, awaiting user decision on commit
Files modified: apps/web/src/strings/de.ts,
apps/web/src/pages/HistoryPage/HistoryPage.test.tsx
Blocking: none
