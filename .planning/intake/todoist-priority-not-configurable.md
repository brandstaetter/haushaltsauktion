---
title: "Todoist task priority should be configurable in household settings instead of fixed"
status: completed
priority: normal
target: packages/shared/src/config/schema.ts, apps/api/src/app/integrations/runReconciliation.ts, apps/api/src/infra/integrations/todoist-sync.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx
campaign: todoist-task-priority-should-be-configurable-in-household-settings-instead-of-fi
---

## Description

Todoist tasks created by the sync integration never carry a priority today.
The plumbing to set one already exists end-to-end —
`CreateTaskCommand.priority` (`apps/api/src/app/integrations/ports.ts:128`)
is optional, and `todoist-sync.ts:186` forwards it to the Todoist Sync API
(`if (command.priority !== undefined) args.priority = command.priority;`) —
but nothing ever populates it. The outbox payload built in
`runReconciliation.ts:228-234` only sets `content`, `description`, `dueAt`,
`timezone`, and `projectId`; `priority` is never included, so every created
task falls back to Todoist's own default (p4/normal), and there is no way
for an admin to change that.

There is also no config schema support for it: `IntegrationsSchema.todoist`
in `packages/shared/src/config/schema.ts:177-185` only has `enabled`, and
`AdminSettingsPage.tsx` exposes no priority control.

## Acceptance Criteria

- Add a `priority` (or similarly named) field to the household's
  `integrations.todoist` config in `HouseholdConfigSchema`, with a sensible
  default that preserves today's behavior (Todoist's own default) unless an
  admin changes it. Validate against Todoist's actual priority range (1-4).
- Admin Settings UI exposes the new field so it can be changed without a
  deployment.
- `runReconciliation.ts` reads the household's configured priority and
  includes it in the outbox payload so `todoist-sync.ts` forwards it on task
  creation.
- Regression/unit test covering: a household with a non-default priority
  configured produces outbox payloads (and therefore Todoist `item_add`
  commands) carrying that priority.
- No change needed to `CreateTaskCommand`/`todoist-sync.ts` — the field
  already accepts and forwards `priority`; confirm this during build before
  touching that layer.
