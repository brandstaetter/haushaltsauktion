---
version: 1
id: "92585ee6-5b26-4b73-8f91-10f62fe6d3ba"
status: completed
started: "2026-09-02T20:48:44.721Z"
completed_at: "2026-09-03T04:56:00.000Z"
direction: "Todoist task priority should be configurable in household settings instead of fixed"
phase_count: 4
current_phase: 3
branch: null
worktree_status: null
---

# Campaign: Todoist task priority should be configurable in household settings instead of fixed

Status: completed
Started: 2026-09-02T20:48:44.721Z
Direction: Todoist task priority should be configurable in household settings instead of fixed

## Claimed Scope
- packages/shared/src/config/schema.ts, apps/api/src/app/integrations/runReconciliation.ts, apps/api/src/infra/integrations/todoist-sync.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx

## Intake Source

- File: .planning/intake/todoist-priority-not-configurable.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test --workspaces: shared 144/144, api 273/273, web 117/117 — all pass. Reviewed the priority-direction chain directly (config schema, runReconciliation.ts, dispatchOutbox.ts's null-to-undefined coercion, todoist-sync.ts's untouched raw passthrough) and the AdminSettingsPage merge-bug fix. Independently re-run outside the build agent's own session, matching its reported results exactly. | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/todoist-task-priority-should-be-configurable-in-household-settings-instead-of-fi.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T20:48:44.721Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-02 (phase 2, build): Confirmed by reading `ports.ts:128` and
  `todoist-sync.ts:180-186` that `command.priority` is forwarded to Todoist's
  Sync API with **no transformation whatsoever** — `args.priority =
  command.priority` is a raw passthrough. That means the new config field's
  numeric scale has to be Todoist's own *API* convention, not its UI
  convention: Todoist's UI shows p1 (urgent) .. p4 (normal), but the
  `item_add`/`item_update` `priority` argument runs the opposite direction —
  4 = urgent, 1 = normal (Todoist's documented default when the argument is
  omitted). Picking the UI's p1..p4 numbering for the config field would have
  silently inverted every priority an admin set, and translating between the
  two scales somewhere in the pipeline would have been exactly the "second,
  differently-scaled representation" the brief warned against. So
  `HouseholdConfig.integrations.todoist.priority` stores the raw API number
  (1-4) directly, `null` means "omit the argument" (today's default
  behaviour, preserved), and the Admin UI's `<select>` options are labelled
  with both the number and its Todoist-UI meaning ("4 — Dringend / Todoist
  P1") so an admin does not have to know the inversion, while the value
  written to config and sent to Todoist never leaves the single raw-API
  scale. `CreateTaskCommand`/`todoist-sync.ts` were read but not touched —
  the forwarding logic already worked correctly.

## Active Context

Phase 2 (build) complete. Implemented:
- `packages/shared/src/config/types.ts`: added `priority: number | null` to
  `TodoistIntegrationConfig`, documented with the direction convention above.
- `packages/shared/src/config/defaults.ts`: default `priority: null`
  (omit the argument — preserves pre-feature behaviour).
- `packages/shared/src/config/schema.ts`: validates `priority` as
  `z.number().int().min(1).max(4).nullable()`, matching Todoist's real API
  range, following the existing `positiveIntOrNull`-style nullable-numeric
  pattern used elsewhere in the schema (e.g. `costFormula`, `maximumDebt`).
- `apps/api/src/app/integrations/runReconciliation.ts`: reads
  `integrations.todoist.priority` from the household's current config
  alongside the existing `enabled` read, carries it through `PayloadSource`
  and into the outbox row's `payload.priority` — the field
  `dispatchOutbox.ts` already read but that runReconciliation.ts never
  populated. No change to `dispatchOutbox.ts`, `ports.ts`, or
  `todoist-sync.ts` — all three already worked.
- `apps/web/src/pages/AdminPage/AdminSettingsPage.tsx`: added a priority
  `<select>` next to the existing Todoist-enabled checkbox, and fixed a
  latent bug the new field would otherwise have hit — the checkbox's
  `onChange` replaced the whole `integrations.todoist` object instead of
  merging into it, which would have silently dropped a chosen `priority` the
  next time the enabled checkbox was toggled.
- `apps/web/src/strings/de.ts`: new label/hint/option strings for the field.
- Fixed two now-non-compiling fixtures that constructed
  `TodoistIntegrationConfig` literals missing the new required field:
  `apps/web/src/pages/AccountPage/AccountPage.test.tsx` and (already
  compiling, but extended for coverage)
  `apps/web/src/pages/AdminPage/AdminSettingsPage.test.tsx`.
- Tests added: `packages/shared/test/config.test.ts` (schema range/default/
  nullability, and a public-projection non-leak check), an extension of
  `AdminSettingsPage.test.tsx` (select renders, round-trips through save),
  and a new integration suite
  `apps/api/test/integration/todoist-priority.test.ts` covering both a
  configured non-default priority and the default (no-argument) case
  end-to-end through `runReconciliation` → outbox → `dispatchOutbox` →
  the `item_add` command Todoist would receive.

Verification run this phase (see below): `npm run typecheck`, `npm run
lint`, full `apps/api` vitest suite (273 passed), full `apps/web` vitest
suite (117 passed), and `packages/shared` vitest suite (144 passed) — all
green. Next action: phase 3 (verify) — re-run the project's canonical
`npm run test` and record it as this phase's evidence.

## Completion Record

- Completed At: 2026-09-03T04:55:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting the same commit/PR go-ahead pattern as the other campaigns this
  session)
- Verification: npm run typecheck, npm run lint, npm run test --workspaces
  all pass (shared 144/144, api 273/273, web 117/117), independently re-run
  and the priority-direction conversion chain reviewed directly, outside the
  build agent's own session
- Notable incidental fix: AdminSettingsPage's Todoist-enabled checkbox
  handler was replacing the whole `integrations.todoist` config object
  instead of merging into it — would have silently dropped a configured
  `priority` (and `projectId`, if ever admin-settable) the next time the
  checkbox was toggled. Fixed as part of this campaign since the new field
  would have hit it immediately.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: packages/shared/src/config/{types,defaults,schema}.ts,
packages/shared/test/config.test.ts,
apps/api/src/app/integrations/runReconciliation.ts,
apps/api/test/integration/todoist-priority.test.ts (new),
apps/web/src/pages/AdminPage/AdminSettingsPage.tsx,
apps/web/src/pages/AdminPage/AdminSettingsPage.test.tsx,
apps/web/src/pages/AccountPage/AccountPage.test.tsx,
apps/web/src/strings/de.ts
Blocking: none. Note: the working tree also carries unrelated pre-existing
changes from other campaigns (nav/task-card/storybook work) that predate
this session and are out of this campaign's claimed scope — left untouched.
