---
title: "Complete Storybook coverage for all pages and components"
status: completed
priority: low
target: apps/web/src/pages/, apps/web/src/components/, apps/web/.storybook/
campaign: complete-storybook-coverage-for-all-pages-and-components
---

## Description

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

