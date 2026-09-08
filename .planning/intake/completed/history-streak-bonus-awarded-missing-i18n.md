---
title: "Verlauf: STREAK_BONUS_AWARDED wird als rohes Enum-Literal statt als Text angezeigt"
status: completed
priority: normal
target: apps/web/src/strings/de.ts
campaign: verlauf-streak-bonus-awarded-wird-als-rohes-enum-literal-statt-als-text-angezeig
---

## Description

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
