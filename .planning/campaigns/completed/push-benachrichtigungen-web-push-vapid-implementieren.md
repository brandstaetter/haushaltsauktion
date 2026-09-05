---
version: 1
id: "1bce7184-995a-4608-8fad-0c2c2ac629e3"
status: completed
started: "2026-09-05T04:37:08.968Z"
completed_at: "2026-09-05T07:45:00.000Z"
direction: "Push-Benachrichtigungen (Web Push/VAPID) implementieren"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Push-Benachrichtigungen (Web Push/VAPID) implementieren

Status: active
Started: 2026-09-05T04:37:08.968Z
Direction: Push-Benachrichtigungen (Web Push/VAPID) implementieren

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/src/app/deps.ts, apps/api/src/app/integrations/ports.ts, apps/api/src/app/assignment/runAssignmentSweep.ts, apps/api/src/infra/http/routes/, apps/web/vite.config.ts, apps/web/src/components/NotificationBell/, packages/shared/src/config/

## Intake Source

- File: .planning/intake/push-notifications-web-push-implementation.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (25 files changed, see Decision Log for full list across sub-steps 2.1/2.2/2.2b/2.3) | passed | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run typecheck (root, clean) + npm run test -w apps/api (46 files / 398 tests) + npm run test -w apps/web (26 files / 156 tests) + npm run build -w apps/web (dist/sw.js generated) | passed | 2 | package delivery for review |
| phase:4 | review-package | review_package | yes | .planning/review-packages/push-benachrichtigungen-web-push-vapid-implementieren.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-05T04:37:08.968Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-05: Phase 2 (build) is internally sequenced as three sub-steps
  matching the research doc's own phase plan (Grundlage / Zustellung /
  TASK_AVAILABLE), each delegated to a separate sub-agent and verified with a
  full-repo typecheck + test run before advancing. Reason: the combined scope
  (Prisma model, backend port, service worker rewrite, opt-in UI, decorator
  wiring, new emit site) is too large and cross-cutting for one delegation to
  hold reliably.
- 2026-09-05: Sub-step 2.1 (Grundlage) complete. PushSubscription model +
  migration, web-push dependency, VAPID env config, PushSender port +
  production implementation, POST/DELETE subscription endpoints. Full repo
  typecheck clean, 383 tests passing (377 pre-existing + 6 new). No frontend,
  service worker, or decorator work yet — correctly out of scope for this
  sub-step.
- 2026-09-05: Sub-step 2.2 (Zustellung) complete. pushNotifier decorator
  (allowlist TASK_ASSIGNED/TASK_TAKEN, per-household pushEnabled gate read
  fresh from DB, per-member multi-device fan-out, dead-subscription cleanup
  on gone:true, never throws — verified by dedicated tests), config schema
  notifications.pushEnabled, GET /push/vapid-public-key, service worker
  switched to injectManifest (src/sw.ts) with push/notificationclick
  handlers, opt-in UI (PushSection) under "Ich" with iOS homescreen note.
  Navigation-fallback equivalence after the generateSW→injectManifest switch
  was manually verified in a real browser (killed the server, confirmed a
  deep-link navigation still loads from the SW precache) — the one part of
  this feature that could have silently regressed existing PWA behavior.
  Full repo typecheck clean; apps/api 390 tests passing (7 new), apps/web 156
  tests passing (all pre-existing, none broken); apps/web production build
  succeeds with dist/sw.js generated. Known, accepted simplification (stated
  in the phase-2 brief, not a defect): push send happens synchronously
  inside notifier.emit using a plain db client, not deferred past commit via
  an outbox — so a push can in principle fire even if the same transaction
  later fails for an unrelated reason before commit. No admin UI was added
  for pushEnabled since PUT /admin/config already covers it and the existing
  admin settings form is hand-written per field, not schema-driven.

- 2026-09-05: Sub-step 2.2b (rollback-safety fix) complete and independently
  verified: PushOutboxItem model + migration, pushNotifier.emit now only
  enqueues (inside the caller's tx, so a rollback removes the outbox rows
  automatically — confirmed by a direct regression test that throws inside a
  transaction after emit() and asserts zero surviving rows), new
  dispatchPushOutbox.ts + push-outbox-worker.ts do the actual send outside
  any transaction, single-attempt best-effort (no retry/backoff — correct
  proportionality for this feature per §43). Full repo typecheck clean;
  apps/api 395/395 tests passing.

- 2026-09-05: Sub-step 2.3 (TASK_AVAILABLE gap) complete and independently
  verified. Emits at T1 (materialize) and T2 (publish) in
  runAssignmentSweep.ts, reusing `canVolunteer` (domain/assignment/
  eligibility.ts) — the same predicate volunteerForTask.ts already uses —
  rather than the fairness-laden T4 selection machinery, since "can this
  person volunteer" must not be gated by random-assignment fairness rules.
  Allowlist extended with TASK_AVAILABLE; service worker copy lookup
  extended to match. apps/api now 46 files / 398 tests passing.
- 2026-09-05: All four build sub-steps (2.1/2.2/2.2b/2.3) complete. Ran full
  independent verification myself (not just trusting sub-agent reports):
  npm run typecheck (root, clean across shared/api/web/e2e), npm run lint
  (repo-wide, clean), npm run build (all three workspaces, clean — the web
  build confirms the injectManifest service worker actually compiles, which
  typecheck alone would not catch), npm run test -w apps/api (398/398), npm
  run test -w apps/web (156/156). Marked campaign phases 2 and 3 complete;
  Exit Evidence validated via evidence-validate.js (both PASS).

## Active Context

Build and verification complete (campaign phases 1-3). Next: campaign Phase
4 — package for review (no PR yet; this is local, uncommitted work on main).

## Continuation State

Phase: 4 (package)
Sub-step: build complete, proceeding to packaging for review
Files modified (cumulative, all uncommitted): apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260905044222_add_push_subscription/, apps/api/prisma/migrations/20260905051817_add_push_outbox_item/, apps/api/package.json, apps/api/src/config.ts, apps/api/src/app/deps.ts, apps/api/src/app/integrations/ports.ts, apps/api/src/app/notifications/{pushNotifier,dispatchPushOutbox}.ts, apps/api/src/app/assignment/runAssignmentSweep.ts, apps/api/src/main.ts, apps/api/src/infra/integrations/push-sender.ts, apps/api/src/infra/http/routes/pushSubscriptions.ts, apps/api/src/infra/http/server.ts, apps/api/src/infra/jobs/push-outbox-worker.ts, apps/api/test/integration/{push-subscriptions,push-notifier,push-outbox-dispatch,task-available-notifications}.test.ts, apps/api/test/integration/_fixture.ts, eslint-rules/index.js, packages/shared/src/config/{types,schema,defaults}.ts, apps/web/vite.config.ts, apps/web/src/sw.ts, apps/web/tsconfig.json, apps/web/tsconfig.sw.json, apps/web/src/utils/vapid.ts, apps/web/src/api/hooks.ts, apps/web/src/pages/AccountPage/{AccountPage,PushSection}.tsx, apps/web/src/strings/de.ts, README.md, docker-compose.yml
Blocking: none
Checkpoint: none (no commits made yet for this campaign; the whole working
tree above is the unit of work still to be committed/PR'd in Phase 4)

<!-- session-end: 2026-09-05T07:40:00.000Z -->
