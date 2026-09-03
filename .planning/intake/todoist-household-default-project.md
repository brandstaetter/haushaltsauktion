---
title: "Todoist project grouping: no household-level default, only per-member manual selection"
status: completed
priority: normal
target: apps/web/src/pages/AccountPage/TodoistSection.tsx, apps/api/src/app/integrations/connectTodoist.ts, packages/shared/src/config/schema.ts, apps/api/src/app/integrations/runReconciliation.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx
campaign: todoist-project-grouping-no-household-level-default-only-per-member-manual-selec
---

## Description

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
