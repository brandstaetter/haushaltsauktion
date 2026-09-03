---
version: 1
id: "b9bb6f0b-b8c9-49cb-aab5-60c62626d44c"
status: completed
started: "2026-09-03T13:55:27.387Z"
completed_at: null
direction: "Todoist project grouping: no household-level default, only per-member manual selection"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Todoist project grouping: no household-level default, only per-member manual selection

Status: completed
Started: 2026-09-03T13:55:27.387Z
Direction: Todoist project grouping: no household-level default, only per-member manual selection

## Claimed Scope
- apps/web/src/pages/AccountPage/TodoistSection.tsx, apps/api/src/app/integrations/connectTodoist.ts, packages/shared/src/config/schema.ts, apps/api/src/app/integrations/runReconciliation.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx

## Intake Source

- File: .planning/intake/todoist-household-default-project.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Requested: "projectId should be configurable in the settings for Todoist
task creation, so that tasks from Haushaltsauktion are grouped into a
single project on the Todoist side."

**Per-member project selection already exists** — this is not a gap.
`memberIntegration.projectId` (`apps/api/prisma/schema.prisma:721-722`) is
set via a dropdown on the member's own Account page
(`TodoistSection.tsx:142-161`), written through
`updateTodoistSettings()` (`connectTodoist.ts:139-187`), and read by the
reconciler when building outbox payloads
(`runReconciliation.ts:149,233` — `projectId: integration.projectId`).
Left unset, tasks land in that member's Todoist Inbox
(`t.projectInbox`). So each member can already point their own connection
at one project of their choosing.

**The actual gap:** each household member connects their *own* separate
Todoist account (`Deps.todoist`/token is per-member, §36 of CLAUDE.md — a
personal token is never shared or admin-visible). There is no concept of a
single Todoist project shared across the household, and no
household-level default: `IntegrationsSchema.todoist` in
`packages/shared/src/config/schema.ts:177-185` only has `enabled`, and
`AdminSettingsPage.tsx:179-199` only exposes that same toggle. Every new
member has to discover and manually pick a project themselves; nothing
nudges or pre-fills them toward a consistent choice, so "grouped into a
single project" only happens today if each member independently picks a
project with the same name in their own account.

## Acceptance Criteria

- Clarify with the requester what "single project" should mean given
  Todoist accounts are per-member and cannot be literally merged:
  most likely a household-configured **default/suggested project name**
  that each member is prompted to create/select when they connect, rather
  than a literal shared project ID (which cannot exist across separate
  Todoist accounts).
- If a household-level default is added: extend
  `IntegrationsSchema.todoist` with a default project name/hint, expose it
  in `AdminSettingsPage.tsx`, and have `TodoistSection.tsx` pre-select or
  suggest it when a member connects (without overriding a member's
  existing explicit choice).
- No change needed to `runReconciliation.ts` payload wiring or the
  `MemberIntegration.projectId` column — per-member selection already
  works end-to-end; confirm this during build before touching that layer.
- Regression test: connecting a new member in a household with a
  configured default project name reflects that default in the Account
  page's project selector.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | resolved | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run test (144+305+122 tests, all pass) | resolved | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/todoist-project-grouping-no-household-level-default-only-per-member-manual-selec.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-03T13:55:27.387Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-03: Asked the user which resolution to build (household default
  project name w/ pre-select, docs-only, or skip) since a literal shared
  project ID cannot exist across separate per-member Todoist accounts — this
  is a product-shape decision, not something safe to infer. User chose
  "just document the limitation."
  Reason: Per brief's own acceptance criterion #1 ("clarify with the
  requester"); the recommended default (household default project *name*
  hint) was declined in favor of no new config.
- 2026-09-03: Implemented Phase 2 as docs/UI-copy only, no new config, no
  code path change. Extended `de.admin.fields.todoistEnabledHint` and added
  `de.todoist.projectHint` (rendered under the project selector in
  `TodoistSection.tsx`) explaining that project selection is per-account and
  that households wanting grouped tasks must independently name a project
  the same way in each member's own Todoist. Expanded `docs/todoist.md`'s
  "Gemeinsame Haushalts-Projekte" row and step 4 of "Einschalten" with the
  same guidance. Added a regression test asserting the new hint renders.
  `runReconciliation.ts`/`connectTodoist.ts`/`schema.ts`/
  `AdminSettingsPage.tsx` confirmed unchanged — no backend or config
  surface needed for a documentation-only resolution.
- 2026-09-03: Phase 3 verification. `npm run typecheck` and `npm run lint`
  clean; `npm run test` green across all workspaces (shared 144, api 305,
  web 122 incl. 1 new TodoistSection test).

## Active Context

Delivery preflight complete. Next action: implement Phase 2 using the claimed scope, acceptance criteria, map context, and evidence contract.

## Continuation State

Phase: 2
Sub-step: implementation not started
Files modified: campaign scaffold only
Blocking: none

## Completion Record

- Completed At: 2026-09-03T13:59:13.939Z
- Outcome: review-package
- Verification: npm run typecheck, npm run lint, npm run test (all workspaces green: shared 144, api 305, web 122)

- 2026-09-03: Delivered as PR #53: https://github.com/brandstaetter/haushaltsauktion/pull/53 (branch feat/notify-deploy-and-todoist-docs, bundled with the other pending intake item).
