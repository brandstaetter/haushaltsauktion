---
title: "Manuelle Punkteanpassung durch Admin erscheint nicht im gemeinsamen Verlauf"
status: completed
priority: normal
target: apps/api/src/app/points/adjustPoints.ts, apps/api/src/app/events.ts, apps/api/src/infra/http/routes/misc.ts, apps/web/src/pages/HistoryPage/
campaign: manuelle-punkteanpassung-durch-admin-erscheint-nicht-im-gemeinsamen-verlauf
---

## Description

`adjustPoints.ts` (die Businesslogik hinter `POST /admin/members/:id/points/adjust`,
Ziel des kürzlich abgeschlossenen Intake-Items
"admin-manual-points-adjustment-ui-missing") schreibt bei jeder manuellen Anpassung
korrekt einen `AuditEvent` mit `action: 'POINTS_ADJUSTED'`
(`adjustPoints.ts:55-68`) — aber **keinen `TaskHistoryEvent`**. `writeHistory()`
wird dort nirgendwo aufgerufen.

Das hat einen strukturellen Grund, keinen Bug im engeren Sinn: `TaskHistoryEvent`
(§22, "Verlauf" — `GET /api/history`, `HistoryPage.tsx`) ist zwingend an eine
`taskInstanceId` gebunden (`HistoryDraft.taskInstanceId: string`, nicht optional,
siehe `events.ts:15`). Eine manuelle Punkteanpassung hat aber keine zugehörige
Task-Instanz — sie ist reine Ledger-Buchhaltung (§14) mit Grund, ohne Aufgabenbezug.
`AuditEvent` (§23) ist dafür die architektonisch korrekte Senke und tut genau das,
wofür es gedacht ist.

Das eigentliche Transparenzproblem: **es gibt aktuell keine UI, die `AuditEvent`
überhaupt anzeigt** — weder für Admins noch für Mitglieder. `GET /api/history`
(`misc.ts:32`) ist für jedes Haushaltsmitglied erreichbar (`requireMember`, nicht nur
Admins) und zeigt den gemeinsamen Aufgaben-Verlauf — aber eben nur `TaskHistoryEvent`,
nie `AuditEvent`. Die einzige Stelle, an der eine Anpassung überhaupt sichtbar wird,
ist das persönliche Punktekonto (`LedgerPage.tsx`) der betroffenen Person selbst
— andere Haushaltsmitglieder haben aktuell keine Möglichkeit zu sehen, dass (und
warum) ein Admin jemandem Punkte gutgeschrieben oder abgezogen hat. Das widerspricht
§31 ("keine versteckten Regeln") und dem in diesem Ticket beschriebenen
Transparenzbedürfnis.

Mögliche Lösungsrichtungen (Entscheidung gehört ins Briefing, nicht hierher
vorweggenommen):

1. **Admin-Audit-Log-UI** (§23 wörtlich umgesetzt) — eine neue, admin-only Ansicht,
   die `AuditEvent` liest. Sauberste Trennung, ändert nichts an der Bedeutung von
   `TaskHistoryEvent`/Verlauf als reinem Aufgaben-Zeitstrahl. Deckt aber nur Admins
   ab, nicht "jedes Mitglied sieht es im gemeinsamen Verlauf".
2. **`TaskHistoryEvent` für taskslose Ereignisse öffnen** — `taskInstanceId` nullable
   machen und eine manuelle Anpassung dort mit eintragen. Größerer Eingriff:
   `HistoryPage.tsx`/`renderEvent()` und jeder andere Konsument von
   `TaskHistoryEvent` müsste den Fall "kein Task" beherrschen; verwässert den bisher
   klaren Aufgaben-Fokus des Verlaufs.
3. **`GET /history` um `AuditEvent`-Einträge erweitern** (gemergter Feed) — zeigt es
   allen Mitgliedern, ohne `TaskHistoryEvent`s Schema anzufassen, aber vermischt
   zwei bewusst getrennte Streams (§2.6: "Zwei distinct streams, deliberately").

## Acceptance Criteria

- Eine manuelle Punkteanpassung durch einen Admin ist für mindestens die
  betroffene Person hinaus auch für andere Haushaltsmitglieder (oder zumindest alle
  Admins) nachvollziehbar sichtbar, nicht nur im eigenen Punktekonto der
  betroffenen Person.
- Betrag, Begründung und ausführender Admin sind in der gewählten Ansicht sichtbar
  (alle drei stehen bereits im `AuditEvent.payload`, siehe `adjustPoints.ts:62-67`).
- Kein rohes Enum-Literal, falls ein neuer Anzeige-Pfad entsteht (gleiche i18n-Disziplin
  wie beim bestehenden Verlauf).
- Die bestehende Bedeutung von `TaskHistoryEvent` als Aufgaben-Zeitstrahl bleibt klar,
  unabhängig davon, welche der drei Lösungsrichtungen gewählt wird.
