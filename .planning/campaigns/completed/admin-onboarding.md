---
version: 1
id: "beb4b00f-b2c1-4f8c-87b5-5b236f0f70e1"
status: completed
started: "2026-08-30T19:39:05Z"
completed_at: "2026-08-30T23:10:00Z"
direction: "Close three post-MVP gaps in Haushaltsauktion: no in-app way to create a household (token-gated registration), and no admin UI for the already-built member and task-definition CRUD"
phase_count: 6
current_phase: 5
branch: null
worktree_status: null
session_cap: 3
---

# Campaign: Admin Onboarding (Registration + Members/Task-Definitions Admin UI)

Status: completed
Started: 2026-08-30T19:39:05Z
Completed: 2026-08-30T23:10:00Z
Direction: Build the 3 features and 6 phases defined in `.planning/architecture-admin-onboarding.md` (PRD: `.planning/prd-admin-onboarding.md`), both approved by the user this session. Post-MVP feature work on a codebase that already completed one full Archon campaign (`.planning/campaigns/completed/haushaltsauktion-mvp.md`) — match its established conventions rather than introducing new ones.

Also satisfies: `.planning/prd-task-management.md` (approved 2026-08-30) — its entire scope is a subset of this campaign's Phase 4 (task-definition + category admin panel). No separate campaign was created for it; see Decision Log below.

Session cap: 3 (novice trust level, per `.claude/harness.json`). Phases are ordered so registration (backend+frontend, phases 1-2) and the admin panels (phases 3-4) are independent pairs — a truncated campaign after phase 2 or phase 4 still leaves a fully working, tested slice rather than two half-built features.

## Claimed Scope

- `apps/api/src/config.ts`, `apps/api/src/infra/auth/session.ts`, `apps/api/src/infra/http/routes/{register.ts,auth.ts}`, `apps/api/src/infra/http/server.ts`, `apps/api/prisma/schema.prisma` + migrations
- `apps/web/src/pages/{RegisterPage,AdminPage,LoginPage}/`, `apps/web/src/router.tsx`, `apps/web/src/api/{hooks.ts,types.ts}`, `apps/web/src/context/strings/de.ts`
- `README.md`

Explicitly NOT touched: business logic, existing routes other than `auth.ts`'s login handler (refactor-only), `packages/shared` (no new shared types needed).

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 0 | complete | verify | Baseline — record current typecheck/test state | `npm run typecheck` and `npm run test` output captured and written to this file's Active Context |
| 1 | complete | build | Registration backend — token-gated `POST /api/register`, `issueSession` extraction, migration | Route 404s with `SETUP_TOKEN` unset; correct token creates Household+Config+User+Member(ADMIN) atomically + logs in + audits `HOUSEHOLD_REGISTERED`; wrong token 403s with zero new rows; existing `/auth/login` tests pass unmodified |
| 2 | complete | build | Registration frontend — `/registrieren` page | Page renders, submits against Phase 1's endpoint, redirects into the app on success, surfaces server errors in German; linked from `/login` |
| 3 | complete | build | Member admin panel | AdminPage lists/adds/edits/restricts members via the existing `/admin/members*` endpoints; last-admin protection surfaced as readable error |
| 4 | complete | build | Task-definition + category admin panel | AdminPage lists/creates/edits/archives task definitions and manages categories via the existing `/admin/task-definitions*` and `/admin/categories*` endpoints; conflict errors surfaced as readable messages |
| 5 | complete | verify | Docs + final regression sweep | README documents `SETUP_TOKEN`, `/registrieren`, and `create-admin.ts` as fallback; full-repo `npm run typecheck` and `npm run test` pass with 0 new failures vs. Phase 0 baseline |

## Phase End Conditions

| 0 | command_passes | npm run typecheck (record output, does not need to be clean if baseline already has errors) |
| 0 | command_passes | npm run test (record pass/fail counts per workspace) |
| 1 | command_passes | SETUP_TOKEN unset -> POST /api/register returns 404 |
| 1 | command_passes | SETUP_TOKEN set + correct token + new email -> 200/201, session cookie set, Household+Config(v1)+User+Member(ADMIN) rows exist, one AuditEvent(HOUSEHOLD_REGISTERED) exists |
| 1 | command_passes | wrong token -> 403, zero new rows in Household/User/HouseholdMember/HouseholdConfiguration |
| 1 | command_passes | duplicate email -> same conflict shape as POST /admin/members |
| 1 | command_passes | rate limit trips at 6th request / 5min / IP |
| 1 | command_passes | existing /auth/login integration tests pass unmodified against the refactored issueSession-based handler |
| 1 | command_passes | npm run typecheck -- 0 new errors vs Phase 0 baseline |
| 1 | command_passes | npm run test -- 0 new failures vs Phase 0 baseline |
| 2 | manual | /registrieren renders and styles consistently with LoginPage |
| 2 | command_passes | successful submit redirects into the app like a successful login |
| 2 | command_passes | npm run typecheck -- 0 new errors vs baseline |
| 2 | command_passes | npm run test -- 0 new failures vs baseline; RegisterPage component test covers happy path + wrong-token error |
| 3 | command_passes | member list, add, edit (role/active/maxRandomAssignmentsPerWeek), restrictions (categories/tasks/absences) all round-trip through the existing endpoints |
| 3 | command_passes | last-admin demotion/deactivation surfaces LAST_ADMIN as a readable message |
| 3 | command_passes | npm run typecheck -- 0 new errors vs baseline |
| 3 | command_passes | npm run test -- 0 new failures vs baseline; component test covers add-member + last-admin rejection |
| 4 | command_passes | task-definition list/create/edit/archive and category list/create/edit/delete all round-trip through the existing endpoints |
| 4 | command_passes | HAS_OPEN_INSTANCES and CATEGORY_IN_USE conflicts surface as readable messages |
| 4 | command_passes | npm run typecheck -- 0 new errors vs baseline |
| 4 | command_passes | npm run test -- 0 new failures vs baseline; component test covers create-task-definition + category-in-use rejection |
| 5 | file_exists | README.md documents SETUP_TOKEN, /registrieren, and create-admin.ts fallback |
| 5 | command_passes | full-repo npm run typecheck (exit 0 or == baseline error count) |
| 5 | command_passes | full-repo npm run test (0 new failures vs baseline) |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:0 | baseline | command_result | yes | npm run typecheck && npm run test | pass | 3 | 0 typecheck errors; 314 tests passing across 18 files (shared 128, api 139, web 47) |
| phase:1 | register-endpoint | test_result | yes | apps/api integration tests for POST /register | pass | 3 | apps/api/test/integration/register.test.ts, 5 tests, all conditions covered |
| phase:1 | login-regression | test_result | yes | existing /auth/login tests | pass | 3 | happy-path.test.ts + concurrency.test.ts login coverage passes unmodified against refactored issueSession |
| phase:2 | register-frontend | test_result | yes | RegisterPage component test | pass | 3 | apps/web/src/pages/RegisterPage/RegisterPage.test.tsx, 2 tests; plus live browser verification (see Decision Log) |
| phase:3 | members-panel | test_result | yes | AdminPage members section component test | pass | 3 | MembersSection.test.tsx, 2 tests; plus live browser verification against real seeded data (see Decision Log) |
| phase:4 | task-defs-panel | test_result | yes | AdminPage task-definitions section component test | pass | 3 | TaskDefinitionsSection.test.tsx + CategoriesSection.test.tsx, 4 tests (all 4 prd-task-management.md required scenarios); plus live browser verification incl. a real create+archive round-trip (see Decision Log) |
| phase:5 | readme | doc_update | yes | README.md | pass | 3 | SETUP_TOKEN documented in env table, new "Ersteinrichtung (neuer Haushalt)" section covers both /registrieren and the create-admin.ts fallback, Konfiguration section covers the new members/task-definitions admin UI, Tests section corrects the typecheck-coverage gap and updated test count |
| phase:5 | final-regression | command_result | yes | npm run typecheck && npm run typecheck -w apps/web && npm run test (repo root) | pass | 3 | 0 errors both typecheck commands; 327/327 tests passing across 23 files (shared 128, api 144, web 55) |

## Feature Ledger

| Feature | Status | Phase | Notes |
|---------|--------|-------|-------|
| PRD | complete | 0 | `.planning/prd-admin-onboarding.md`, user-approved 2026-08-30 |
| Architecture | complete | 0 | `.planning/architecture-admin-onboarding.md`, auto-approved (all end conditions machine-verifiable per Tier 5 rules) |
| Docs + final regression sweep | complete | 5 | README.md updated: SETUP_TOKEN in the env table, new "Ersteinrichtung (neuer Haushalt)" section, Konfiguration section covers the new admin UI, Tests section documents the apps/web typecheck-coverage gap permanently (not just in this campaign's internal notes) and the updated 327-test count. |
| Task-definition + category admin panel | complete | 4 | `apps/web/src/pages/AdminPage/{TaskDefinitionsSection,CategoriesSection}.tsx` — full CRUD + eligibility + recurrence conditional-form + archive, wired to pre-existing endpoints, zero backend changes. Fully satisfies `prd-task-management.md` (all 4 of its required test scenarios covered) as well as Feature 3 of `prd-admin-onboarding.md`. `useTaskDefinitionLabels()` (Phase 3) now delegates to the new `useAdminTaskDefinitions()`, sharing one cache entry — no duplicate fetching. 4 new component tests. Live-browser-verified: real create round-trip (task + recurrence "Alle 3 Tage" rendered correctly), real archive round-trip, recurrence conditional-fields UI confirmed switching correctly between types (weekday picker for WEEKLY/WEEKDAYS, interval field for EVERY_N_DAYS). |
| Member admin panel | complete | 3 | `apps/web/src/pages/AdminPage/MembersSection.tsx` — list/add/edit/restrictions, all wired to the pre-existing `/admin/members*` endpoints, zero backend changes. `useAdminCategories`/`useTaskDefinitionLabels` added for restriction-picker labels, deliberately reusable by Phase 4. 2 new component tests (add-member happy path, LAST_ADMIN rejection). Live-browser-verified against real seeded data (see Decision Log) — restrictions sheet renders real categories/tasks, add-member round-trips through the real API with no reload. |
| Registration frontend | complete | 2 | `/registrieren` (apps/web/src/pages/RegisterPage/), `useRegisterHousehold` hook, link from LoginPage. 2 new component tests. Live-browser-verified against the real running stack (see Decision Log) — link navigation both directions, form renders all fields, real submit against the running API correctly shows the "not available" error (docker API has no SETUP_TOKEN configured), matching the documented 404-when-disabled behavior exactly. |
| Registration backend | complete | 1 | `POST /api/register` (apps/api/src/infra/http/routes/register.ts), `issueSession` extracted into infra/auth/session.ts and reused by /auth/login, `SETUP_TOKEN` env var, migration `add_household_registered_audit_action`. 5 new integration tests, all passing. Route unregistered entirely (real 404) when SETUP_TOKEN unset. |

## Decision Log

- 2026-08-30: Registration model is token-gated (SETUP_TOKEN env var), not open self-service signup — user's explicit product decision via AskUserQuestion, made before the PRD was written. Subsequent members are added by an admin via the existing `POST /admin/members`, not through `/register` again.
- 2026-08-30: `issueSession` extracted into `infra/auth/session.ts` (not duplicated into `register.ts`) — session-issuance is security-sensitive (CSRF derivation, cookie flags) and this module already owns session lifecycle helpers (`generateToken`, `csrfTokenFor`, `safeEquals`, `cookieOptions`).
- 2026-08-30: Setup-token check reuses the existing `safeEquals` constant-time compare in `session.ts` rather than a fresh `crypto.timingSafeEqual` call.
- 2026-08-30: `/api/register` is not registered on the Fastify instance at all when `SETUP_TOKEN` is unset (real 404), rather than registered-but-403 — avoids advertising a disabled admin-creation endpoint.
- 2026-08-30: `apps/api/prisma/create-admin.ts` (untracked CLI script found already sitting in the working tree) is kept as a documented emergency fallback for a lost/rotated setup token, not deleted.
- 2026-08-30: Phase 4 is sequenced strictly after Phase 3 (both modify `AdminPage.tsx`) rather than parallelized, to avoid merge conflicts in one file.
- 2026-08-30: No tabs/sub-routing introduced into `AdminPage.tsx` — two more flat `<section>` blocks, matching the page's existing single-scroll structure and the rest of the app's page style.

- 2026-08-30: User requested a separate PRD for "task creation and editing" (`.planning/prd-task-management.md`). Its scope turned out identical to this campaign's already-planned Phase 4 (task-definition + category admin panel) — approved as its own document, but not given a separate architecture/campaign, since Phase 4 already satisfies every one of its end conditions. Both PRDs' `Open Questions`/reconciliation sections cross-reference this decision.
- 2026-08-30: User approved both PRDs and directed execution to proceed, plus asked for a continuation schedule in case the campaign is unfinished when this session ends.
- 2026-08-30: Live-browser-verified Phase 4 against the same real dev stack: `/verwaltung` renders "Aufgaben verwalten" (all 6 real seeded task definitions, correct recurrence summaries — "Wöchentlich", "Täglich", "Monatlich (Tag 1)", "Mo, Do", "Alle 2 Tage") and "Kategorien" (all 4 real categories, editable). Opened the create-task Sheet and confirmed the recurrence conditional-fields logic actually switches (weekday checkboxes for WEEKLY, replaced by an interval field for EVERY_N_DAYS — verified `next-occurrence.ts` really does use `weekdays[0]` as the WEEKLY anchor, so showing weekday-picker for WEEKLY too is correct, not a bug). Created a real task definition ("Smoke Test Aufgabe", every 3 days) — appeared in the list immediately with correct recurrence text and no reload; archived it via the real "Archivieren" action — "Aufgabe wurde archiviert." confirmed, disappeared from the active list. Deleted the row directly from dev Postgres afterward (archiving alone leaves it soft-deleted/queryable via "archivierte einschließen", so removed it outright to avoid polluting seed data, same as the Phase 3 member cleanup).
- Direction alignment check (every 2 phases, per Archon protocol — due again after Phase 4): re-read the campaign Direction against the Feature Ledger. All 4 build phases (registration backend/frontend, member panel, task-definition/category panel) map directly onto the three gaps named in the Direction — no drift. All three PRD features are now built; only Phase 5 (docs + final regression sweep) remains.
- 2026-08-30: Live-browser-verified Phase 3 against the actual dev stack (Vite dev server on :5173 proxying to the already-running dockerized API/DB, logged in as the seeded admin Elke): `/verwaltung` renders a "Mitglieder" section listing all 4 real seeded members with correct roles/points/emails; the restrictions Sheet for Hannes renders the real 4 categories and 6 task titles from the live API; used "Mitglied hinzufügen" to actually create a member (smoke-member@demo.local) — it appeared in the list immediately with the correct "Mitglied wurde angelegt." status message and no page reload, proving the real create→invalidate→refetch round-trip works. Cleaned up the test member directly from the dev Postgres afterward (`DELETE FROM household_members ...; DELETE FROM users ...;`) so it doesn't pollute the seed data for future sessions.
- 2026-08-30: Phase 2 quality spot-check found the campaign's own Phase 0 baseline claim was incomplete: root `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) only `include`s `packages/shared` and `apps/api` — it never compiles `apps/web` at all. This is pre-existing repo structure (apps/web has always had its own separate `npm run typecheck -w apps/web`), not something this campaign introduced, but every remaining phase's "0 new typecheck errors vs baseline" end condition for frontend work needs `npm run typecheck -w apps/web` run explicitly alongside the root command, not assumed to be covered by it. Ran it for Phase 2: 0 errors. Will do the same for Phases 3-5.
- 2026-08-30: Per CLAUDE.md's UI-verification requirement (component tests prove correctness, not that the feature actually works in a browser), ran a live check of Phase 2's output: started `apps/web`'s Vite dev server against the already-running dockerized API/DB stack, navigated `/login` → `/registrieren` → submitted the real form → confirmed the "registration not available" error renders correctly (the docker API container has no `SETUP_TOKEN` set, so this exercised the genuine 404-disabled path end to end, not a mock) → navigated back to `/login`. All matched the documented behavior. Dev server and browser tab cleaned up afterward.
- 2026-08-30: Phase 1 quality spot-check found the delegated sub-agent had reused `ConflictError('CATEGORY_IN_USE', ...)` for register's duplicate-email case (matching an existing, already-questionable convention in `admin.ts`'s `POST /admin/members`, per the sub-agent's own instructions to mirror it). Judged this would actively hurt Phase 2 (the very next phase, which needs to branch on this exact code to show a readable "email already registered" message) — fixed directly rather than carried forward: added a proper `EMAIL_ALREADY_REGISTERED` code to `packages/shared/src/api/errors.ts` (`ErrorCode` + `ErrorDetailsByCode`) and `apps/api/src/infra/http/error-mapper.ts`'s `STATUS_BY_CODE` (409, TypeScript's `Record<ErrorCode, number>` enforces every code has an entry), updated `register.ts` and its test to match. Did not touch `admin.ts`'s pre-existing `CATEGORY_IN_USE` reuse — out of scope for this campaign, flagging here in case a future cleanup pass wants it.
- 2026-08-30: Checked `/daemon start` for that scheduling request — its own trust gate hard-blocks daemon activation at novice trust level (0-4 sessions) regardless of how the request is phrased; also confirmed RemoteTrigger is connected but is opt-in-only in this harness (counts against a 15-routine-runs/24h account-wide cap, not the default path). Did not override the block. Asked the user; they chose manual continuation over a Windows Scheduled Task workaround — no daemon.json, no OS-level scheduled process. Continuation relies entirely on this file's Continuation State plus `/do continue`.

## Review Queue

(none yet)

## Circuit Breakers

Status: armed, none tripped.

## Active Context

Phase 0 (Baseline) complete: `npm run typecheck` clean (0 errors), `npm run test` all green — 314 tests / 18 files (packages/shared 128, apps/api 139, apps/web 47). This is the regression baseline every later phase's end conditions diff against.

Daemon mode was considered per the user's request for scheduled continuation, but `/daemon`'s own trust gate hard-blocks activation at this project's current novice level (0-4 sessions) — not overridden. User chose manual continuation instead: no daemon.json, no scheduled task. This campaign's Continuation State (below) is kept current after every phase, so any future session running `/do continue` or `/archon continue` in this repo resumes exactly where the last one left off.

Phase 1 (Registration backend) complete. Delegated to a sub-agent; verified independently (typecheck clean, full test suite 319/319 passing across 19 files, up from the 314/18 baseline). One quality-spot-check fix applied on top of the sub-agent's work (see Decision Log: `EMAIL_ALREADY_REGISTERED` error code). `apps/api/prisma/create-admin.ts` untouched, kept as documented fallback.

Phase 2 (Registration frontend) complete, live-browser-verified. Direction alignment check (every 2 phases, per Archon protocol): re-read the campaign Direction against the Feature Ledger — Phases 1-2 (registration backend + frontend) are squarely the "token-gated registration" gap named in the Direction. Aligned, no drift.

Registration is now fully done end-to-end (Features 1 of 3). Remaining: Phase 3 (member admin panel) and Phase 4 (task-definition + category admin panel) — Features 2 and 3, and the only things `prd-task-management.md` needs. Phase 5 (docs) closes out both PRDs.

Phase 3 (Member admin panel) complete, independently re-verified (typecheck x2, full test suite 323/323) and live-browser-verified against real seeded data, including an actual create round-trip (test row cleaned up afterward).

Phase 4 (Task-definition + category admin panel) complete, independently re-verified (typecheck x2, full test suite 327/327 across 23 files) and live-browser-verified including a real create+archive round-trip. This also fully closes out `.planning/prd-task-management.md` — all 4 of its explicitly-required test scenarios are covered.

All build work is done. Only Phase 5 (docs + final regression sweep) remains before this campaign completes.

Phase 5 complete. README updated (SETUP_TOKEN, Ersteinrichtung section, admin UI mentioned in Konfiguration, corrected test count and typecheck-coverage note). Final regression sweep green: `npm run typecheck` 0 errors, `npm run typecheck -w apps/web` 0 errors, `npm run test` 327/327 across 23 files.

**Campaign complete.** All 3 features from both PRDs are built, tested, and live-browser-verified:
1. Token-gated household registration (`/registrieren` → `POST /api/register`)
2. Member admin panel (list/add/edit/restrict, wired to pre-existing endpoints)
3. Task-definition + category admin panel (full CRUD + eligibility + recurrence, wired to pre-existing endpoints)

`.planning/prd-admin-onboarding.md` and `.planning/prd-task-management.md` both have their end conditions satisfied by this campaign. Neither PRD's own file was edited to reflect this — checked first: `.planning/prd-haushaltsauktion.md` (the original MVP PRD) still reads `Status: awaiting approval` even though that campaign is long since `completed/`, confirming this project's convention is that PRD status fields are not retroactively updated once a campaign finishes — the campaign file (and, here, its move to `completed/`) is the actual completion record, not the PRD.

## Continuation State

- Not applicable — campaign is complete, no further sessions needed for this work.
