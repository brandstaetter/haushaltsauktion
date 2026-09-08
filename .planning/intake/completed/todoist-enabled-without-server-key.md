---
title: "Todoist household toggle can be enabled with no server-side integration support, leaving members unable to connect"
status: completed
priority: normal
target: apps/api/src/app/integrations/connectTodoist.ts, apps/api/src/infra/http/routes/admin.ts, apps/api/src/app/config/updateConfig.ts, apps/web/src/pages/AdminPage/AdminSettingsPage.tsx, apps/web/src/pages/AccountPage/TodoistSection.tsx
---

## Description

Reported symptom: a member says the Todoist integration is "active" (the
household admin has switched it on in Admin Settings, and the Account page
does show the connection form), but they cannot actually define/save their
own Todoist API token — the save appears to fail every time.

**Likely root cause, confirmed in code (not yet reproduced against a live
deployment):** `Deps.todoist` / `Deps.secrets` are only constructed in
`apps/api/src/main.ts:50-56` when `INTEGRATION_ENCRYPTION_KEY` (or
`..._KEYS`) is set:

```
const hasKey = (env.INTEGRATION_ENCRYPTION_KEY ?? '') !== '' || (env.INTEGRATION_ENCRYPTION_KEYS ?? '') !== '';
const secrets = hasKey ? createSecretBox(...) : undefined;
const todoist = hasKey ? createTodoistClient() : undefined;
```

Nothing gates the **household-level** `integrations.todoist.enabled` switch
against this. `PUT /admin/config` (`updateConfig()`,
`apps/api/src/app/config/updateConfig.ts:68-120`, called from
`apps/api/src/infra/http/routes/admin.ts:209-220`) validates the new config
against `HouseholdConfigSchema` only — it has no awareness of whether the
server process actually has a Todoist adapter. So an admin can flip the
switch on in a deployment that never had `INTEGRATION_ENCRYPTION_KEY`
configured, `AdminSettingsPage` will happily show it as saved, and the
Account page's `TodoistSection` (`apps/web/src/pages/AccountPage/
TodoistSection.tsx:53`) renders the connect form because it only checks
`publicConfig.integrations.todoist.enabled` — which says nothing about
server capability either.

When the member then submits a token, `PUT /integrations/todoist` →
`connectTodoist()` → `requirePorts()`
(`apps/api/src/app/integrations/connectTodoist.ts:45-55`) throws:

```
ConflictError('INTEGRATION_DISABLED', 'Integrationen sind auf diesem Server nicht konfiguriert.')
```

`ApiError.message` on the client (`apps/web/src/api/client.ts:15`) is taken
verbatim from `error.message`, so this string does reach
`TodoistSection`'s `message` paragraph (`TodoistSection.tsx:56-57,68`) — it
is not a silent failure, but from the member's point of view it reads as
"the integration is on, but saving my key never works," which matches the
report. A member has no way to know the difference between "my token is
wrong" and "the server was never set up for this."

The same gap likely also explains the two prior production incidents in
this repo's history (`fix: production 502 - INTEGRATION_ENCRYPTION_KEY
empty-string boot crash`, `fix: production deploy failure - missing
integrations field on PublicConfigDto`) — the encryption key has been a
recurring soft spot for this deployment.

## Acceptance Criteria

- Confirm against the actual deployment whether `INTEGRATION_ENCRYPTION_KEY`
  (or `_KEYS`) is set. If it is not, that alone explains the report and the
  immediate fix is operational (set the env var) — but the code gap below
  should still be closed so this can't recur silently for this or any other
  household.
- `PUT /admin/config` (or `POST /admin/config/validate`) should reject
  turning `integrations.todoist.enabled` on when the server has no
  `deps.todoist`/`deps.secrets` configured, with a clear admin-facing error
  (e.g. `INTEGRATION_NOT_CONFIGURED`) rather than silently accepting a
  setting members can never use.
- `GET /admin/config` (`AdminConfigDto`) should expose whether the server
  actually supports the integration (e.g. an `integrationsAvailable.todoist:
  boolean` flag), so `AdminSettingsPage` can show the consequence *before*
  the admin flips the switch (§31 — state consequences up front, not after).
- Regression test: attempting to enable Todoist against a `deps` without
  `todoist`/`secrets` configured is rejected at the config-write layer, not
  just at connect-time.
- No change needed to the member-facing error message itself — it already
  surfaces correctly; the gap is that the admin can create this state at
  all.
