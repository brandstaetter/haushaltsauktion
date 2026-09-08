---
title: "Benachrichtigung TASK_TAKEN erscheint als Roh-Enum statt als Text"
status: completed
priority: normal
target: apps/web/src/strings/de.ts, apps/web/src/components/NotificationBell/NotificationBell.tsx
campaign: benachrichtigung-task-taken-erscheint-als-roh-enum-statt-als-text
---

## Description

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
