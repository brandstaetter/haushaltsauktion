---
title: "Push-Benachrichtigungen (Web Push/VAPID) implementieren"
status: in-progress
priority: normal
target: apps/api/prisma/schema.prisma, apps/api/src/app/deps.ts, apps/api/src/app/integrations/ports.ts, apps/api/src/app/assignment/runAssignmentSweep.ts, apps/api/src/infra/http/routes/, apps/web/vite.config.ts, apps/web/src/components/NotificationBell/, packages/shared/src/config/
campaign: push-benachrichtigungen-web-push-vapid-implementieren
---

## Description

Umsetzung des Vorschlags aus `.planning/research-push-notifications.md`
(abgeschlossene Recherche, Intake
`research-push-notifications-task-available-and-assigned`, Kampagne
`recherche-push-benachrichtigungen-f-r-neue-verf-gbare-aufgaben-und-zufallszuweis`):
Web Push (VAPID) als zusätzlicher, additiver Benachrichtigungskanal neben dem
bestehenden In-App-`Notifier` (§24). Das Recherchedokument ist die
verbindliche Architekturgrundlage für diese Umsetzung — insbesondere:

- **Kein Umbau des `Notifier`-Interfaces.** Push wird als Decorator um den
  bestehenden `dbNotifier` gelegt (`pushNotifier(inner, push)`), der zuerst
  den heutigen In-App-Pfad unverändert ausführt und Push danach, außerhalb
  der Transaktion, best-effort anstößt. Ein Push-Fehlschlag darf niemals den
  In-App-Pfad oder die Transaktion selbst gefährden (§24-Garantie: "ein
  committeter Vorgang benachrichtigt immer, ein zurückgerollter nie" bleibt
  unangetastet).
- **Neues Modell `PushSubscription`**, an `HouseholdMember` gebunden (nicht an
  `User`) — siehe Begründung im Recherchedokument (§26 Multi-Household:
  Zustellentscheidung ist haushaltsspezifisch, auch wenn dasselbe Gerät für
  mehrere Haushalte registriert ist).
- **Service-Worker-Strategiewechsel nötig**: `vite-plugin-pwa`s aktueller
  `generateSW`-Modus erlaubt keine eigenen `push`/`notificationclick`-Handler.
  Umstieg auf `strategies: 'injectManifest'` mit eigener `src/sw.ts`
  (inklusive `precacheAndRoute(self.__WB_MANIFEST)`, um das bisherige
  Precaching-Verhalten 1:1 zu erhalten) ist der einzige Eingriff in die
  bestehende PWA-Konfiguration.
- **`web-push`** (npm) ist die einzige neue Backend-Abhängigkeit — kein
  Drittanbieter-Dienst, kein zusätzliches Konto (§37: betreibbar ohne eigenen
  Systemadministrator).
- **`PushSender`-Port** analog zu `TodoistPort`
  (`apps/api/src/app/integrations/ports.ts`) — injiziert, nicht direkt
  aufgerufen, damit Tests ihn wie jeden anderen Port ersetzen können.
- **Admin-Konfigurierbarkeit**: neues Feld `notifications.pushEnabled:
  boolean` (Default `false`, reiner Opt-in), exakt nach dem Muster von
  `notifications.inAppEnabled`.

Der Vorschlag ist bewusst in drei unabhängig auslieferbaren Phasen gegliedert
— das eignet sich für eine Archon-Kampagne mit einer Phase pro
Umsetzungsschritt, nicht für einen einzelnen Autopilot-Durchlauf:

1. **Phase 1 — Grundlage (kein sichtbares Feature)**: `PushSubscription`-
   Modell + Migration; VAPID-Schlüsselpaar serverseitig (Umgebungsvariable,
   analog zu bestehenden Secrets in `.env`); `POST /members/me/push-
   subscription` (anlegen) und `DELETE .../:id` (entfernen), kein UI;
   `web-push`-Abhängigkeit + `PushSender`-Port.
2. **Phase 2 — Zustellung für die zwei bestehenden Ereignisse**: Service-
   Worker-Wechsel auf `injectManifest` mit `push`/`notificationclick`-
   Handlern; Opt-in-UI unter „Ich" (mit iOS-Hinweis: Push funktioniert dort
   nur nach "zum Homescreen hinzufügen", nicht im Browser-Tab);
   `pushNotifier`-Decorator verdrahtet für `TASK_ASSIGNED` und `TASK_TAKEN`;
   `notifications.pushEnabled`-Konfigurationsschalter.
3. **Phase 3 — `TASK_AVAILABLE` schließen und ausweiten**: fehlende
   Emit-Stelle für `TASK_AVAILABLE` in `runAssignmentSweep.ts`s T1/T2
   ergänzen (profitiert In-App *und* Push gleichzeitig — eine eigenständige,
   schon lange fällige Lücke, keine reine Push-Arbeit); Push für übrige
   bereits vorhandene `NotificationType`-Werte (`TASK_DUE_SOON`,
   `TASK_VALUE_INCREASED`, `TASK_COMPLETED`, `ADMIN_NO_CANDIDATES`, …) nach
   Bedarf ergänzen — mechanisch, sobald der Decorator einmal steht.

## Offene Fragen (aus der Recherche, vor Phase 2 zu entscheiden)

- Granularität des Opt-in: ein globaler Schalter pro Mitglied, oder pro
  Ereignistyp (wie `notifications.inAppEnabled` heute nur global tut)?
- Soll ein fehlgeschlagener Push (410 Gone) die `PushSubscription`-Zeile
  sofort löschen, oder erst nach N aufeinanderfolgenden Fehlschlägen?

## Acceptance Criteria

- `PushSubscription`-Modell + Migration; Subscription ist an
  `HouseholdMember` gebunden, nicht an `User` oder `Household`.
- `POST /members/me/push-subscription` und `DELETE
  /members/me/push-subscription/:id`, serverseitig validiert, kein
  clientseitig vertrauter Zustand (§36).
- `pushNotifier`-Decorator lässt den bestehenden In-App-Pfad
  (`dbNotifier`, transaktional) unverändert; Push läuft außerhalb der
  Transaktion und ein Push-Fehlschlag wirft nie einen Fehler zurück in den
  aufrufenden Use-Case.
- Service Worker liefert Web-Push-Benachrichtigungen für `TASK_ASSIGNED` und
  `TASK_TAKEN` aus, inklusive `notificationclick`-Handling (Fokus/Öffnen der
  App); bestehendes Precaching-Verhalten (App-Update-Prompt,
  `notify-on-new-deploy-and-refresh-cache`) bleibt unverändert erhalten.
- `notifications.pushEnabled`-Konfigurationsfeld (Default `false`),
  administrierbar über dasselbe Muster wie `notifications.inAppEnabled`.
- Opt-in-UI unter „Ich" mit explizitem iOS-Hinweis (Homescreen-Installation
  nötig).
- `TASK_AVAILABLE` wird beim `AVAILABLE`-Übergang in
  `runAssignmentSweep.ts` emittiert (In-App und Push) — schließt die
  bestehende Lücke.
- Ungültige `PushSubscription`s (404/410 vom Push-Endpoint) werden
  best-effort bereinigt, ohne den In-App-Pfad zu beeinträchtigen.
- Regressionstests: Push-Fehlschlag blockiert nie den In-App-Pfad oder die
  auslösende Transaktion (Kernversprechen §24); Rollback des auslösenden
  Vorgangs löst keinen Push aus.
