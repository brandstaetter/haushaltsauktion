---
version: 1
id: "a6432057-dd94-4442-96db-3ca0c5d940bd"
status: completed
started: "2026-09-04T15:50:13.491Z"
completed_at: "2026-09-04T18:20:00.000Z"
direction: "Update-Check unzuverlässig: Versionsprüfung bei jedem Backend-Call statt SW-Lifecycle, sofortiges blockierendes Reload-Overlay"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Update-Check unzuverlässig: Versionsprüfung bei jedem Backend-Call statt SW-Lifecycle, sofortiges blockierendes Reload-Overlay

Status: completed
Started: 2026-09-04T15:50:13.491Z
Direction: Update-Check unzuverlässig: Versionsprüfung bei jedem Backend-Call statt SW-Lifecycle, sofortiges blockierendes Reload-Overlay

## Claimed Scope
- apps/api/src/infra/http/server.ts, apps/web/src/api/client.ts, apps/web/src/components/UpdatePrompt/UpdatePrompt.tsx, apps/web/vite.config.ts
- Grown during Phase 2 (see Decision Log): apps/api/src/config.ts, apps/api/Dockerfile,
  apps/web/Dockerfile, .github/workflows/deploy.yml, apps/web/src/App.tsx,
  apps/web/src/api/operatorClient.ts, apps/web/src/api/versionCheck.ts (new),
  apps/web/src/env.d.ts, apps/web/src/strings/de.ts,
  apps/web/src/components/VersionMismatchOverlay/ (new, replaces UpdatePrompt/),
  plus test files for all of the above and apps/api/test/integration/app-version-header.test.ts (new)

## Intake Source

- File: .planning/intake/reliable-update-check-forced-reload-overlay.md
- Priority: urgent
- Initial Status: pending

## Delivery Brief

Der aktuelle Update-Mechanismus (intake "notify-on-new-deploy-and-refresh-cache",
bereits umgesetzt) basiert ausschließlich auf `vite-plugin-pwa`s
Service-Worker-Lifecycle: `registerType: 'prompt'` in `apps/web/vite.config.ts:22`,
`useRegisterSW()` in `UpdatePrompt.tsx` liefert `needRefresh`, sobald der Browser
selbst einen neuen Service Worker registriert. Das Problem daran (Nutzerbeschwerde):
Browser prüfen einen registrierten Service Worker standardmäßig nur bei
Navigation/Tab-Neuladen auf ein Update, nicht bei jedem API-Call — es gibt keinen
konfigurierten `periodicSync`/Intervall-Check (`vite.config.ts` VitePWA-Block hat
kein `onRegisteredSW` mit `setInterval(() => registration.update(), …)`). Bei einem
langlebigen offenen Tab (die App pollt laut `UpdatePrompt.tsx`-Kommentar ohnehin
`/dashboard`/`/notifications` alle 30s) kann es deshalb mehrere manuelle
Neuladevorgänge dauern, bis der Browser den neuen Service Worker überhaupt bemerkt.

Gewünschte Änderung — zwei Teile:

1. **Versionsprüfung bei jedem Backend-Call statt SW-Polling.** `apps/api/src/infra/http/server.ts:36`
   (`buildServer`) ist der zentrale Fastify-Bootstrap-Punkt, an dem bereits Hooks
   registriert werden (`app.addHook('preHandler', …)`, Zeile 61/66) — ein `onSend`-Hook
   dort könnte auf **jede** Antwort einen Versions-/Build-Identifier-Header setzen
   (z. B. `X-App-Version`, gespeist aus Git-SHA/Build-Timestamp zur Deploy-Zeit statt
   `package.json`s statischer `0.1.0`, die pro Deploy nie erhöht wird). Der einzige
   Funnel-Punkt für jeden Frontend-Request ist bereits vorhanden:
   `apps/web/src/api/client.ts:29` (`api()`), durch den jeder Backend-Call läuft —
   dort könnte der Header bei jeder Antwort gegen eine zur Build-Zeit ins Frontend
   eingebettete Version verglichen werden (aktuell existiert keine solche
   Build-Zeit-Konstante — kein `import.meta.env.VITE_APP_VERSION` o. Ä. in
   `vite.config.ts`, das müsste neu eingeführt werden).
2. **Sofortiges blockierendes Overlay statt dismissbarem Banner.** `UpdatePrompt.tsx`
   zeigt heute laut eigenem Kommentar bewusst ein dismissbares Banner mit
   erforderlichem Klick, keine automatische Aktualisierung — Begründung dort: ein
   langlebiger Tab soll nicht "unter den Füßen" der Nutzerin plötzlich neu laden,
   während sie gerade mit Punktesalden/Aufgabenwerten arbeitet (vgl. CLAUDE.md §31
   "keine manipulativen Dark Patterns", was hier eher für "kein erzwungenes
   Verhalten" als für "kein Blockieren" stand). Der neue Wunsch kehrt das explizit
   um: sobald eine neue Version erkannt wird, soll sofort ein Overlay erscheinen,
   das die gesamte UI blockiert (keine Interaktion mehr möglich) und einen Reload
   erzwingt — kein Dismiss, keine Wahl.

## Acceptance Criteria

- Jede Antwort des Backends (nicht nur eine dedizierte Version-Route) trägt einen
  Versions-/Build-Identifier, der sich bei jedem Deploy ändert (Git-SHA oder
  Build-Timestamp — nicht `package.json`s manuell gepflegte Semver, die aktuell
  nie erhöht wird).
- Das Frontend vergleicht diesen Identifier bei **jedem** API-Aufruf (über den
  zentralen `api()`-Funnel in `apps/web/src/api/client.ts`, nicht punktuell pro
  Seite) gegen die zur Build-Zeit ins Bundle eingebettete eigene Version.
- Sobald ein Mismatch erkannt wird, erscheint sofort ein Overlay, das die gesamte
  Seite blockiert (keine weiteren Klicks/Eingaben möglich) und einen Reload
  erzwingt — ohne Dismiss-Option.
- Der bestehende service-worker-basierte Mechanismus (`UpdatePrompt.tsx`,
  `registerType: 'prompt'`) wird im Rahmen dieses Tickets bewusst abgelöst oder
  ergänzt (zu entscheiden im Briefing, siehe Spannungspunkt oben) — nicht
  stillschweigend beide parallel unkoordiniert weiterlaufen lassen.
- Der neue Header-Vergleich darf keine falsch-positiven Reloads durch Caching
  auslösen (z. B. ein von einem Proxy/Service-Worker gecachtes altes `api()`-Response
  mit veraltetem Header) — `workbox.navigateFallbackDenylist` schließt `/api/*`
  bereits von SW-Caching aus (`vite.config.ts:34`), das bleibt so.
- Serverseitig verbindlich (§36): der Versions-Header ist rein informativ für den
  Client, keine Autorisierungs- oder Geschäftslogik hängt clientseitig daran.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (11 tracked files, +81/-15) + 6 new files (versionCheck.ts + 5 tests) + UpdatePrompt/ deleted (3 files) | verified | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run test: 636/636 passed (shared 144, api 347, web 145); npm run typecheck: clean; npm run lint -w apps/web: clean; eslint on changed api files: clean; manual Docker build + boot smoke test confirmed X-App-Version header and baked-in VITE_APP_VERSION; manual browser verification of the overlay (dev server, forced mismatch) confirmed render, updateServiceWorker(true) call, and forced reload | pass | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T15:50:13.491Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Resolved the intake's own flagged tension ("replace or escalate"):
  chose to fully replace `UpdatePrompt`'s dismissible-banner mechanism with the
  new blocking overlay, rather than layering it as an escalation tier. Reason:
  the user's phrasing ("immediately", "forces a reload", "no longer allow
  interactions") was explicit and literal, not a soft nudge; and since
  deploy.yml builds+deploys api and web from the same commit atomically, the
  two signals (SW update lifecycle vs. API version header) detect essentially
  the same real-world event, so keeping both running independently would only
  add confusing, differently-timed duplicate prompts for no benefit.
- 2026-09-04: Version identifier chosen as the short Git SHA already computed
  in deploy.yml's `build-and-push` job (`steps.tag.outputs.value`), baked into
  each image at Docker build time (`ARG`/`ENV`, same pattern as the existing
  `VITE_DEMO_LOGIN` precedent in apps/web/Dockerfile) — NOT a runtime env var
  synced via the `deploy` job's SSH script into the instance's `.env`.
  Deliberately avoided touching the SSH deploy script / docker-compose.prod.yml
  / secrets sync at all: that is the genuinely hard-to-reverse, production-risk
  part of the pipeline, and the existing `build-and-push` job already computes
  and needs no new secrets to pass this value through. Also rejected a
  runtime-random boot-id (crypto.randomUUID() per process start) — cheaper but
  would false-positive on every replica boot if the API is ever horizontally
  scaled (a scenario this same codebase's docs/todoist.md already treats as
  plausible), since each replica would mint its own value independent of
  actual deploys.
- 2026-09-04: Both `client.ts`'s `api()` and `operatorClient.ts`'s
  `operatorApi()` (a deliberately separate funnel, see its own file comment)
  now call a shared `checkVersionHeader()` — the acceptance criterion says
  "jedem API-Aufruf", and the operator dashboard is part of the same SPA/tab
  (same `App.tsx`, same `VersionMismatchOverlay` mount point), so leaving the
  operator plane uncovered would silently miss operator-only sessions.
- 2026-09-04: Manual browser verification (dev servers, `VITE_APP_VERSION`
  deliberately mismatched) caught a real bug before it shipped:
  vite-plugin-pwa's **dev-mode** `updateServiceWorker` stub
  (`client/dev/react.js`) is synchronous and returns `undefined`, unlike the
  production build's async, Promise-returning version — `.catch()` on the
  dev-mode return value threw and crashed the whole app. Fixed by wrapping in
  `Promise.resolve(...)` so both shapes are handled uniformly. This would not
  have been caught by the test suite alone (tests mock the hook), which is
  exactly why the manual dev-server check was run per CLAUDE.md's UI-change
  guidance.
- 2026-09-04: `registerType: 'prompt'` kept as-is (not reverted to
  `'autoUpdate'`) — it's still what lets `VersionMismatchOverlay` explicitly
  drive the skip-waiting message itself right before its own forced reload,
  rather than the service worker silently activating on an independent
  schedule. Updated its vite.config.ts comment to describe the new role
  instead of the superseded `UpdatePrompt` reasoning.

## Active Context

Phases 1-3 complete: implementation done (server-side X-App-Version header,
Docker/CI build-arg plumbing, client-side version check on every funnel,
new blocking VersionMismatchOverlay replacing UpdatePrompt), full test suite
green (636/636), typecheck and lint clean, Docker build + boot smoke-tested,
and the overlay manually verified end-to-end in a browser against real dev
servers (which caught and fixed a dev-mode-only crash). Next action:
Phase 4 — package for review (node .citadel/scripts/package-delivery.js {slug}).

## Continuation State

Phase: 4
Sub-step: implementation and verification complete; packaging not started
Files modified: see Claimed Scope above (11 tracked files modified, 3 deleted
  — UpdatePrompt/ — 9 new files created)
Blocking: none
checkpoint-phase-2: none (no git stash checkpoint taken — same rationale as
  the prior multi-worker-vanish-from-list campaign: untracked campaign/intake
  files in this working tree get swept up by a full-repo stash, making it
  impractical here; per-file diff review used instead)
