---
title: "Activating the Todoist integration in Admin Settings appears not to persist"
status: completed
priority: normal
target: apps/web/src/api/hooks.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx
campaign: activating-the-todoist-integration-in-admin-settings-appears-not-to-persist
---

## Description

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
