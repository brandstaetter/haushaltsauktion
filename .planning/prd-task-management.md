# PRD: Task Management Admin UI

> Description: Give admins an in-app way to create, edit, and archive chores (TaskDefinitions) and categories — the backend already does all of this, nothing in the frontend calls it.
> Author: Hannes Brandstätter-Müller
> Date: 2026-08-30
> Status: approved
> Mode: feature
> Reconciliation note (2026-08-30): This PRD's entire scope (task-definition + category admin UI) is identical to Feature 3 / Phase 4 of `.planning/prd-admin-onboarding.md` and its campaign `.planning/campaigns/admin-onboarding.md`. Rather than run a second, duplicate implementation, this PRD's end conditions are satisfied by that campaign's Phase 4 — no separate architecture doc or campaign was created for this PRD. See that campaign's Decision Log for the reconciliation record.

## Problem

`AdminPage.tsx` today only renders the household's global rule config (assignment strategy, voluntary reward, buyout, value-increase, reset behavior). It has no UI for the actual chores themselves. The backend has had full task-definition and category CRUD since the MVP campaign (`POST/GET/PUT/DELETE /admin/task-definitions[/:id]`, eligibility, materialize, and category CRUD, all in `apps/api/src/infra/http/routes/admin.ts`), but an admin cannot add a new chore, change a base value, retire an old one, or manage categories without calling the API directly. This PRD closes that one gap. It does not touch household creation or member management — those are covered separately by the parked `.planning/prd-admin-onboarding.md`.

## Users

- **Household admin**: the `ADMIN`-role member who decides what chores exist, what they're worth, and how often they recur — using the web UI on a phone or laptop.

## Core Features

1. **Task-definition list**: AdminPage shows every active TaskDefinition (title, category, base value, recurrence summary, buyout-enabled flag) and, on toggle, archived ones too.
2. **Create/edit task definition**: a form (title, description, category, base value, estimated minutes, buyout toggle, active toggle, recurrence rule) that calls `POST`/`PUT /admin/task-definitions[/:id]`.
3. **Archive task definition**: an action that calls `DELETE /admin/task-definitions/:id`, surfacing the server's `HAS_OPEN_INSTANCES` conflict as a readable message when the definition has open instances.
4. **Category manager**: list/create/edit/delete `TaskCategory` rows (name, color, sort order), surfacing `CATEGORY_IN_USE` on a blocked delete.
5. **Eligibility editing**: per task definition, set included/excluded member eligibility via `PUT /admin/task-definitions/:id/eligibility`.

## Out of Scope (v1)

- Household registration, member management, or anything else in the parked `prd-admin-onboarding.md` — strictly separate scope.
- Manual on-demand materialization UI (`POST /admin/task-definitions/:id/materialize`) — the sweep already handles this automatically per the existing config (`offerDurationMinutes`, recurrence); wiring a manual "publish now" button is a plausible v2, not v1.
- A visual calendar/date-picker recurrence editor — a type-select (ONCE/DAILY/WEEKDAYS/WEEKLY/EVERY_N_DAYS/MONTHLY/MANUAL) plus the conditional fields each type needs (interval, weekdays, dayOfMonth, timeOfDay, dueOffsetMinutes) is sufficient and matches the plainness of the rest of AdminPage.
- Bulk task import/export.
- Drag-and-drop category reordering — `sortOrder` is a plain number field.

## Technical Decisions

- **No backend changes** — every endpoint this feature needs already exists, is already zod-validated, already `requireAdmin`-gated, and already writes an `AuditEvent`. This PRD is frontend-only.
- **Two new `<section>` blocks in the existing `AdminPage.tsx`**, not a new page or a tabbed sub-navigation — because that file is already a single flat scroll of `<section className={styles.section}>` blocks (config rules today) with no navigation chrome, and every other page in this app (Dashboard, TaskList, History, Ledger) is likewise a single flat scroll. A tabbed layout would be a new UI pattern introduced for one page while `@radix-ui/react-tabs` sits unused elsewhere in this exact way — consistency wins.
- **New React Query hooks in `apps/web/src/api/hooks.ts`** (`useAdminTaskDefinitions`, `useCreateTaskDefinition`, `useUpdateTaskDefinition`, `useArchiveTaskDefinition`, `useUpdateTaskEligibility`, `useAdminCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`) mirroring `useAdminConfig`/`useSaveConfig` exactly: one query per list endpoint, one mutation per write endpoint, `invalidateQueries` on success, no optimistic updates — because no existing admin hook in this codebase does optimistic updates, and task-definition edits are low-frequency enough that a refetch round-trip is imperceptible.
- **Recurrence editor is a plain conditional form**, not a component library widget — because CLAUDE.md §17 already constrains config UI to avoid unnecessary complexity, and the four extra fields (interval/weekdays/dayOfMonth/timeOfDay/dueOffsetMinutes) only need simple show/hide-by-type logic, not a full calendar dependency.

## Architecture

Frontend-only feature. Two new `<section>` blocks in `AdminPage.tsx` — Task Definitions and Categories — each backed by its own small set of React Query hooks that wrap the already-existing `/admin/task-definitions*` and `/admin/categories*` endpoints via the shared `api()` client, following the exact query-key/mutate/invalidate pattern already used by `useAdminConfig`/`useSaveConfig` in the same file. All strings route through `useStrings()`; all styling reuses `AdminPage.module.css`'s existing tokens plus whatever list/row/badge classes the sections need (extending that stylesheet, not creating a new one).

## Integration Points (feature mode)

- **Existing files modified**:
  - `apps/web/src/pages/AdminPage/AdminPage.tsx` — add Task Definitions and Categories sections.
  - `apps/web/src/pages/AdminPage/AdminPage.module.css` — add list/row/badge/form styles as needed, reusing existing custom properties.
  - `apps/web/src/api/hooks.ts` — add the 9 hooks listed above.
  - `apps/web/src/api/types.ts` — add `AdminTaskDefinitionDto` and `CategoryDto` if the existing types don't already cover the admin list shape (check before adding).
  - `apps/web/src/context/strings/de.ts` — add `de.admin.taskDefinitions.*` and `de.admin.categories.*` string groups.
- **New files created**: none — this fits entirely inside the existing `AdminPage` file and its neighbors.
- **Dependencies added**: none.
- **Patterns followed**: React Query hook-per-endpoint with query-key constants and `invalidateQueries` on mutation success; flat `<section>` layout with local `useState`; CSS Modules on the existing design-token vocabulary; all copy via `useStrings()`; server-returned conflict errors (`HAS_OPEN_INSTANCES`, `CATEGORY_IN_USE`) surfaced as readable messages rather than swallowed, matching the existing `de.admin.saveFailed`/`onError` pattern already in `AdminPage.tsx`.

## End Conditions (Definition of Done)

- [ ] Phase 0 baseline recorded: current `npm run typecheck` and `npm run test` output (pass/fail counts) captured before any change.
- [ ] AdminPage's Task Definitions section lists all active definitions (title, category, base value, recurrence summary, buyout flag), sourced from `GET /admin/task-definitions`; an "include archived" toggle also shows archived ones.
- [ ] Create form calls `POST /admin/task-definitions`; the new definition appears in the list without a manual reload.
- [ ] Edit form calls `PUT /admin/task-definitions/:id`; changes are reflected in the list after success.
- [ ] Archive action calls `DELETE /admin/task-definitions/:id`; a definition with open instances shows the server's `HAS_OPEN_INSTANCES` message instead of failing silently.
- [ ] Eligibility editor calls `PUT /admin/task-definitions/:id/eligibility` and round-trips included/excluded member lists.
- [ ] Categories section lists/creates/edits/deletes via `GET/POST/PUT/DELETE /admin/categories[/:id]`; a category still referenced by a task definition shows the server's `CATEGORY_IN_USE` message on delete instead of failing silently.
- [ ] Recurrence sub-form correctly shows/hides its conditional fields per the selected type (ONCE/DAILY/WEEKDAYS/WEEKLY/EVERY_N_DAYS/MONTHLY/MANUAL) and round-trips through create/edit.
- [ ] A non-admin cannot reach this UI or successfully call the underlying endpoints (existing `requireAdmin` enforcement — regression check only, no new authz code expected).
- [ ] Existing tests pass with 0 new failures.
- [ ] Typecheck passes with 0 new errors.
- [ ] New component tests cover: create-task-definition happy path, archive-with-open-instances rejection message, category create/delete, and delete-category-in-use rejection message.

## Open Questions

None — scope, conventions, and constraints were all already settled in this session before this PRD was written (see `.planning/prd-admin-onboarding.md` and `.planning/architecture-admin-onboarding.md` for the fuller context this was extracted from).
