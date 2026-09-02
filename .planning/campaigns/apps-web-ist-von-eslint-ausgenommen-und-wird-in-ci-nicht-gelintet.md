---
version: 1
id: "4a01e83d-3350-4b6e-9916-ab659985ae4a"
status: complete
started: "2026-09-02T07:42:10.601Z"
completed_at: "2026-09-02T09:45:00.000Z"
direction: "apps/web ist von ESLint ausgenommen und wird in CI nicht gelintet"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: apps/web ist von ESLint ausgenommen und wird in CI nicht gelintet

Status: complete
Started: 2026-09-02T07:42:10.601Z
Direction: apps/web ist von ESLint ausgenommen und wird in CI nicht gelintet

## Claimed Scope
- eslint.config.js, .github/workflows/deploy.yml, apps/web/vitest.config.ts

## Intake Source

- File: .planning/intake/web-lint-not-in-ci.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Während der Arbeit an den Kategorien-Sektionen (`CategoriesSection.tsx`,
`MembersSection.tsx`) fiel auf: `apps/web/vitest.config.ts` hat einen
ESLint-Fehler (`@typescript-eslint/triple-slash-reference` — eine
Triple-Slash-Referenz auf `vitest/config` statt eines `import`).

Der Fehler taucht aber **nicht** auf, wenn CI läuft — nur wenn man `eslint .`
direkt in `apps/web/` ausführt. Grund: `eslint.config.js` (Root) schließt
`apps/web/**` explizit aus (`ignores: [..., 'apps/web/**']`, Zeile 66) — das
war offenbar beabsichtigt für die Backend-spezifischen Architekturregeln
(§7.4-Importmatrix etc.), die für React/Vite-Code nicht gelten. `apps/web`
hat aber sein eigenes, unabhängiges `eslint.config.js`-Setup und einen
eigenen `lint`-Script-Eintrag (`apps/web/package.json`: `"lint": "eslint ."`).

Das Problem: `.github/workflows/deploy.yml`s `test`-Job (Zeile 47-56) ruft
nur das Root-`npm run lint` auf (`eslint .` von der Repo-Wurzel aus) —
wegen des `apps/web/**`-Ignores lintet das nichts in `apps/web`. Es gibt
sonst keinen CI-Schritt, der `apps/web`s eigenes `npm run lint` ausführt.
Damit ist der komplette Frontend-Code aktuell in CI **ungelintet** — ein
Lint-Fehler in `apps/web` (wie der obige) wird nie einen CI-Lauf rot
einfärben, egal wie offensichtlich er lokal ist.

Root-`npm run lint` selbst läuft sauber durch (bestätigt lokal), weil es
`apps/web` gar nicht erst betritt — das täuscht eine grüne CI vor, obwohl
ein ganzer Workspace am Lint-Gate vorbeiläuft.

## Acceptance Criteria

- Der bestehende `@typescript-eslint/triple-slash-reference`-Fehler in
  `apps/web/vitest.config.ts` ist behoben (Triple-Slash-Referenz durch einen
  passenden `import`-Weg ersetzt), sodass `npm run lint -w apps/web` sauber
  durchläuft.
- `apps/web` wird tatsächlich in CI gelintet — entweder indem
  `deploy.yml`s `test`-Job einen zusätzlichen Schritt bekommt (z. B.
  `npm run lint -w apps/web` bzw. `npm run lint --workspaces`), oder indem
  das Root-`eslint.config.js` so erweitert wird, dass es `apps/web` mit
  einem für den React/Vite-Code passenden Regelsatz mit abdeckt. Die Wahl
  zwischen beiden Ansätzen liegt bei der Umsetzung — entscheidend ist, dass
  ein Lint-Fehler in `apps/web` künftig einen CI-Lauf rot einfärbt.
- Nach der Änderung läuft CI (`test`-Job) weiterhin grün auf dem aktuellen
  `main`-Stand (abgesehen vom oben behobenen, vorbestehenden Fehler).

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: apps/web/vitest.config.ts (-1, removed redundant triple-slash reference), .github/workflows/deploy.yml (+5, new `npm run lint -w apps/web` step in the `test` job) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run lint (root): clean; npm run lint -w apps/web: clean (triple-slash-reference error resolved); npm run typecheck (root + web + e2e): clean; npm run test --workspaces --if-present: shared 128 tests, api 249 tests, web 107 tests, all passed | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T07:42:10.601Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

## Active Context

Delivery complete. Removed the redundant triple-slash reference in
`apps/web/vitest.config.ts` (fixes the `@typescript-eslint/triple-slash-reference`
lint error) and added an `npm run lint -w apps/web` step to the `test` job in
`.github/workflows/deploy.yml`, so a lint error in apps/web now fails CI.
Root lint, apps/web lint, full typecheck, and all workspace test suites
(shared/api/web) verified green locally. Ready for review/merge.

## Continuation State

Phase: 4 (complete)
Sub-step: none — campaign complete
Files modified: apps/web/vitest.config.ts, .github/workflows/deploy.yml
Blocking: none
