---
version: 1
id: "2c1d9c2f-eb85-4819-b0cb-482e0b1e5c4f"
status: completed
started: "2026-09-04T12:58:20.965Z"
completed_at: "2026-09-04T15:00:47.000Z"
direction: "Recherche: Push-Benachrichtigungen für neue verfügbare Aufgaben und Zufallszuweisungen"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Recherche: Push-Benachrichtigungen für neue verfügbare Aufgaben und Zufallszuweisungen

Status: completed
Started: 2026-09-04T12:58:20.965Z
Direction: Recherche: Push-Benachrichtigungen für neue verfügbare Aufgaben und Zufallszuweisungen

## Claimed Scope
- apps/api/src/app/deps.ts, apps/api/src/app/events.ts, apps/web/vite.config.ts, apps/web/src/components/NotificationBell/

## Intake Source

- File: .planning/intake/research-push-notifications-task-available-and-assigned.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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
| phase:2 | implementation-diff | file_diff | yes | Research deliverable, not code (per acceptance criteria): .planning/research-push-notifications.md — options assessment (Web Push vs. FCM), architecture proposal (Notifier decorator, PushSubscription model, generateSW→injectManifest strategy change), 3-phase effort estimate, explicit TASK_AVAILABLE gap coverage | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | No code changed — sanity-checked full suite still green: shared 144/144, api 361/361, web 135/135 (baseline, unaffected) | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/recherche-push-benachrichtigungen-f-r-neue-verf-gbare-aufgaben-und-zufallszuweis.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T12:58:20.965Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T15:00:47.000Z: Delivered as a research document, not code, per
  the intake item's own acceptance criteria. Recommends Web Push (VAPID) over
  Firebase Cloud Messaging — no third-party account/cost, fits this
  project's "operable by a family with no sysadmin" constraint (§37), and
  `web-push` (npm) is the only new backend dependency. Key finding that
  shapes the whole proposal: the current PWA setup uses `vite-plugin-pwa`'s
  `generateSW` strategy, which cannot register custom `push`/
  `notificationclick` handlers — a future implementation would need to
  switch to `strategies: 'injectManifest'` with an owned service-worker
  source file. Proposed architecture wraps the existing `Notifier` in a
  decorator (`pushNotifier`) rather than changing its interface, so the
  transactional in-app guarantee (§24: a committed action always notifies, a
  rolled-back one never does) stays untouched and push becomes a strictly
  additive, best-effort layer. Also flagged, as instructed by the intake
  item: `TASK_AVAILABLE` is already a defined `NotificationType` with a
  German label but is never emitted anywhere — folded into Phase 3 of the
  proposal rather than left as a separate, easy-to-forget gap. Document:
  `.planning/research-push-notifications.md`.

## Active Context

All 4 phases complete. Deliverable is `.planning/research-push-notifications.md`
— ready for the user to review. No code changed, so there is nothing to PR;
the user decides whether/when to turn this into an implementation intake item.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished — research document delivered, no code to commit
Files modified: .planning/research-push-notifications.md (new)
Blocking: none
