---
version: 1
id: "2e0e72d4-1304-4a2a-8567-92250fa010a1"
status: completed
started: "2026-09-01T18:21:33.547Z"
completed_at: "2026-09-02T03:45:50Z"
direction: "CI: E2E-Tests gegen einen temporären Wegwerf-Stack vor dem echten Deploy"
phase_count: 4
current_phase: 4
branch: "feat/e2e-throwaway-stack"
worktree_status: null
---

# Campaign: CI: E2E-Tests gegen einen temporären Wegwerf-Stack vor dem echten Deploy

Status: completed
Started: 2026-09-01T18:21:33.547Z
Direction: CI: E2E-Tests gegen einen temporären Wegwerf-Stack vor dem echten Deploy

## Claimed Scope
- .github/workflows/deploy.yml, docker-compose.yml, e2e/, playwright.config.ts, docs/hosting-plan.md

## Intake Source

- File: .planning/intake/e2e-tests-against-throwaway-deploy.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`.github/workflows/deploy.yml` führt aktuell im `test`-Job nur
`typecheck`/`lint`/`npm run test` (Vitest, inkl. Integrationstests gegen
einen Postgres-Service-Container) aus — die Playwright-E2E-Suite (`e2e/`,
`playwright.config.ts`) läuft in CI **nicht**. Sie startet lokal API und
Web-Dev-Server per `webServer`-Konfig direkt aus dem Quellcode (`npx tsx
apps/api/src/main.ts`, Vite-Dev-Server), nicht aus den tatsächlich
gebauten Docker-Images.

`docs/hosting-plan.md` §3.1 verweist bereits darauf, dass fachliche
Korrektheit "die E2E-Suite ... abdeckt", aber diese Abdeckung existiert in
der Pipeline aktuell nicht — die Images werden nach `build-and-push` direkt
per SSH auf die Produktionsinstanz deployt (`deploy`-Job), ohne dass die
tatsächlich gebauten Container jemals gegen einen echten Browser-Flow
getestet wurden. Der Post-Deploy Health Check (§3.1) prüft nur, dass
Container hochkommen, ausdrücklich nicht die fachliche Korrektheit.

Gewünscht: ein zusätzlicher CI-Schritt, der zwischen `build-and-push` und
`deploy` (oder alternativ zusätzlich zum bestehenden `test`-Job, vor dem
Push nach ECR) einen temporären, isolierten Stack aus den frisch gebauten
Images hochfährt (z. B. per `docker compose` mit eigenem Projektnamen/Netz
und Wegwerf-Postgres — nicht die Produktionsdatenbank), die
Playwright-E2E-Suite dagegen laufen lässt, und den Stack danach wieder
vollständig abbaut — unabhängig vom Ausgang. Ein Fehlschlag muss den
Workflow vor `deploy` stoppen (kein Deploy auf rot).

Dieser Schritt soll außerdem als Teil der PR-Checks laufen, nicht nur beim
Deploy-Workflow auf `main`. `deploy.yml` triggert aktuell nur auf
`push: branches: [main]` und `workflow_dispatch` — anders als
`gitleaks.yml`, das zusätzlich `pull_request` als Trigger hat. Der neue
Wegwerf-Stack-plus-E2E-Schritt (mitsamt Image-Build, ohne den Push nach ECR
und ohne den `deploy`-Job) muss daher auch bei einem `pull_request`-Event
laufen, damit E2E-Regressionen schon vor dem Merge auffallen und nicht erst
beim Deploy von `main`.

## Acceptance Criteria

- Neuer CI-Job (oder Erweiterung eines bestehenden) baut die tatsächlichen
  Docker-Images (API + Web, ggf. wiederverwendet aus `build-and-push`) und
  startet sie zusammen mit einer eigenen, temporären Postgres-Instanz als
  Wegwerf-Stack — getrennt von Produktionsdaten/-instanz.
- Die bestehende Playwright-E2E-Suite (`e2e/*.spec.ts`) läuft gegen diesen
  Wegwerf-Stack (echte Container statt `tsx`/Vite-Dev-Server), inkl. Seed
  über `e2e/global-setup.ts` bzw. einem äquivalenten Weg für den
  Container-Betrieb.
- Der Wegwerf-Stack wird nach dem Lauf zuverlässig abgebaut (auch bei
  fehlgeschlagenen Tests) — kein Ressourcen-Leck in der CI-Umgebung.
- Schlagen die E2E-Tests fehl, bricht die Pipeline vor dem `deploy`-Job
  ab; die Produktionsinstanz wird nicht angefasst.
- CI-Laufzeit bleibt in einem vertretbaren Rahmen (die Suite ist bewusst
  `workers: 1`, nicht parallelisiert — ggf. dokumentieren, was das für die
  Gesamtlaufzeit des Workflows bedeutet).
- `docs/hosting-plan.md` §3 (Deployment-Fluss) und §10
  (Implementierte CI/CD-Artefakte) aktualisiert, damit sie den neuen Schritt
  korrekt widerspiegeln.
- Der Wegwerf-Stack-plus-E2E-Schritt läuft auch als PR-Check (Trigger
  `pull_request`, analog zu `gitleaks.yml`), unabhängig davon, ob im
  selben Lauf ein Deploy stattfindet — `build-and-push` (Push nach ECR)
  und `deploy` (SSH auf die Produktionsinstanz) dürfen dabei nicht
  mitlaufen, nur Build + Wegwerf-Stack + E2E.
- Auf `main` bleibt der bestehende Ablauf (`test` → `build-and-push` →
  `deploy`) erhalten, ergänzt um den neuen E2E-Schritt vor `deploy`; die
  vorhandenen Jobs und ihre Gates ändern sich ansonsten nicht.

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
| phase:2 | implementation-diff | file_diff | yes | `.github/workflows/deploy.yml` (new `e2e` job + `pull_request` trigger + `build-and-push`/`deploy` guards), `apps/web/Dockerfile` (`VITE_DEMO_LOGIN` build arg), `deploy/docker-compose.e2e.yml` (new CI-only overlay), `playwright.config.ts` (`E2E_EXTERNAL_SERVERS` conditional webServer), `docs/hosting-plan.md` (§3, §3.1, §10 updated) | pass | 2 | — |
| phase:3 | verification-command | test_result | yes | `npm run typecheck` clean, `npm run lint` clean, `npm run test` — 465/465 passed (shared 128, api 248, web 89); locally built both Docker images and started the full throwaway stack (`docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml -p haushaltsauktion-e2e up -d --build --wait`) — db/api/web all reported `Healthy`; confirmed the built web bundle contains the demo-login row (`grep "nur in der Demo"` on the served JS) only because `VITE_DEMO_LOGIN=true` was passed, proving the login-flow fix works against the real image. Did not run the Playwright suite itself against this local stack (would have required overwriting the developer's real, already-populated `.env`, which is out of scope to touch) — the actual E2E run happens on push via the new `e2e` CI job on a clean runner. | pass | 2 | — |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/31 | resolved | 2 | review pull request |

## Decision Log

- 2026-09-01T18:21:33.547Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01T18:45:00Z: Discovered during implementation that the existing E2E login helper (`e2e/helpers.ts`'s `loginAsDemoUser`) depends on a quick-select row in `LoginPage.tsx` that is gated by `import.meta.env.DEV` and therefore stripped from the production Vite build (`apps/web/Dockerfile`'s comment: "a demo login that survives into production is a credential bypass"). Running the unmodified E2E suite against the real built image would have failed at the first test. Found that `LoginPage.tsx` already has a deliberate escape hatch for exactly this — `showDemo = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === 'true'` — unused anywhere until now. Used it via a new Dockerfile `ARG`/`ENV` and the CI-only compose overlay's build arg, rather than weakening the DEV gate itself or rewriting the E2E login helper to type credentials directly.
  Reason: Keeps the real production image's security property (no demo login in prod) completely unchanged while making the existing E2E suite work unmodified against the throwaway stack's image — the acceptance criteria required the *existing* suite to run against the actual built containers.
- 2026-09-01T18:45:00Z: Also found the API's background sweep worker (`SWEEP_INTERVAL_SECONDS`, default 60s) would materialize due task instances during a real container run the same way `playwright.config.ts`'s comment already warns about for the `tsx`-based dev run — added the same `SWEEP_INTERVAL_SECONDS=0` override to the throwaway stack's `api` service so `flow-3`'s test-driven sweep isn't racing a live timer.
  Reason: Without this, flow-3 (random-assignment/buyout) would be flaky against the container stack specifically, in a way that wouldn't reproduce locally against the dev server.
- 2026-09-01T18:39:00Z: PR #31's first `e2e` CI run (the actual, authoritative first execution of the new job) came back red: flow-1/flow-2/mobile-layout passed, but flow-3 failed with "Keine CSRF-Token in der Sitzung gefunden" and flow-4 failed waiting for a save-confirmation toast that never appeared. Root-caused via `apps/api/src/config.ts`: `COOKIE_SECURE` defaults to `true` unless explicitly `"false"`, and README.md already documents "für lokales HTTP auf `false` setzen" — the throwaway stack is reached over plain `http://127.0.0.1`, so the `Secure`-flagged session cookie was never sent back, and every session-dependent request looked unauthenticated (flow-1/2 mostly happened not to hit this because their assertions don't route through a stale/second session read the same way). Local dev's tsx-based E2E path never hits this because the developer's own `.env` already sets `COOKIE_SECURE=false`, but the containers never read that file. Fixed by adding `COOKIE_SECURE: "false"` to the `e2e` overlay's `api` service, next to `SWEEP_INTERVAL_SECONDS`. Verified locally before re-pushing: manually seeded the throwaway stack's DB and curled the real login flow — `Set-Cookie` no longer carries `Secure`, and `/api/auth/me` now returns a populated `csrfToken`.
  Reason: Root-caused from first principles (compared what the tsx/dev-server path has that the container path doesn't) rather than retrying or loosening the test assertions — this is a genuine environment-config gap the throwaway stack needed to close, not a flaky test.
- 2026-09-01T18:49:00Z: Second `e2e` CI run: flow-3 now passes (confirms the CSRF/cookie fix), but flow-4 (admin config save) still failed the same way — "Konfiguration gespeichert." toast never observed. Root-caused to a genuine pre-existing bug in `AdminSettingsPage.tsx`, not the container setup: `useSaveConfig`'s `onSuccess` invalidates the `admin-config` query, which refetches `config` and changes its object identity; the page's `useEffect(() => { if (config) { setDraft(...); setMessage(null); } }, [config])` then fires and immediately wipes the success message it had just set — a real race between "show the confirmation" and "the save's own invalidation refetch resets it." This was invisible before because the suite never ran in CI at all, and evidently the timing happened to let it through often enough in ad-hoc local runs against the dev server. Fixed by removing `setMessage(null)` from that effect — it only needs to resync `draft` from fresh server data, not clear a message someone else just set for an unrelated reason.
  Reason: The new `e2e` CI gate did exactly its job — caught a real, reproducible correctness bug in core admin functionality (§17) that had no coverage until this campaign added it. Per CLAUDE.md §"Beende die Arbeit nicht mit offenen TODOs für Kernfunktionalität," fixed the actual bug rather than loosening the test or excluding flow-4 from the new gate.

## Active Context

Implementation, local verification, and two CI-driven fixes are done — the
new `e2e` job's first real runs surfaced two genuine bugs (missing
`COOKIE_SECURE=false` on the throwaway stack, and a pre-existing
success-message race in `AdminSettingsPage.tsx`), both root-caused and
fixed. The third `e2e` CI run on PR #31 is green (all specs pass, 3m3s);
`build-and-push`/`deploy` correctly stay skipped on this PR event.
PR #31 is open and ready for human review/merge — this session does not
merge it. The campaign stays `active` (not `completed`) until the PR is
actually merged, matching this repo's convention for delivery campaigns.

## Continuation State

Phase: 4 (implementation, verification, and CI all green; PR open for review)
Sub-step: none pending from this session — next action belongs to the reviewer (merge PR #31)
Files modified: .github/workflows/deploy.yml, apps/web/Dockerfile,
  deploy/docker-compose.e2e.yml (new), playwright.config.ts,
  docs/hosting-plan.md, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx
Blocking: none — awaiting PR review/merge (human decision)

<!-- session-end: 2026-09-02T05:13:20.899Z -->

<!-- session-end: 2026-09-02T05:30:44.990Z -->

<!-- autopilot: reconciled 2026-09-02 — PR #31 merged 2026-09-02T03:45:50Z, campaign marked completed -->
