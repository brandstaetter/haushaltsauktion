# PRD: Admin Onboarding — Household Registration + Members/Tasks Admin UI

> Description: Close three post-MVP gaps — no in-app way to create a household, and no admin UI for the member/task-definition CRUD the backend already supports.
> Author: Hannes Brandstätter-Müller
> Date: 2026-08-30
> Status: approved
> Mode: feature

## Problem

The MVP campaign (closed 2026-08-30, see `.planning/campaigns/completed/haushaltsauktion-mvp.md`) shipped a working auction loop, but three onboarding paths were never wired up:

1. **No API endpoint creates a `Household`.** The only way one exists today is an untracked, uncommitted CLI script (`apps/api/prisma/create-admin.ts`) that prompts interactively on the server's terminal. This directly conflicts with CLAUDE.md §37 ("betreibbar für eine Familie ohne eigenen Systemadministrator") — a family with no sysadmin cannot SSH in and run a script.
2. **Member management has no UI.** `POST/PATCH /admin/members` and `PUT /admin/members/:id/restrictions` are fully implemented server-side, but `AdminPage.tsx` never calls them — there's no way to add or edit a member without hitting the API directly.
3. **Task-definition management has no UI.** Same story: full CRUD + eligibility + materialize + categories exist server-side (`admin.ts` lines 228-598), with zero frontend.

## Users

- **New household founder**: a family member setting the app up for the first time, with no technical background, using a one-time setup token they were given (e.g. by whoever deployed the app).
- **Household admin**: an existing `ADMIN`-role member managing who's in the household and what chores exist, via the web UI on a phone or laptop.

## Core Features

1. **Token-gated registration**: a public `POST /register` endpoint, gated by a server-configured `SETUP_TOKEN`, creates a Household + its config + the first User + a HouseholdMember with role `ADMIN`, then logs that admin in — reachable from a new `/registrieren` page linked off `/login`.
2. **Member admin panel**: a new section in `AdminPage.tsx` to list members, add a member (email/displayName/role), and edit role/active-state/weekly-random-cap/restrictions (excluded categories, excluded tasks, absences).
3. **Task-definition admin panel**: a new section in `AdminPage.tsx` to list, create, edit, and archive `TaskDefinition`s (title, description, category, base value, recurrence, buyout toggle, eligibility), plus manage `TaskCategory` rows.

## Out of Scope (v1)

- Self-service **open** signup (anyone, no token) — explicitly rejected in favor of token-gated, per product decision.
- Inviting a specific person by emailed link/token — admins add members by email directly via the existing `POST /admin/members` (already built); no new invite-token system.
- Removing/rotating the `SETUP_TOKEN` via the admin UI — it's an env var, changed by whoever operates the deployment, not through the app.
- Editing a `TaskDefinition`'s recurrence rule builder as a fully visual calendar picker — a straightforward form (type select + conditional fields) is sufficient, matching the plainness of the rest of `AdminPage`.
- Bulk member/task import (CSV etc.).

## Technical Decisions

- **New endpoint, not new service**: `POST /register` lives in a new `apps/api/src/infra/http/routes/register.ts`, registered in `server.ts` next to the other route modules — because every existing route group follows that one-file-per-resource convention, and this is a new resource (unauthenticated registration), not a fit for `auth.ts` (which is exclusively for already-existing accounts logging in/out).
- **Setup-token comparison uses `crypto.timingSafeEqual`** (length-equalized) rather than `===` — because the codebase already treats timing side-channels on secrets as a real threat (`burnPasswordTime` in `auth.ts` exists solely to keep login's timing constant), and a naive string compare on the setup token would reintroduce exactly that class of leak.
- **Extract a shared `issueSession` helper** used by both `/auth/login` and `/register` — because `auth.ts`'s login handler currently inlines session creation + CSRF token derivation + cookie setting (~25 lines) with no reusable seam, and duplicating that logic in two places would let them drift (e.g. a future cookie-flag change applied to one but not the other).
- **`create-admin.ts` stays** as a documented emergency fallback (README gets a short section) for when `SETUP_TOKEN` is lost/rotated with no household yet created — because it's a proven, already-working escape hatch and deleting it would remove the only recovery path for that specific failure mode.
- **No new frontend routing/tabs in `AdminPage`** — the existing page is one scrolling document of `<section>` blocks (config rules today); members and task-definitions become two more `<section>` blocks in the same file, using the same `styles.section`/`styles.field`/`Button` conventions, because introducing a tabbed/routed sub-navigation would be a UI pattern this codebase doesn't otherwise use anywhere.
- **No new state library** — member/task-definition panels use local `useState` + new React Query hooks in `apps/web/src/api/hooks.ts`, mirroring `useAdminConfig`/`useSaveConfig` exactly.

## Architecture

Backend: one new unauthenticated route (`POST /register`) that reuses the exact transaction shape already proven in `create-admin.ts` (Household → HouseholdConfiguration v1 → User → HouseholdMember, one `$transaction`), then calls the new `issueSession` helper shared with login, and writes one `AuditEvent` (new `HOUSEHOLD_REGISTERED` action). No other backend changes — Features 2 and 3 are frontend-only, wiring existing admin endpoints.

Frontend: one new public page (`RegisterPage`, mirrors `LoginPage`) plus two new `<section>` blocks appended to the existing `AdminPage`, each backed by a small set of new React Query hooks in `hooks.ts` that follow the existing `api()`-wrapper + query-key + invalidate-on-mutate pattern used throughout that file. All user-facing strings route through `useStrings()`/`StringsContext` — no hardcoded German text, matching the rest of the app.

## Integration Points (feature mode)

- **Existing files modified**:
  - `apps/api/src/config.ts` — add `SETUP_TOKEN` to `EnvSchema`.
  - `apps/api/src/infra/http/server.ts` — register the new route module.
  - `apps/api/src/infra/http/routes/auth.ts` — extract `issueSession` (or move it to a shared module both `auth.ts` and `register.ts` import) and use it in the existing login handler.
  - `apps/api/prisma/schema.prisma` — add `HOUSEHOLD_REGISTERED` to the `AuditAction` enum (new migration).
  - `apps/web/src/router.tsx` — add public `/registrieren` route.
  - `apps/web/src/pages/LoginPage/LoginPage.tsx` — add a link to `/registrieren`.
  - `apps/web/src/pages/AdminPage/AdminPage.tsx` — add Members and Task-Definitions sections.
  - `apps/web/src/api/hooks.ts` — add `useRegisterHousehold`, `useAdminMembers`, `useCreateMember`, `useUpdateMember`, `useUpdateMemberRestrictions`, `useAdminTaskDefinitions`, `useCreateTaskDefinition`, `useUpdateTaskDefinition`, `useArchiveTaskDefinition`, `useAdminCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`.
  - `apps/web/src/context/StringsContext.tsx` — add new `de.register.*`, `de.admin.members.*`, `de.admin.taskDefinitions.*` string groups.
  - `README.md` — document `SETUP_TOKEN`, the `/registrieren` flow, and `create-admin.ts` as the fallback path.
- **New files created**:
  - `apps/api/src/infra/http/routes/register.ts`
  - `apps/web/src/pages/RegisterPage/RegisterPage.tsx` (+ `.module.css`)
  - A new Prisma migration for the `AuditAction` enum addition.
- **Dependencies added**: none — `crypto.timingSafeEqual` is Node built-in; everything else reuses existing deps (`zod`, `@fastify/rate-limit`, `@tanstack/react-query`).
- **Patterns followed**: route-module-per-resource, zod request schemas colocated with the route, `AuditEvent` on every admin/state-changing write, `requireAdmin`/`requireMember` context helpers, React Query hook-per-endpoint with query-key constants and `invalidateQueries` on mutation success, CSS Modules with the existing design-token custom properties (`--s-*`, `--t-*`, `--ink-*`, `--hairline`, `--r-md`), all UI strings via `useStrings()`.

## End Conditions (Definition of Done)

- [ ] Phase 0 baseline recorded: current `npx tsc --noEmit` and `npx vitest run` output (pass/fail counts) captured before any change.
- [ ] `SETUP_TOKEN` unset → `POST /register` responds 404 (endpoint effectively doesn't exist); no household can be created without it.
- [ ] `SETUP_TOKEN` set, correct token + valid new email → creates Household + HouseholdConfiguration v1 + admin User + HouseholdMember(ADMIN) atomically, logs an `AuditEvent`, and returns an authenticated session (cookie set, same shape as `/auth/login`'s response).
- [ ] Wrong token → 403, no rows created, and the response takes constant time regardless of token correctness (no early-return timing tell).
- [ ] Duplicate email → rejected with the same conflict semantics as `POST /admin/members`.
- [ ] `POST /register` is rate-limited (5/5min by IP, matching `/auth/login`).
- [ ] `/registrieren` page renders, submits, and on success navigates into the app exactly like a successful login.
- [ ] Admin panel: an admin can list members, add a new member by email, change a member's role/active state, and edit their restrictions (excluded categories/tasks, absences) — each action reflected via a subsequent `GET /admin/members` and backed by an `AuditEvent`.
- [ ] Admin panel: an admin can list, create, edit, and archive task definitions, and manage categories — each action reflected via `GET /admin/task-definitions` / `GET /admin/categories` and backed by an `AuditEvent`.
- [ ] A non-admin cannot reach any new admin UI or call the underlying endpoints (existing `requireAdmin` enforcement — regression check only, no new authz code expected).
- [ ] Existing tests pass with 0 new failures.
- [ ] Typecheck passes with 0 new errors.
- [ ] New unit/integration tests cover: registration happy path, wrong-token rejection, duplicate-email rejection, rate-limit trip, and the member/task-definition admin flows (create → appears in list → edit → reflected → archive/deactivate → reflected).

## Open Questions

None — the registration model (token-gated, first-household-only) and the panel scope (members + task-definitions, both in `AdminPage.tsx`) were decided with the user before this PRD was written. Implementation-level calls (session-helper extraction, `create-admin.ts` retention, no-tabs-in-AdminPage) are recorded as Technical Decisions above rather than left open.
