# Delivery Review Package: Complete Storybook coverage for all pages and components

Generated: 2026-09-08T07:50:00.000Z
Outcome: review-package
Campaign: .planning/campaigns/complete-storybook-coverage-for-all-pages-and-components.md
Review Target: .planning/review-packages/complete-storybook-coverage-for-all-pages-and-components.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: main
- 35 new files under `apps/web/` (34 `*.stories.tsx` + 1 coverage test)
- 2 modified files under `apps/web/`

### Changed Files

- `apps/web/.storybook/main.ts` (modified)
- `apps/web/src/test/mocks/pwaRegister.ts` (modified — doc comment only)
- `apps/web/src/test/storyCoverage.test.ts` (new)
- 34 new `*.stories.tsx` colocated under `apps/web/src/components/` and `apps/web/src/pages/`

No component, hook, API-client, or mock-fixture source was modified. Stories
reuse the existing `.storybook/preview.tsx` decorators and declare their own
per-story MSW overrides, so `src/mocks/handlers.ts` and `src/mocks/data.ts` are
untouched.

### Diff Stat

```
 apps/web/.storybook/main.ts            | 29 +++++++++++++++++++++++++++++
 apps/web/src/test/mocks/pwaRegister.ts |  7 +++++++
 2 files changed, 36 insertions(+)
```

Plus ~5,900 lines of new story and coverage-test code across the 35 new files.

## What Was Built

Story coverage went from 15 files to 49 (297 stories). Every route-level page,
every shared component, and every page-local section now has a colocated story.

| Group | Subjects |
|---|---|
| Presentational components | BuyoutDisclosure, RewardPurchaseDisclosure, AssignmentExplanation, DurationInput, TimeOfDayInput, Toast, Sheet, VersionMismatchOverlay, InstallPrompt |
| App chrome | Layout, Nav, NotificationBell |
| Auth pages | LoginPage, RegisterPage, OperatorLoginPage |
| Member pages | TaskListPage, HistoryPage, LedgerPage, RewardsShopPage, AccountPage, PushSection, TodoistSection |
| Admin pages + sections | AdminSettingsPage, AdminTasksPage, AdminMembersPage, AdminCategoriesPage, AdminRewardsPage, AdminAuditLogPage, TaskDefinitionsSection, MembersSection, CategoriesSection, RewardsSection, RewardRedemptionsSection, AuditLogSection |

### Two source-adjacent changes, and why they were necessary

1. **`.storybook/main.ts` — alias for `virtual:pwa-register/react`.**
   `viteFinal` deliberately strips `vite-plugin-pwa` (its own comment explains
   why: the plugin's precache limit fails on Storybook's bundle). But
   `VersionMismatchOverlay` imports that plugin's virtual module directly.
   Before this campaign the component had no story, so it was never pulled into
   the preview bundle and the conflict was latent. Giving it a story surfaced a
   hard build failure: `Rollup failed to resolve import "virtual:pwa-register/react"`.
   Fixed by aliasing the specifier to the stub `vitest.config.ts` already uses
   for the identical reason. `__dirname` is unavailable here (Storybook loads
   `main.ts` as real ESM, unlike Vitest which bundles its config to CJS), so the
   path is derived from `import.meta.url`.

2. **`src/test/mocks/pwaRegister.ts` — doc comment only.** Records that
   Storybook is now a second consumer of the stub. No behaviour change.

### Coverage gate

`apps/web/src/test/storyCoverage.test.ts` walks `src/components/` and
`src/pages/`, and fails when any `.tsx` that is not a test or a story lacks a
colocated `*.stories.tsx`. It supports a documented `EXCLUSIONS` map (currently
empty — every module in both trees turned out to be visual) and also fails on
*stale* exclusions, so the list cannot drift from the source tree. A guard test
asserts the walk found subjects at all, so the suite cannot pass vacuously.

## Reviewer Notes — where to look hardest

- **`PushSection.stories.tsx`** is the most intricate file. Its states are
  driven by browser globals (`Notification.permission`,
  `navigator.serviceWorker.ready.pushManager.getSubscription()`), not by the
  API, so it installs and tears down stubs around each story. The
  subscribe/unsubscribe *error* states are deliberately absent and the reason is
  documented in the file header — reaching them needs a live push service.
- **`play` functions** were added where a story's name claims a post-interaction
  state (auth form submissions, admin save/sweep, category filter, reward
  purchase). These run in the Storybook UI, not in `build-storybook`, so a
  broken selector would not fail the build. Worth a spot-check in a running
  Storybook.
- **`apps/web/**` is excluded from ESLint** by `eslint.config.js`'s `ignores`,
  so none of these 34 files are linted. Not addressed here (out of scope), but
  it means lint provides no safety net for this delivery. Note a campaign named
  `apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet` is already
  marked complete while the exclusion is still in place — worth a look
  independently of this review, as one or the other appears out of date.
- Story fixtures are declared locally per story file rather than added to
  `src/mocks/data.ts`. This was a deliberate call to keep 12 parallel workers
  off two shared files; the tradeoff is some fixture duplication across admin
  stories, which a reviewer may want to consolidate later.

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | 35 new files (34 `*.stories.tsx` + `src/test/storyCoverage.test.ts`), 2 modified (`.storybook/main.ts`, `src/test/mocks/pwaRegister.ts`). No component/hook/API/mock source modified. | verified | pass |
| phase:3 | verification-command | test_result | yes | See Verification below. | verified | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/complete-storybook-coverage-for-all-pages-and-components.md | resolved | pass |

## Verification

All run after the final change:

- `npm run typecheck` (root: base tsconfig + `apps/web` + e2e) — clean.
- `npm run test -w apps/web` — 31 files, 181 tests, all pass.
- `apps/web/src/test/storyCoverage.test.ts` — 3/3 pass; zero uncovered
  subjects, zero stale exclusions.
- `npm run build-storybook -w apps/web` — succeeds (after the
  `virtual:pwa-register/react` alias fix described above).
- `npm run build -w apps/web` — the real app build still succeeds
  independently, with `dist/sw.js` and `manifest.webmanifest` intact, confirming
  the Storybook-only alias did not leak into the production build.
- `npm run lint` — 8 errors remain, all pre-existing and all in stray
  out-of-scope copies of the repo (`codex-oss/`, `.claude/worktrees/claude/`);
  zero in `apps/web`. Note `apps/web/**` is ESLint-excluded by config, so this
  is not evidence of story quality.
- Phantom-story audit (mutation handler present, `play` absent) — clean across
  all 49 story files.

---HANDOFF---
- Review target: .planning/review-packages/complete-storybook-coverage-for-all-pages-and-components.md
- Campaign: .planning/campaigns/complete-storybook-coverage-for-all-pages-and-components.md
- Evidence readiness: ready
---
