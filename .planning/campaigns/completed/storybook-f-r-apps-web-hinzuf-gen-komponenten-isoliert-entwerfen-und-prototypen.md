---
version: 1
id: "af74a849-7d14-4b94-985b-aa3740d7c79c"
status: completed
started: "2026-09-02T20:25:22.068Z"
completed_at: "2026-09-02T22:38:00.000Z"
direction: "Storybook für apps/web hinzufügen — Komponenten isoliert entwerfen und prototypen"
phase_count: 4
current_phase: 3
branch: null
worktree_status: null
---

# Campaign: Storybook für apps/web hinzufügen — Komponenten isoliert entwerfen und prototypen

Status: completed
Started: 2026-09-02T20:25:22.068Z
Direction: Storybook für apps/web hinzufügen — Komponenten isoliert entwerfen und prototypen

## Claimed Scope
- apps/web/package.json, apps/web/.storybook/, apps/web/src/components/**/*.stories.tsx

## Intake Source

- File: .planning/intake/add-storybook-for-component-prototyping.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Aktuell gibt es keine Möglichkeit, die Komponenten aus `apps/web/src/
components/` (`Button`, `TaskCard`, `Nav`, `Sheet`, `Toast`, `ValueChip`,
`StatusBadge`, `CategoryBadge`, `DurationInput`, `TimeOfDayInput`,
`AssignmentExplanation`, `BuyoutDisclosure`, `NotificationBell`,
`InstallPrompt`, `Layout` — 15 Komponenten) isoliert von der laufenden
Anwendung zu betrachten oder mit neuen Varianten zu experimentieren. Jede
Komponente hat ihr eigenes CSS-Module (`*.module.css`) und folgt den
zentralen Design-Tokens in `apps/web/src/styles/tokens.css`/`global.css`;
ein Prototyping-Wechsel erfordert heute, die App lokal zu starten und
manuell zum passenden Screen zu navigieren.

Storybook würde erlauben, jede Komponente einzeln mit ihren Props/States
zu rendern (z. B. `Button` in allen Größen/Varianten, `TaskCard` in den
verschiedenen `TaskInstance`-Status, `Sheet`/`Toast` in offenem/
geschlossenem Zustand), ohne Backend oder Routing.

Relevanter Stack (`apps/web/package.json`): Vite 6, React 19, TypeScript
~5.9, CSS Modules, Vitest 4 als Testrunner, ESLint 9 (flat config, siehe
Root-`eslint.config.*`). Storybook muss mit dem vorhandenen Vite-Setup
(`@storybook/react-vite`) statt Webpack laufen, und darf die bestehende
Vite-Config/PWA-Plugin-Konfiguration (`vite-plugin-pwa`) nicht stören.

## Acceptance Criteria

- Storybook (aktuelle Major-Version, Vite-Builder `@storybook/react-vite`)
  ist als Dev-Dependency in `apps/web` (nicht root) installiert und per
  `npm run storybook -w apps/web` (oder gleichwertigem Skript in `apps/
  web/package.json`) lokal startbar.
- Mindestens 3-5 bestehende Komponenten (z. B. `Button`, `TaskCard`,
  `StatusBadge`) bekommen eine `*.stories.tsx`-Datei neben der
  Komponente, die ihre wichtigsten Prop-Varianten zeigt — als
  Grundmuster für weitere Stories, nicht als vollständige Abdeckung
  aller 15 Komponenten.
- Design-Tokens (`apps/web/src/styles/tokens.css`, `global.css`) werden
  in Storybook geladen, sodass Farben/Typografie/Spacing wie in der
  echten App aussehen — keine isolierte, abweichende Storybook-eigene
  Stildatei.
- Storybook-Build/-Start ist von CI und vom normalen `npm run build`/
  `npm run dev`-Workflow der App unabhängig — läuft nicht automatisch in
  bestehenden Skripten mit, bricht sie nicht.
- `npm run typecheck` und `npm run lint` (Root-Skripte) bleiben grün mit
  den neuen Storybook-Konfigurationsdateien und Story-Dateien im Baum
  (ESLint-Konfiguration ggf. um Storybook-Dateien/-Regeln ergänzen, falls
  nötig).
- Kurzer Hinweis in `apps/web`s README oder Root-`README.md`, wie
  Storybook lokal gestartet wird.

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
| phase:2 | implementation-diff | file_diff | yes | 4 files changed (insertions/deletions across .gitignore, README.md, apps/web/package.json, package-lock.json) plus 6 new files/dirs (apps/web/.storybook/main.ts, apps/web/.storybook/preview.tsx, and 5 new *.stories.tsx files under apps/web/src/components/). See Decision Log for the full list. | verified | 2 | proceed to phase 3 verification |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test --workspaces: shared 138/138, api 270/270, web 110/110 — all pass. npm run build-storybook -w apps/web: succeeds, 34 stories indexed, no PWA artifacts leaked. npm run build -w apps/web (real app build): still succeeds independently with sw.js/manifest intact. Independently re-run outside the build agent's own session, matching its reported results exactly. | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/storybook-f-r-apps-web-hinzuf-gen-komponenten-isoliert-entwerfen-und-prototypen.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T20:25:22.068Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-02: Implemented Phase 2 (build). Installed `storybook@^10.6.0` and
  `@storybook/react-vite@^10.6.0` as devDependencies in `apps/web` only
  (`npm install -D -w apps/web`), not at the repo root. Chose the current
  Storybook major (10.x) with the Vite framework/builder explicitly, per the
  acceptance criteria (no Webpack). Added `apps/web/.storybook/main.ts` and
  `apps/web/.storybook/preview.tsx`, plus two new npm scripts in
  `apps/web/package.json`: `storybook` (`storybook dev -p 6006`) and
  `build-storybook` (`storybook build`) — neither is referenced by any root
  script (`build`, `dev`, `test`, `typecheck`, `lint`), so Storybook stays a
  standalone dev tool and does not run in CI.

  `@storybook/react-vite` auto-merges the project's own `apps/web/vite.config.ts`
  (same directory as `.storybook/`), which is what makes the `react()` plugin,
  CSS Modules handling, and the `@` alias behave identically to the real app —
  but it also pulled in `vite-plugin-pwa`, which tried to precache Storybook's
  own (much larger, dev-only) JS bundle and failed the build past the default
  2 MiB Workbox limit. Fixed by filtering `vite-plugin-pwa`'s plugins out of
  the merged config in `main.ts`'s `viteFinal` hook (flattening nested/async
  `PluginOption`s first, since `VitePWA()` returns a nested plugin array) —
  deliberately done in `.storybook/main.ts` rather than by touching
  `apps/web/vite.config.ts`, which should stay ignorant of Storybook entirely.
  Verified afterwards that the normal `npm run build -w apps/web` still
  produces `dist/sw.js` and the PWA manifest unaffected.

  `preview.tsx` imports the same `src/styles/global.css` that `src/main.tsx`
  imports (which itself `@import`s `tokens.css`), so components render with
  the app's real colors/typography/spacing — confirmed visually via a headless
  Chrome check on the `TaskCard` story (dark-theme tokens, category badge
  color, and button accent color all matched the app, zero console errors
  beyond an unrelated missing `favicon.ico`). Added a `StringsProvider`
  decorator in `preview.tsx` because most components read German UI copy via
  `useStrings()` (`src/context/StringsContext.tsx`) and throw without it —
  `App.tsx` wraps the whole app in the same provider, so this mirrors real
  usage rather than working around it.

  Wrote `*.stories.tsx` for 5 components (chosen for variety and for
  requiring no live backend data): `Button` (variant/size/loading/icon
  combinations), `StatusBadge` (every `TaskStatus` value plus an
  unrecognized-status fallback case), `ValueChip` (base value through
  multiple buyout tiers, matching §9's default `MULTIPLIER × 1.5` ceil
  progression 4→6→9→14), `CategoryBadge` (colored/no-color/invalid-hex, one
  story per branch in `readableTextColor`), and `TaskCard` (a
  `makeTask()` helper builds a full `AvailableTaskDto` mock, with stories for
  AVAILABLE/ASSIGNED/COMPLETED status, after-buyout value, due-today,
  overdue, and not-eligible states). These match the campaign's suggested
  candidates (Button, TaskCard, StatusBadge) plus two more for a slightly
  wider pattern to copy from.

  Verified: `npm run typecheck` and `npm run lint` (both root scripts) stay
  clean with the new `.storybook/` files and story files in the tree — no
  ESLint config changes were needed (`apps/web/eslint.config.js`'s type-aware
  `parserOptions.project` rule only targets `src/**/*.ts(x)`, and its base
  recommended configs don't require type info, so `.storybook/*.ts(x)` lints
  fine without a tsconfig entry; the root `eslint.config.js` already ignores
  `apps/web/**` entirely, so it was never at risk). `npx storybook build`
  (via `npm run build-storybook -w apps/web`) succeeds and produces
  `storybook-static/` with all 34 stories indexed; added `storybook-static/`
  to the root `.gitignore` since it's a build artifact, matching how
  `dist/`/`build/` are already handled.

- 2026-09-02T22:37:00Z: Phase 3 (verify) run independently, outside the build
  agent's own session: typecheck clean, lint clean, full workspace test suite
  green (shared 138/138, api 270/270, web 110/110), `build-storybook` and the
  real app `build` both re-run successfully and independently of each other,
  confirming the PWA-plugin filter fix holds and Storybook stays fully
  isolated from the production build. Cleaned up the `storybook-static/` and
  `apps/web/dist/` artifacts this verification pass generated (both
  gitignored, not committed either way).
  Reason: independent re-verification per Archon protocol step 5.

## Active Context

Phase 2 (build) and Phase 3 (verify) are both done, the latter independently
re-run and matching the build agent's reported results exactly. Next action:
phase 4 (package for review).

## Completion Record

- Completed At: 2026-09-02T22:38:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting the same commit/PR go-ahead pattern as the other campaigns this
  session)
- Verification: npm run typecheck, npm run lint, npm run test --workspaces
  all pass; npm run build-storybook -w apps/web and npm run build -w apps/web
  both succeed independently
- Open items for reviewer: (1) Storybook 10.6.0 was resolved live from npm
  rather than pinned to a known-good version at write time — worth
  reconfirming currency if this sits unmerged for a while; (2) the
  `viteFinal` PWA-plugin filter in `.storybook/main.ts` matches on
  `plugin.name?.startsWith('vite-plugin-pwa')`, a naming convention rather
  than an official API — fail-safe (a future major bump would fail the
  Storybook build loudly, not silently leak PWA artifacts), but worth knowing
  if `vite-plugin-pwa` is ever upgraded.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: .gitignore, README.md, apps/web/package.json,
  package-lock.json, apps/web/.storybook/main.ts (new),
  apps/web/.storybook/preview.tsx (new),
  apps/web/src/components/Button/Button.stories.tsx (new),
  apps/web/src/components/StatusBadge/StatusBadge.stories.tsx (new),
  apps/web/src/components/ValueChip/ValueChip.stories.tsx (new),
  apps/web/src/components/CategoryBadge/CategoryBadge.stories.tsx (new),
  apps/web/src/components/TaskCard/TaskCard.stories.tsx (new)
Blocking: none
