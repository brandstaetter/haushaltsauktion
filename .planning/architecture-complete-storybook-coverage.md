# Architecture: Complete Storybook Page and Component Coverage
> Spec: `.planning/intake/complete-storybook-page-and-component-coverage.md` plus the 2026-09-06 `citadel:grill` decisions | Mode: feature | Date: 2026-09-06

## Baseline

- Storybook 10.6 with the Vite builder, global application styles, MemoryRouter,
  QueryClient, StringsProvider, and MSW is already configured.
- The source audit found 49 in-scope production TSX modules: 24 shared component
  modules, 17 route pages, and 8 exported page-local sections.
- Fifteen colocated story files currently exist. Thirty-four in-scope modules
  currently lack a story file: 12 shared components, 14 route pages, and 8
  exported page-local sections.
- `npm run typecheck -w apps/web`: pass on 2026-09-06.
- `npm run lint -w apps/web`: pass on 2026-09-06.
- `npx vitest run` from `apps/web`: 30 files and 178 tests passed on 2026-09-06.
  The first sandboxed invocation could not let esbuild traverse its config path;
  the same command passed outside that filesystem restriction, so this is an
  execution-environment limitation rather than a repository failure.

## File Tree

Feature mode: only new (`+`) and modified (`~`) files are listed. The list is
complete for the planned implementation.

```text
~ README.md
~ apps/web/package.json
~ apps/web/vitest.config.ts
~ apps/web/.storybook/preview.tsx
~ apps/web/src/mocks/data.ts
~ apps/web/src/mocks/handlers.ts
+ apps/web/src/storybook/storySupport.tsx
+ apps/web/src/storybook/storyCoverage.ts
+ apps/web/src/storybook/storyCoverage.test.ts

+ apps/web/src/components/AssignmentExplanation/AssignmentExplanation.stories.tsx
+ apps/web/src/components/BuyoutDisclosure/BuyoutDisclosure.stories.tsx
~ apps/web/src/components/CategoryCard/CategoryCard.stories.tsx
+ apps/web/src/components/DurationInput/DurationInput.stories.tsx
+ apps/web/src/components/InstallPrompt/InstallPrompt.stories.tsx
+ apps/web/src/components/Layout/Layout.stories.tsx
~ apps/web/src/components/Leaderboard/Leaderboard.stories.tsx
~ apps/web/src/components/LeaderboardCard/LeaderboardCard.stories.tsx
+ apps/web/src/components/Nav/Nav.stories.tsx
+ apps/web/src/components/NotificationBell/NotificationBell.stories.tsx
+ apps/web/src/components/RewardPurchaseDisclosure/RewardPurchaseDisclosure.stories.tsx
+ apps/web/src/components/Sheet/Sheet.stories.tsx
~ apps/web/src/components/TaskCard/TaskCard.stories.tsx
+ apps/web/src/components/TimeOfDayInput/TimeOfDayInput.stories.tsx
+ apps/web/src/components/Toast/Toast.stories.tsx
+ apps/web/src/components/VersionMismatchOverlay/VersionMismatchOverlay.stories.tsx

+ apps/web/src/pages/AccountPage/AccountPage.stories.tsx
+ apps/web/src/pages/AccountPage/PushSection.stories.tsx
+ apps/web/src/pages/AccountPage/TodoistSection.stories.tsx

~ apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
+ apps/web/src/pages/AdminPage/TaskDefinitionsSection.stories.tsx
+ apps/web/src/pages/AdminPage/TaskDefinitionForm.tsx
+ apps/web/src/pages/AdminPage/TaskDefinitionForm.stories.tsx
+ apps/web/src/pages/AdminPage/TaskEligibilityForm.tsx
+ apps/web/src/pages/AdminPage/TaskEligibilityForm.stories.tsx
+ apps/web/src/pages/AdminPage/LiveInstancesList.tsx
+ apps/web/src/pages/AdminPage/LiveInstancesList.stories.tsx

~ apps/web/src/pages/AdminPage/MembersSection.tsx
+ apps/web/src/pages/AdminPage/MembersSection.stories.tsx
+ apps/web/src/pages/AdminPage/AddMemberForm.tsx
+ apps/web/src/pages/AdminPage/AddMemberForm.stories.tsx
+ apps/web/src/pages/AdminPage/MemberRestrictionsForm.tsx
+ apps/web/src/pages/AdminPage/MemberRestrictionsForm.stories.tsx
+ apps/web/src/pages/AdminPage/MemberPointsAdjustmentForm.tsx
+ apps/web/src/pages/AdminPage/MemberPointsAdjustmentForm.stories.tsx
+ apps/web/src/pages/AdminPage/MemberPasswordResetForm.tsx
+ apps/web/src/pages/AdminPage/MemberPasswordResetForm.stories.tsx

~ apps/web/src/pages/AdminPage/RewardsSection.tsx
+ apps/web/src/pages/AdminPage/RewardsSection.stories.tsx
+ apps/web/src/pages/AdminPage/RewardForm.tsx
+ apps/web/src/pages/AdminPage/RewardForm.stories.tsx
+ apps/web/src/pages/AdminPage/RewardRedemptionsSection.stories.tsx
+ apps/web/src/pages/AdminPage/CategoriesSection.stories.tsx
+ apps/web/src/pages/AdminPage/AuditLogSection.stories.tsx

+ apps/web/src/pages/AdminPage/AdminAuditLogPage.stories.tsx
+ apps/web/src/pages/AdminPage/AdminCategoriesPage.stories.tsx
+ apps/web/src/pages/AdminPage/AdminMembersPage.stories.tsx
+ apps/web/src/pages/AdminPage/AdminRewardsPage.stories.tsx
+ apps/web/src/pages/AdminPage/AdminSettingsPage.stories.tsx
+ apps/web/src/pages/AdminPage/AdminTasksPage.stories.tsx

~ apps/web/src/pages/DashboardPage/DashboardPage.tsx
~ apps/web/src/pages/DashboardPage/DashboardPage.stories.tsx
+ apps/web/src/pages/DashboardPage/RejectCompletionForm.tsx
+ apps/web/src/pages/DashboardPage/RejectCompletionForm.stories.tsx

+ apps/web/src/pages/HistoryPage/HistoryPage.stories.tsx
+ apps/web/src/pages/LedgerPage/LedgerPage.stories.tsx
+ apps/web/src/pages/LoginPage/LoginPage.stories.tsx
~ apps/web/src/pages/OperatorDashboardPage/OperatorDashboardPage.stories.tsx
+ apps/web/src/pages/OperatorDashboardPage/OperatorLoginPage.stories.tsx
+ apps/web/src/pages/RegisterPage/RegisterPage.stories.tsx
+ apps/web/src/pages/RewardsShopPage/RewardsShopPage.stories.tsx
~ apps/web/src/pages/TaskDetailPage/TaskDetailPage.stories.tsx
+ apps/web/src/pages/TaskListPage/TaskListPage.stories.tsx
```

## Component Breakdown

### Story infrastructure and coverage contract

- **Files**: `storySupport.tsx`, `storyCoverage.ts`,
  `storyCoverage.test.ts`, `.storybook/preview.tsx`, `package.json`,
  `vitest.config.ts`, `README.md`
- **Responsibilities**:
  - Export the canonical iPhone 13 viewport value, authenticated `Layout`
    route decorator, operator-session cache decorator, and small story wrapper
    utilities.
  - Scan production `*.tsx` subjects under `src/components` and `src/pages`,
    ignoring tests and stories, and require a sibling `*.stories.tsx` file.
  - Hold an explicit `Record<relativePath, reason>` exclusion map. It begins
    empty because all currently discovered production TSX modules are visual.
  - Provide `npm run storybook:check -w apps/web` for targeted execution while
    retaining the test in ordinary Vitest and CI runs.
  - Exclude `src/storybook/**` from application coverage percentages without
    excluding its `*.test.ts` file from test discovery.
- **Dependencies**: Node filesystem APIs, Vitest, Storybook, React Router,
  TanStack Query
- **Complexity**: medium

### Shared deterministic fixtures and handlers

- **Files**: `src/mocks/data.ts`, `src/mocks/handlers.ts`
- **Responsibilities**:
  - Add typed fixtures for history, ledger, rewards, redemptions, categories,
    task definitions/details, admin configuration, audit events, Todoist,
    push status, and task-list endpoints.
  - Supply a populated happy-path handler for every endpoint used by a default
    page or section story.
  - Let each story override only the endpoint responsible for loading, empty,
    error, permission, or validation states.
  - Keep identifiers and relationships coherent across fixtures and use stable
    timestamps or named time helpers where the displayed value matters.
- **Dependencies**: shared DTOs, web API DTOs, MSW 2
- **Complexity**: high

### Targeted page-local extraction

- **Files**: nine new component modules and their stories, plus
  `TaskDefinitionsSection.tsx`, `MembersSection.tsx`, `RewardsSection.tsx`, and
  `DashboardPage.tsx`
- **Responsibilities**:
  - Extract the task-definition editor, eligibility editor, and live-instance
    list from the 984-line task-definition section.
  - Extract add-member, restrictions, point-adjustment, and password-reset
    workflows from the 703-line member section. The small temporary-password
    result view stays with the password-reset module.
  - Extract the reward create/edit form from the 363-line rewards section.
  - Extract the completion-rejection form from the dashboard.
  - Preserve hooks, mutation semantics, strings, CSS classes, and rendered DOM;
    these are cohesion refactors, not behavior changes.
  - Leave short one-use fragments such as `AddCategoryForm`, `RewardRow`, and
    `UnassignForm` in place. Their visual states are reached from their
    containing section/page stories because extracting them would add API
    surface without materially improving cohesion.
- **Dependencies**: existing page sections, API hooks, CSS modules, Storybook
  support
- **Complexity**: high

### Shared component stories

- **Files**: 12 new shared-component stories and responsive additions to
  `CategoryCard`, `Leaderboard`, `LeaderboardCard`, and `TaskCard`
- **Responsibilities**:
  - Cover prop-driven defaults and variants directly through typed args.
  - Cover hook/browser-driven states through MSW, controlled wrappers, and
    narrowly scoped platform stubs for install and version-update events.
  - Add iPhone 13 stories only for width-sensitive components. Fixed-size
    controls such as badges, chips, buttons, and time inputs do not get
    redundant viewport copies.
- **Dependencies**: Storybook CSF3, shared fixtures, platform API stubs
- **Complexity**: medium

### Page-local section stories

- **Files**: stories for all eight existing exported sections and all nine new
  extracted components
- **Responsibilities**:
  - Show default/populated, empty, loading, and error states where the subject
    fetches data.
  - Show validation, pending/disabled, open/closed, and success states only
    where they are user-visible and distinct.
  - Use `play` only when a click or input is required to expose a distinct
    visual state, such as an add sheet, filter panel, or mutation result.
- **Dependencies**: Story infrastructure, MSW fixtures, extracted modules
- **Complexity**: high

### Route-page stories

- **Files**: 14 new route-page stories plus responsive/state additions to
  Dashboard, Task Detail, and Operator Dashboard stories
- **Responsibilities**:
  - Render authenticated household pages inside the real `Layout` and matched
    child route so `Outlet`, navigation, notification chrome, and route params
    behave as in the application.
  - Render household login/register and operator login without household
    chrome; seed operator cache state where required.
  - Give every route page one desktop/default and one iPhone 13 story.
  - Add only distinct loading, empty, populated, error, validation, or role
    variants beyond that baseline.
- **Dependencies**: Story infrastructure, page-local section stories, shared
  fixtures and handlers
- **Complexity**: high

## Key Decisions

### Coverage enforcement: filesystem-backed Vitest contract

- **Chosen**: A Vitest test scans every production TSX module under the two
  in-scope roots and requires a colocated story, with a reason-bearing exclusion
  map. This is simple, machine-checkable, runs in existing CI, and cannot become
  a second manually maintained inventory of covered files.
- **Rejected**: A custom ESLint rule. It would require custom rule packaging and
  parser/config integration for a repository-specific filesystem invariant,
  increasing maintenance without improving the signal.
- **Rejected**: A manually enumerated manifest of included subjects. It would
  duplicate the source tree and could silently become stale when files move.

### Story data: typed shared happy paths plus local overrides

- **Chosen**: Extend the current typed MSW fixture/handler layer with coherent
  happy paths, then override only the endpoint relevant to each story. This
  preserves real hooks and query behavior while limiting duplication.
- **Rejected**: Declare every handler and full response inside every story.
  This maximizes isolation but makes dozens of stories noisy and lets common
  fixture relationships drift.
- **Rejected**: Mock React hooks directly. This is concise but bypasses query
  keys, loading/error transitions, request shapes, and MSW behavior that the
  existing Storybook setup intentionally exercises.

### Page-local boundaries: targeted workflow extraction

- **Chosen**: Extract nine components from the largest multi-responsibility
  modules where each component owns a distinct form, mutation, or independently
  understandable visual workflow. This creates stable story subjects and
  materially reduces the parent files.
- **Rejected**: Export private functions in place solely so stories can import
  them. That exposes implementation details without improving cohesion and
  leaves the largest files structurally unchanged.
- **Rejected**: Decompose every nested function into its own file. Small one-use
  rows and forms are more understandable beside their only caller, and atomic
  decomposition would turn Storybook coverage into a broad refactor campaign.

### Responsive contract: page baseline plus sensitivity-based components

- **Chosen**: Every route page gets desktop/default and iPhone 13 stories;
  components get iPhone 13 stories only when their layout changes or width
  pressure is meaningful. The named viewport and wrapper width come from shared
  support.
- **Rejected**: Duplicate every component story at two viewports. This adds many
  stories for controls whose output is identical and obscures useful variants.
- **Rejected**: Depend on reviewers manually changing the viewport toolbar.
  That is not a durable, visible coverage artifact.

### Page composition: real shell without full application routing

- **Chosen**: Mount authenticated route pages beneath a matched `Layout` route
  in the existing MemoryRouter. Standalone page-local sections and unauthenticated
  pages use focused wrappers.
- **Rejected**: Render every page bare. That misses the responsive application
  shell and can break pages expecting outlet or navigation context.
- **Rejected**: Mount the complete browser router and route guards. It adds
  session redirects and browser-history coupling that obscure the page state
  being documented.

### Interaction depth: state-revealing plays only

- **Chosen**: Use args and handler variants first, adding `play` only when user
  input is required to reach a distinct visual state. This keeps Storybook a
  visual-state catalog while still exposing sheets and validation states.
- **Rejected**: Recreate every workflow as a Storybook interaction test. Vitest
  and Playwright already own behavioral and end-to-end assertions, and universal
  plays would substantially expand scope.

### CI boundary: inventory in CI, Storybook bundle on explicit verification

- **Chosen**: Ordinary Vitest/coverage CI runs the lightweight inventory test;
  the full `build-storybook` command remains an explicit delivery verification.
- **Rejected**: Add the full static Storybook bundle to every CI run. It is a
  comparatively expensive duplicate build and conflicts with the established
  isolation contract documented in the README.
- **Rejected**: Keep all coverage verification manual. New pages/components
  could regress coverage immediately after this campaign.

## Build Phases

### Phase 0: Baseline

- **Goal**: Record the pre-change health and exact uncovered subject list.
- **Files**: none
- **Dependencies**: none
- **End Conditions**:
  - [ ] `npm run typecheck -w apps/web` exits 0 or any pre-existing failure is recorded.
  - [ ] `npm run lint -w apps/web` exits 0 or any pre-existing failure is recorded.
  - [ ] `npm run test -w apps/web` exits 0 or any pre-existing failure is recorded.
  - [ ] `npm run build-storybook -w apps/web` exits 0 or any pre-existing failure is recorded.
  - [ ] A generated comparison confirms 34 current in-scope modules lack sibling stories before implementation.

### Phase 1: Shared story infrastructure and fixtures

- **Goal**: Provide reusable wrappers and complete deterministic happy-path API data before adding stories.
- **Files**: `.storybook/preview.tsx`, `src/storybook/storySupport.tsx`,
  `src/mocks/data.ts`, `src/mocks/handlers.ts`, `vitest.config.ts`
- **Dependencies**: Phase 0
- **End Conditions**:
  - [ ] A smoke story renders with the shared authenticated-layout decorator and named iPhone 13 viewport.
  - [ ] Every endpoint used by an in-scope default page/section has a typed happy-path MSW handler.
  - [ ] `npm run typecheck -w apps/web` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test -w apps/web` exits 0 with all existing tests passing.

### Phase 2: Targeted page-local extraction

- **Goal**: Turn the nine independently meaningful private workflows into focused, storyable modules without changing behavior.
- **Files**: the nine new extracted `*.tsx` modules and their nine story files;
  `TaskDefinitionsSection.tsx`, `MembersSection.tsx`, `RewardsSection.tsx`,
  `DashboardPage.tsx`
- **Dependencies**: Phase 1
- **Parallel Safety**: May run alongside Phases 3 and 4 if each worker owns disjoint files; the fixture and support files remain owned by Phase 1.
- **End Conditions**:
  - [ ] Each extracted module has a colocated story showing its default and material alternate states.
  - [ ] Existing section/page tests pass without assertion changes caused by rendered behavior differences.
  - [ ] `npm run typecheck -w apps/web` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test -w apps/web` exits 0 with all existing tests passing.

### Phase 3: Shared component coverage

- **Goal**: Complete stories for all shared visual components and the agreed responsive variants.
- **Files**: the 12 new component story files and four modified existing component story files listed in the File Tree
- **Dependencies**: Phase 1
- **Parallel Safety**: Safe to run alongside Phases 2 and 4 with disjoint file ownership.
- **End Conditions**:
  - [ ] All 24 shared production component modules have sibling story files.
  - [ ] Hook/browser-dependent components render without live network access or persisted browser state.
  - [ ] Width-sensitive components include an iPhone 13 story; fixed-size controls are not duplicated.
  - [ ] `npm run typecheck -w apps/web` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test -w apps/web` exits 0 with all existing tests passing.

### Phase 4: Existing page-local section coverage

- **Goal**: Cover all eight existing exported page-local section modules and their meaningful states.
- **Files**: `PushSection.stories.tsx`, `TodoistSection.stories.tsx`,
  `AuditLogSection.stories.tsx`, `CategoriesSection.stories.tsx`,
  `MembersSection.stories.tsx`, `RewardRedemptionsSection.stories.tsx`,
  `RewardsSection.stories.tsx`, `TaskDefinitionsSection.stories.tsx`
- **Dependencies**: Phase 1
- **Parallel Safety**: Safe to run alongside Phases 2 and 3 with disjoint file ownership.
- **End Conditions**:
  - [ ] Each exported section has default/populated and every applicable loading, empty, error, or open state.
  - [ ] Any `play` function exists only to reveal a distinct visual state and makes no live request.
  - [ ] `npm run typecheck -w apps/web` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test -w apps/web` exits 0 with all existing tests passing.

### Phase 5: Route pages, inventory gate, and documentation

- **Goal**: Complete all route-page stories and make missing future stories fail ordinary CI.
- **Files**: the 14 new route-page story files; modified Dashboard, Task Detail,
  and Operator Dashboard story files; `storyCoverage.ts`,
  `storyCoverage.test.ts`, `package.json`, `README.md`
- **Dependencies**: Phases 2, 3, and 4
- **End Conditions**:
  - [ ] All 17 route pages have colocated stories with desktop/default and iPhone 13 variants.
  - [ ] `npm run storybook:check -w apps/web` exits 0 and reports no uncovered production TSX subject.
  - [ ] The exclusion map is empty or every entry names an existing non-visual module and contains a non-empty reason.
  - [ ] README distinguishes the CI inventory gate from the explicitly invoked full Storybook build.
  - [ ] `npm run typecheck -w apps/web` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test -w apps/web` exits 0 with all existing tests passing.

### Phase 6: Full verification

- **Goal**: Prove the complete catalog builds independently and introduces no regressions.
- **Files**: none except fixes required to satisfy failed verification within the already listed ownership
- **Dependencies**: Phase 5
- **End Conditions**:
  - [ ] `npm run storybook:check -w apps/web` exits 0.
  - [ ] `npm run build-storybook -w apps/web` exits 0 without a live backend or network access.
  - [ ] `npm run typecheck` exits 0 with no new errors.
  - [ ] `npm run lint` exits 0 with no new errors.
  - [ ] `npm run lint -w apps/web` exits 0 with no new errors.
  - [ ] `npm run test --workspaces --if-present` exits 0 with all existing tests passing.
  - [ ] The Storybook index contains every in-scope subject and no documented story requires persisted browser state.

## Phase Dependency Graph

```text
Phase 0 -> Phase 1 -> Phase 2 --+
                  -> Phase 3 ---+-> Phase 5 -> Phase 6
                  -> Phase 4 ---+
```

Phases 2, 3, and 4 are Fleet-compatible when agents receive exclusive file
ownership. Phase 1 centralizes all shared-fixture edits before that fan-out;
Phase 5 reconciles and enforces the final inventory after the fan-in.

## Risk Register

1. **Regression in existing functionality during extraction**: move existing
   JSX and hook logic without semantic edits, retain existing tests, and compare
   section/page stories before and after extraction.
2. **MSW handler collisions hide incorrect story data**: keep one default per
   endpoint, make per-story overrides minimal, and use stable identifiers across
   related fixtures.
3. **A story waits forever on an unhandled request**: enumerate every query used
   by the subject, retain `retry: false`, and make the static build plus manual
   index audit a phase gate.
4. **Inventory rules classify helper or non-visual TSX as visual**: scope the
   scan to production TSX under `components` and `pages`, ignore conventional
   test/story suffixes, and require a reason-bearing exact-path exclusion for
   any future exception.
5. **Responsive duplication bloats the sidebar**: centralize the viewport and
   require mobile variants only for route pages and layout-sensitive components.
6. **Browser/PWA globals leak between stories**: restore localStorage, service
   worker, install-prompt, timers, and location stubs in decorators or story
   cleanup so switching stories is deterministic.
7. **The expanded catalog becomes hard to navigate**: retain
   `Components/<Subject>` and `Pages/<Area>/<Subject>` titles, grouping page-local subjects under
   `Pages/<Area>/Sections` or `Pages/<Area>/Forms` consistently.
8. **Full Storybook build cost drifts into routine CI**: keep only the inventory
   test in Vitest/coverage CI and document `build-storybook` as the explicit
   delivery gate.

## Out of Scope

- Visual-regression image baselines or a hosted Storybook deployment.
- Replacing Vitest or Playwright behavior coverage with Storybook interactions.
- New product behavior, API endpoints, DTOs, database changes, or design-system
  restyling.
- Extracting trivial one-use markup solely to increase story count.
