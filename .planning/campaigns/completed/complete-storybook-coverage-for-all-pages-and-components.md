---
version: 1
id: "c29e312a-1ae3-44a6-9e08-31efd9fc90b3"
status: complete
started: "2026-09-07T18:24:33.315Z"
completed_at: "2026-09-08T07:50:00.000Z"
direction: "Complete Storybook coverage for all pages and components"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Complete Storybook coverage for all pages and components

Status: complete
Started: 2026-09-07T18:24:33.315Z
Direction: Complete Storybook coverage for all pages and components

## Claimed Scope
- apps/web/src/pages/, apps/web/src/components/, apps/web/.storybook/

## Intake Source

- File: .planning/intake/complete-storybook-page-and-component-coverage.md
- Priority: low
- Initial Status: pending

## Delivery Brief

Storybook is already configured for `apps/web`, but coverage is incomplete. At
intake time, only 3 of 17 route-level page components and 12 of 24 shared
components have stories. Create stories for every page and component that does
not yet have one, including meaningful page-local components under
`apps/web/src/pages/`.

Current route-level pages without stories include `AccountPage`,
`AdminAuditLogPage`, `AdminCategoriesPage`, `AdminMembersPage`,
`AdminRewardsPage`, `AdminSettingsPage`, `AdminTasksPage`, `HistoryPage`,
`LedgerPage`, `LoginPage`, `OperatorLoginPage`, `RegisterPage`,
`RewardsShopPage`, and `TaskListPage`.

Current shared components without stories include `AssignmentExplanation`,
`BuyoutDisclosure`, `DurationInput`, `InstallPrompt`, `Layout`, `Nav`,
`NotificationBell`, `RewardPurchaseDisclosure`, `Sheet`, `TimeOfDayInput`,
`Toast`, and `VersionMismatchOverlay`.

Treat these lists as a discovery baseline rather than a frozen checklist: audit
the source tree when implementation begins and include any components added in
the meantime. Where a page contains a substantial, independently meaningful UI
section or repeated UI pattern, extract it into a focused component when that
improves cohesion and testability, and add stories for the extracted component.
Do not split trivial markup solely to increase the component or story count.

## Acceptance Criteria

- Every route-level `*Page.tsx` under `apps/web/src/pages/` has a colocated
  `*.stories.tsx` file, including all pages listed above and any added after this
  intake item was created.
- Every standalone visual component under `apps/web/src/components/` and every
  meaningful page-local component under `apps/web/src/pages/` has a colocated
  story. Non-visual bootstrap, provider, or adapter modules may be excluded only
  when the reason is documented in the coverage inventory or verification.
- Large or multi-responsibility page implementations are reviewed for sensible
  component extraction. Any newly extracted visual component has its own story,
  while the containing page still retains page-level stories.
- Stories cover the important user-visible states for each subject, as
  applicable: default, loading, empty, populated, error, disabled, validation,
  open/closed, permission/role, and responsive variants. Avoid redundant stories
  that do not demonstrate a distinct state.
- Page stories are deterministic and self-contained. They use the existing
  Storybook decorators and MSW setup (extended where necessary) for routing,
  application context, queries, and API responses; they do not require a live
  backend, persisted browser state, or network access.
- Story fixtures and decorators are reused where that reduces duplication, but
  remain easy to understand and override for an individual story.
- Story titles and organization follow the existing conventions so pages and
  components are easy to find in the Storybook sidebar.
- A machine-checkable inventory or equivalent verification detects missing
  stories for in-scope pages/components and supports an explicit, documented
  exclusion list for non-visual modules.
- `npm run build-storybook -w apps/web`, `npm run typecheck`, and `npm run lint`
  complete successfully, and existing tests remain green.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | in-progress | build | Implement requested change (split into batches 2A–2E below) | All 2A–2E batches complete; implementation diff available |
| 2A | complete | build | Presentational components (9 stories, no API) | Stories exist for BuyoutDisclosure, RewardPurchaseDisclosure, AssignmentExplanation, DurationInput, TimeOfDayInput, Toast, Sheet, VersionMismatchOverlay, InstallPrompt |
| 2B | complete | build | App chrome + auth pages (6 stories) | Stories exist for Layout, Nav, NotificationBell, LoginPage, RegisterPage, OperatorLoginPage |
| 2C | complete | build | Member-facing pages (7 stories) | Stories exist for TaskListPage, HistoryPage, LedgerPage, RewardsShopPage, AccountPage, PushSection, TodoistSection |
| 2D | complete | build | Admin pages + sections (12 stories) | Stories exist for AdminSettingsPage, AdminTasksPage, TaskDefinitionsSection, AdminMembersPage, MembersSection, AdminCategoriesPage, CategoriesSection, AdminRewardsPage, RewardsSection, RewardRedemptionsSection, AdminAuditLogPage, AuditLogSection |
| 2E | complete | build | Machine-checkable coverage inventory + exclusion list | `src/test/storyCoverage.test.ts` fails when an in-scope page/component lacks a story; passing as of 2026-09-08 |
| 2F | complete | build | Phantom-story remediation | No story mocks a mutation it never triggers; every story name is true |
| 3 | complete | verify | Run verification | build-storybook, typecheck, and npm run test all pass |
| 4 | complete | package | Package for review | .planning/review-packages/complete-storybook-coverage-for-all-pages-and-components.md |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | 35 new files (34 `*.stories.tsx` + `src/test/storyCoverage.test.ts`), 2 modified (`.storybook/main.ts`, `src/test/mocks/pwaRegister.ts`); no component/hook/API/mock source touched | verified | 2 | none |
| phase:3 | verification-command | test_result | yes | typecheck clean; `npm run test -w apps/web` 31 files / 181 tests pass; storyCoverage gate 3/3; `build-storybook` succeeds; `npm run build -w apps/web` still succeeds with sw.js + manifest intact; phantom-story audit clean | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/complete-storybook-coverage-for-all-pages-and-components.md | resolved | 2 | none |

## Decision Log

- 2026-09-07T18:24:33.315Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-08: **Stall diagnosis after 12 no-progress sessions.** Root cause is
  two-part, and neither part is a tool or permission failure:
  1. *Session-end markers without attention.* The 12 markers cluster at
     2026-09-07T18:24–19:33 and 2026-09-08T04:28–05:03, which is exactly when
     `.planning/verification/hook-fix-*.log`, `.planning/tmp/citadel-hook-fix/`,
     and `citadel-hook-verification.md` were being written. Those sessions were
     doing Citadel harness hook repair; this campaign was the only `active`
     campaign, so the session-end hook appended a marker to it each time
     without any session ever actually working it. The marker count is an
     artifact, not 12 failed attempts.
  2. *Phase 2 was one unbounded task.* "Implement requested change" covered
     ~34 new story files (14 pages + 12 components + 8 page-local sections).
     Any session that did engage would have faced an unbounded scope with no
     natural stopping point and no partial-credit checkpoint.
  Reason for the fix: split Phase 2 into five batches (2A–2E), each sized so a
  single wave of workers completes it, each independently verifiable, so
  partial progress survives a context boundary.

- 2026-09-08: **Workers create only new `.stories.tsx` files; nobody edits the
  shared mock modules.** Considered and rejected: a "fixture foundation" step
  extending `src/mocks/data.ts` and `src/mocks/handlers.ts` up front with every
  endpoint the 14 story-less pages need. Rejected because it serializes the
  whole campaign behind one file and makes parallel workers collide on two
  hot files. Instead each page story declares its own
  `parameters.msw.handlers` overrides and its own page-specific fixtures
  locally, reusing `mocks/data.ts` exports (`mockMembers`, `mockSession`, …)
  for shared entities only. This is already the established per-story pattern
  (`DashboardPage.stories.tsx`), keeps every worker's file set disjoint, and
  is what makes the batches safely parallel.

- 2026-09-08: Story-writing workers run on `model: haiku` per explicit user
  cost direction; orchestration, per-batch review, and verification stay at the
  default model. Each batch is reviewed and typechecked before the next
  dispatches, so Haiku output never rolls into the campaign unreviewed.

- 2026-09-08: **Review found a systemic Haiku failure mode: "phantom" stories.**
  Workers repeatedly wrote stories named for a post-interaction state
  (`SaveFailed`, `SaveInFlight`, `CreateMemberSuccess`, `AdjustPointsValidationError`,
  `FilterEmpty`, `SweepSucceeded`, …) whose only implementation is an MSW
  handler for the mutation endpoint. Nothing ever clicks the button, so the
  handler is never reached and the story renders **byte-identically to its
  populated sibling** while claiming to demonstrate a state. A scan of the
  9 story files containing `http.post|put|delete|patch` found zero `play`
  functions among them. Two workers even documented the gap in their own story
  doc comments ("filter text must be typed manually", "requires user
  interaction") and shipped the story anyway.
  This directly violates the acceptance criterion "Avoid redundant stories that
  do not demonstrate a distinct state", so it is a blocking defect, not polish.
  Remediation rule adopted: a story may keep a mutation handler only if a
  `play` function drives the interaction; otherwise the story is deleted.
  `play` is preferred when the trigger is 1–3 steps with stable accessible
  names, deletion when it needs a multi-field form filled first.
  `storybook/test` (`userEvent`, `within`) ships with Storybook 10 and is
  already resolvable, so this needs no new dependency.
  `AdminSettingsPage.stories.tsx` was rewritten by hand first as the reference
  template for the remediation wave.

- 2026-09-08: **Also found and fixed a shared-fixture mutation bug.**
  `AdminSettingsPage.stories.tsx`'s `ModifiedConfig` shallow-copied a
  module-level `AdminConfigDto` and then mutated its nested `values` in place
  inside the MSW resolver, permanently corrupting the fixture for every other
  story in the same Storybook session. Replaced the module-level constant with
  an `adminConfigFixture()` factory. Worth watching for in the other files:
  spread-then-mutate on a nested fixture is not a copy.

- 2026-09-08: **Trimmed padded stories.** `Nav` (12 stories → 5) had one story
  per route despite only three real render branches, including a `NoSession`
  story that renders identically to the MEMBER one and an `AdminOnTasks` story
  whose own doc comment admitted the route is not in the nav.
  `TimeOfDayInput` (4 → 2) had one story per clock time on a component with no
  branches at all. `Sheet` gained a static `Open` story, which was missing —
  its only visible state was behind a click.

## Active Context

Phase 2 re-decomposed into batches 2A–2E. All 12 story-writing workers have
been dispatched. Batches 2A/2B/2D largely landed; reviewing each before
acceptance. A remediation wave for phantom stories is the next dispatch.

- 2026-09-08: **`build-storybook` surfaced a latent config conflict that only a
  story could expose.** `.storybook/main.ts`'s `viteFinal` strips
  `vite-plugin-pwa`, but `VersionMismatchOverlay` imports that plugin's
  `virtual:pwa-register/react` virtual module directly. With no story for that
  component the clash never materialised; adding one broke the preview build
  outright. Fixed by aliasing the specifier to `src/test/mocks/pwaRegister.ts`,
  the same stub `vitest.config.ts` already points at for the identical reason,
  rather than by deleting the story or un-stripping the plugin.
  Follow-on detail worth remembering: `__dirname` does not exist in
  `.storybook/main.ts` (Storybook evaluates it as real ESM, while Vitest
  bundles its own config to CJS first), so the alias path is resolved from
  `import.meta.url`.
  Verified afterwards that `npm run build -w apps/web` still produces
  `dist/sw.js` and `manifest.webmanifest`, i.e. the Storybook-only alias did
  not leak into the production build.

## Continuation State

Phase: complete (all phases 1–4)
Sub-step: none — campaign delivered and packaged.
Files modified: 34 new `*.stories.tsx` under `apps/web/src/{pages,components}`,
new `apps/web/src/test/storyCoverage.test.ts`, plus two supporting edits
(`apps/web/.storybook/main.ts` alias; `apps/web/src/test/mocks/pwaRegister.ts`
doc comment). No component, hook, API-client, or mock-fixture source touched.
Coverage: 15 → 49 story files, 297 stories.
Blocking: none.
Not done deliberately: `apps/web/**` remains excluded from ESLint (pre-existing,
already tracked as its own intake item), so these files are unlinted. No commit
or PR was created — the work is staged in the working tree for review.

<!-- session-end: 2026-09-07T18:29:19.428Z -->

<!-- session-end: 2026-09-07T18:46:08.646Z -->

<!-- session-end: 2026-09-07T18:55:58.266Z -->

<!-- session-end: 2026-09-07T18:57:59.513Z -->

<!-- session-end: 2026-09-07T18:59:25.191Z -->

<!-- session-end: 2026-09-07T19:04:57.427Z -->

<!-- session-end: 2026-09-07T19:33:37.905Z -->

<!-- session-end: 2026-09-08T04:28:18.686Z -->

<!-- session-end: 2026-09-08T04:36:45.465Z -->

<!-- session-end: 2026-09-08T04:50:01.641Z -->

<!-- session-end: 2026-09-08T05:01:21.794Z -->

<!-- session-end: 2026-09-08T05:03:40.972Z -->

<!-- session-end: 2026-09-08T05:33:49.489Z -->
