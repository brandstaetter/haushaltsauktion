---
version: 1
id: "4eb30387-cede-411e-a423-90eefb1bdf79"
status: completed
started: "2026-09-04T18:37:58.822Z"
completed_at: null
direction: "Keine Code-Coverage-Messung für apps/api oder apps/web"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Keine Code-Coverage-Messung für apps/api oder apps/web

Status: completed
Started: 2026-09-04T18:37:58.822Z
Direction: Keine Code-Coverage-Messung für apps/api oder apps/web

## Claimed Scope
- apps/api/vitest.config.ts, apps/web/vitest.config.ts, apps/api/package.json, apps/web/package.json, package.json, .github/workflows/deploy.yml

## Intake Source

- File: .planning/intake/add-test-coverage-tooling.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Im Rahmen einer adversarialen Codebase-Review (Architektur, Tests, Sicherheit)
wurde geprüft, ob die Test-Coverage von `apps/api` und `apps/web` gemessen
werden kann. Ergebnis: **es gibt aktuell keinerlei Coverage-Tooling im
Projekt.**

Konkret geprüft:
- `apps/api/package.json`, `apps/web/package.json`, root `package.json`:
  keine `@vitest/coverage-v8` (oder vergleichbare) Dependency.
- `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`: kein
  `test.coverage`-Block.
- Kein `coverage`-Script in irgendeinem `package.json`.
- `.github/workflows/deploy.yml`: der `test`-Job ruft `npm run test
  --workspaces` auf, aber nirgends mit `--coverage`.

Das Testsuite selbst ist qualitativ stark — die sieben in CLAUDE.md §35
verlangten Szenarien sind namentlich als eigene `describe`-Blöcke vorhanden
(`apps/api/test/domain/economy.test.ts`), und
`apps/api/test/integration/concurrency.test.ts` erzwingt eine echte Race
über `pg_blocking_pids` statt einer Sleep-basierten Simulation. 431 Tests
(239 domain + 70 integration + 122 web) laufen aktuell grün, `tsc --noEmit`
und `eslint .` sind sauber.

Aber ohne Coverage-Zahlen lässt sich das nur qualitativ durch Lesen der
Testdateien beurteilen — eine neue Codezeile ohne zugehörigen Test fällt
weder lokal noch in CI mechanisch auf. Gerade bei einer money-kritischen
Domäne (Punkte-Ledger, Freikauf-Formeln) wäre ein Coverage-Gate ein
sinnvoller zusätzlicher Schutz gegen unbemerkt ungetestete Pfade.

## Acceptance Criteria

- `apps/api` und `apps/web` haben je ein konfiguriertes Coverage-Provider
  (z. B. `@vitest/coverage-v8`) und einen `coverage`-Script-Eintrag
  (`vitest run --coverage`).
- Ein `npm run coverage --workspaces` (oder gleichwertig) von der
  Repo-Wurzel aus erzeugt für beide Workspaces einen Report.
- CI (`deploy.yml`) erzeugt den Report zumindest als Artefakt oder
  Text-Zusammenfassung im Log; ein hartes Coverage-Minimum als Gate ist
  optional und liegt bei der Umsetzung — wichtig ist, dass Coverage-Zahlen
  ab sofort sichtbar und nicht mehr nur aus dem Testdateien-Lesen ableitbar
  sind.
- `domain/` (die reine Geschäftslogik) sollte dabei separat ausgewiesen
  werden können, da dieser Layer laut Architekturdoku die höchste Priorität
  für vollständige Abdeckung hat.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 7 files changed, 179 insertions(+), 19 deletions(-) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test --workspaces: 144+371+155 tests passed, 0 failed | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/keine-code-coverage-messung-f-r-apps-api-oder-apps-web.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T18:37:58.822Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Added `@vitest/coverage-v8@4.1.11` (pinned to match the installed
  `vitest@4.1.11`) to `apps/api` and `apps/web` rather than introducing a
  separate coverage tool (nyc, c8 standalone).
  Reason: v8 is vitest's native coverage provider — zero extra config beyond
  the `test.coverage` block, and both workspaces already run on vitest 4.
- 2026-09-04: Added `apps/api`'s `coverage:domain` script
  (`vitest run test/domain --coverage --coverage.include=src/domain/**`)
  instead of a second vitest config file.
  Reason: satisfies the acceptance criterion that `src/domain` (the pure
  business logic CLAUDE.md §43 calls highest-priority for coverage) can be
  reported separately, without duplicating `vitest.config.ts`.
- 2026-09-04: CI's `test` job now runs `npm run coverage` instead of `npm run
  test`, uploading `apps/api/coverage/` and `apps/web/coverage/` as one
  `coverage-reports` artifact (`if: always()`, 14-day retention, same pattern
  as the existing `playwright-report` upload in the `e2e` job).
  Reason: v8 instrumentation only adds tracking to the same test run — it
  does not run tests twice — so this satisfies the acceptance criterion (CI
  produces the report as an artifact + text summary in the log) without a
  second, redundant `npm run test` invocation. No hard coverage-percentage
  gate was added; the acceptance criteria said a threshold is optional, and
  the intake's actual complaint was "no numbers exist at all," not "the
  numbers are too low."

## Active Context

Phase 2 (build) and Phase 3 (verify) complete.
`@vitest/coverage-v8@4.1.11` added to `apps/api` and `apps/web`; both
`vitest.config.ts` files gained a `test.coverage` block (provider `v8`,
reporters `text`/`html`/`json-summary`, `reportsDirectory: './coverage'`,
already covered by the pre-existing root `.gitignore` `coverage/` entry).
New scripts: `coverage` in both workspaces plus the root
(`npm run coverage --workspaces --if-present`), and `coverage:domain` in
`apps/api` for a `src/domain`-only report. Verified locally:
`npm run coverage --workspaces --if-present` — web 52.72% stmts, api 74.42%
stmts (domain-only via `coverage:domain`: 90.05% stmts). `deploy.yml`'s
`test` job now runs `npm run coverage` and uploads both coverage directories
as a `coverage-reports` artifact. Full workspace test suite still passes
(144+371+155), typecheck and lint clean. Next action: Phase 4, package for
review.

## Continuation State

Phase: 4
Sub-step: implementation and verification done, packaging not started
Files modified: .github/workflows/deploy.yml, apps/api/package.json, apps/api/vitest.config.ts,
  apps/web/package.json, apps/web/vitest.config.ts, package.json, package-lock.json
Blocking: none

## Completion Record

- Completed At: 2026-09-04T18:43:06.685Z
- Outcome: review-package
- Verification: npm run test --workspaces: 144+371+155 tests passed; npm run coverage --workspaces verified locally
- Note: @vitest/coverage-v8 wired into apps/api and apps/web, root+workspace coverage scripts, apps/api coverage:domain for domain-only report, CI test job now runs npm run coverage and uploads reports as an artifact.
