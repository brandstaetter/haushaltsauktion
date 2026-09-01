---
version: 1
id: "0085e290-75c7-40c4-b287-6de5a92bd2b8"
status: active
started: "2026-09-01T05:22:56.747Z"
completed_at: null
direction: "Activating the Todoist integration in Admin Settings appears not to persist"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Activating the Todoist integration in Admin Settings appears not to persist

Status: active
Started: 2026-09-01T05:22:56.747Z
Direction: Activating the Todoist integration in Admin Settings appears not to persist

## Claimed Scope
- apps/web/src/api/hooks.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx

## Intake Source

- File: .planning/intake/todoist-activation-not-persisted.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Reported symptom: an admin flips the "Todoist-Integration für diesen Haushalt
erlauben" checkbox on (`apps/web/src/pages/AdminPage/AdminSettingsPage.tsx:167-176`,
`de.admin.fields.todoistEnabled`), saves, and the change appears not to stick.

**Confirmed root cause:** `useSaveConfig()` (`apps/web/src/api/hooks.ts:347-358`)
invalidates `publicConfigQueryKey`, `['tasks']`, and `dashboardQueryKey` on
success, but never invalidates `adminConfigQueryKey` (`['admin', 'config']`,
defined at `hooks.ts:37`) — the exact query key `useAdminConfig()`
(`hooks.ts:340-345`) reads from and that `AdminSettingsPage` seeds its local
`draft` state from via `useEffect(() => { if (config) setDraft(clone(config.values)); }, [config])`
(`AdminSettingsPage.tsx:26-31`).

The PUT itself (`PUT /admin/config` → `updateConfig()` in
`apps/api/src/app/config/updateConfig.ts:68-120`) does persist correctly —
it's append-only, versioned, and validated against the real
`HouseholdConfigSchema` including `integrations.todoist.enabled`
(`packages/shared/src/config/schema.ts:176-185`). The bug is purely a stale
client cache:

- Within the query's 15s `staleTime` (`apps/web/src/main.tsx:8-23`), navigating
  away from Admin Settings and back re-mounts the page, `useAdminConfig()`
  serves the pre-save cached response, and the checkbox reverts to unchecked —
  looking exactly like "activating it didn't work."
- Even past 15s, `config.version` shown in the page header
  (`AdminSettingsPage.tsx:60`) is still the pre-save version. A second save
  attempt sends that stale `expectedVersion`
  (`AdminSettingsPage.tsx:44-54`) and gets rejected with
  `CONFIG_VERSION_CONFLICT` ("Eine andere Änderung wurde zuerst gespeichert.",
  `updateConfig.ts:86-92`) even though nobody else touched the config —
  reinforcing the "this doesn't work" impression on retry.

This isn't Todoist-specific — every field on `AdminSettingsPage` has the same
stale-cache exposure — but Todoist is the one most likely to get toggled and
then immediately re-checked (via the Account page's Todoist section, which
reads `publicConfig.integrations.todoist.enabled` — that query *does* get
invalidated, so the two screens can visibly disagree right after a save).

## Acceptance Criteria

- `useSaveConfig()` also invalidates `adminConfigQueryKey` on success, so
  `AdminSettingsPage` reflects the just-saved values and version immediately
  without a hard reload.
- Verify no other admin mutation hook in `hooks.ts` has the same gap (each
  admin write should invalidate the query key its own page reads from, not
  just the member-facing ones).
- Add a regression test for `AdminSettingsPage` (none currently exists —
  `apps/web/src/pages/AdminPage/` only has `CategoriesSection.test.tsx`,
  `MembersSection.test.tsx`, `TaskDefinitionsSection.test.tsx`) covering:
  toggle the Todoist checkbox, save, and assert the displayed config version
  and checkbox state reflect the post-save server response without a
  remount-triggered refetch being required.
- No backend changes expected — `updateConfig()` already persists correctly;
  confirm that during build before touching anything under `apps/api`.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | done | 2 | — |
| phase:3 | verification-command | test_result | yes | npm run test | done | 2 | — |
| phase:4 | review-package | review_package | yes | .planning/review-packages/activating-the-todoist-integration-in-admin-settings-appears-not-to-persist.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-01T05:22:56.747Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01: Implemented fix — `useSaveConfig()` in `apps/web/src/api/hooks.ts`
  now also invalidates `adminConfigQueryKey` on success. Audited every other
  admin mutation hook in the file; each already invalidates the query key its
  own page reads from (members/categories/task-definitions/notifications/
  todoist), so this was the only gap. Added
  `apps/web/src/pages/AdminPage/AdminSettingsPage.test.tsx`, a regression test
  that toggles Todoist, saves, and asserts the header version and checkbox
  reflect the post-save server response without a remount, then does a second
  save to confirm the refreshed `expectedVersion` avoids a spurious
  `CONFIG_VERSION_CONFLICT`. Verified the test fails on the pre-fix hooks.ts
  (via git stash) and passes with the fix. Full monorepo `npm run test`
  (446 tests), `npm run typecheck`, and `npm run lint` all pass. No backend
  changes were needed — confirmed `updateConfig()` already persists correctly.

## Active Context

Implementation and verification complete. Next action: package the delivery
(Phase 4) — branch, commit, PR, and review package.

## Continuation State

Phase: 4
Sub-step: package for review
Files modified:
- apps/web/src/api/hooks.ts
- apps/web/src/pages/AdminPage/AdminSettingsPage.test.tsx (new)
Blocking: none
