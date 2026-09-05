---
title: "Recherche: Push-Benachrichtigungen für neue verfügbare Aufgaben und Zufallszuweisungen"
status: completed
priority: normal
target: apps/api/src/app/deps.ts, apps/api/src/app/events.ts, apps/web/vite.config.ts, apps/web/src/components/NotificationBell/
campaign: recherche-push-benachrichtigungen-f-r-neue-verf-gbare-aufgaben-und-zufallszuweis
---

## Description

§24 der Spezifikation sieht Push/PWA-Benachrichtigungen explizit als möglichen Kanal
vor ("Initial muss mindestens In-App unterstützt werden" — Push war also von Anfang an
als spätere Ausbaustufe gedacht). Aktueller Stand, damit die Recherche nicht bei null
anfängt:

- **In-App-Benachrichtigungen existieren bereits** über `Notifier.emit()`
  (`apps/api/src/app/deps.ts`) und werden aktuell für `TASK_ASSIGNED` (Zufallszuweisung,
  `runAssignmentSweep.ts`) und `TASK_TAKEN` (freiwillige Übernahme,
  `volunteerForTask.ts`) ausgelöst. Angezeigt über `NotificationBell` im Web-Client.
- **`TASK_AVAILABLE` ist bereits als `NotificationType` definiert** (`enums.ts`) und hat
  sogar schon einen deutschen Anzeigetext in `strings/de.ts` — wird aber aktuell
  **nirgendwo emittiert**. Die "neue Aufgabe verfügbar"-Benachrichtigung aus §24 ist mit
  anderen Worten schon halb verdrahtet, nur die Emit-Stelle fehlt (vermutlich beim
  Publizieren einer Instanz in `runAssignmentSweep.ts`s T1/T2-Schritten).
- **Eine Service-Worker-Grundlage existiert bereits**: `vite-plugin-pwa`
  (`apps/web/vite.config.ts`) wird schon für App-Update-Precaching genutzt (siehe
  erledigtes Intake-Item "notify-on-new-deploy-and-refresh-cache"). Das ist relevant,
  weil Web Push serverseitig genau diesen Service Worker braucht, um `push`-Events
  entgegenzunehmen.

Gewünscht ist zunächst **keine Implementierung**, sondern eine Recherche/Vorschlag:

1. Welche Optionen gibt es für Browser-Push (Web Push API / VAPID) in einer PWA, die
   bereits `vite-plugin-pwa` nutzt? Aufwand, Abhängigkeiten (z. B. `web-push`
   npm-Paket), Betriebskosten (kein Drittanbieter-Dienst nötig bei reinem Web Push,
   im Gegensatz zu z. B. Firebase Cloud Messaging).
2. Wie fügt sich das ins bestehende `Notifier`-Interface ein — als zusätzlicher
   Notifier neben dem heutigen In-App-Notifier, oder als Erweiterung desselben Aufrufs
   (§24 nennt "mehrere Kanäle" als Architekturvorgabe)?
   Muss den Fall abdecken, dass ein Mitglied das Web Push Opt-in nie erteilt hat
   (In-App bleibt in dem Fall der einzige Kanal, kein Hard-Requirement).
   Muss datenschutz-/Berechtigungslogik für das Speichern von Push-Subscriptions pro
   Mitglied (§26 Multi-Household: eine Person kann mehrere Haushalte haben, jede
   Push-Subscription gehört an sich zum Browser/Gerät, nicht zum Haushalt) berücksichtigen.
3. Wo genau müsste `TASK_AVAILABLE` emittiert werden, damit es sowohl In-App als auch
   (künftig) Push abdeckt — vermutlich beim `AVAILABLE`-Übergang in
   `runAssignmentSweep.ts` (T1-Materialisierung und T2-Publish), analog zu den
   bestehenden `TASK_ASSIGNED`/`TASK_TAKEN`-Emit-Stellen.
4. Admin-Konfigurierbarkeit (§16/§17): Soll Push pro Haushalt ein-/ausschaltbar sein,
   analog zum bestehenden `notifications.inAppEnabled`-Konfigurationsfeld?

## Acceptance Criteria

- Ergebnis ist ein Recherchedokument/Vorschlag (kein Code) mit mindestens: Bewertung
  der technischen Optionen (Web Push vs. Alternativen), grober Architekturvorschlag,
  der sich ins bestehende `Notifier`-Muster einfügt, und eine Einschätzung des aufwands
  in Phasen (z. B. "Phase 1: Server-VAPID-Keys + Subscription-Speicherung, Phase 2:
  Push-Versand bei TASK_ASSIGNED/TASK_TAKEN, Phase 3: TASK_AVAILABLE emittieren und
  einschließen").
- Reine In-App-Fallback-Fähigkeit bleibt in jedem Vorschlag erhalten — Push ist additiv,
  nicht ersetzend (§24: "mehrere Kanäle").
- Der Vorschlag benennt explizit, ob/wie `TASK_AVAILABLE` als fehlende Emit-Stelle mit
  behoben wird, da es sonst als separate Lücke bestehen bliebe.
