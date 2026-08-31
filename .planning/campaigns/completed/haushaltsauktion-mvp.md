---
version: 1
id: "0fe3969b-42cb-442f-9960-3061d9e6e982"
status: completed
started: "2026-08-30T08:40:18Z"
completed_at: "2026-08-30T21:00:00Z"
direction: "Build the full Haushaltsauktion MVP defined in CLAUDE.md — chore auction app with voluntary takeover, random assignment, buyout economics, and a point ledger"
phase_count: 8
current_phase: 8
branch: null
worktree_status: null
session_cap: 3
---

# Campaign: Haushaltsauktion MVP

Status: completed
Started: 2026-08-30T08:40:18Z
Completed: 2026-08-30T21:00:00Z
Direction: Build the full MVP defined in CLAUDE.md (§40, all 17 items) to the Definition of Done in §42.

Session cap: 3 (novice trust level). Phases are ordered so that a truncated
campaign still leaves a correct, tested domain core rather than a half-built UI.

## Claimed Scope

- `apps/api/`
- `apps/web/`
- `packages/shared/`
- `prisma/`
- root config: `package.json`, `tsconfig*.json`, `docker-compose.yml`, `README.md`

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | plan | Architecture: domain model, state machine, API, concurrency design | `.planning/architecture-haushaltsauktion.md` exists AND covers all 11 entities of §27 AND specifies the transaction for each of §28's three atomic operations |
| 2 | complete | plan | UX: information architecture, screens, component model | `.planning/ux-haushaltsauktion.md` exists AND contains a wireframe for the §21 buyout decision screen showing all five §31 disclosure values |
| 3 | complete | build | Workspace scaffold, Docker, Postgres, Prisma migrations, seed | `docker compose up -d` healthy AND `prisma migrate deploy` exit 0 AND `npm run seed` creates 4 members and 6 tasks per §38 |
| 4 | complete | build | Domain core: state machine, formula evaluator, fairness selection, ledger | `npm test -w packages/shared` exit 0 AND escalation chain test asserts 4→6→9→14 AND random-completion test asserts balance delta exactly 0 |
| 5 | complete | build | API layer: Fastify routes, auth, transactional handlers | `npx tsc --noEmit` exit 0 AND integration tests pass AND concurrent-volunteer test yields exactly 1 success |
| 6 | complete | build | Frontend against the real API — no mocks | `npm run build -w apps/web` exit 0 AND Playwright login-to-dashboard test passes |
| 7 | complete | verify | Simulation (§34), E2E flows, full end-condition sweep | Simulation of 4×20×1000 shows no member above 1.5× mean random load AND all Playwright E2E specs pass |
| 8 | complete | verify | Review against spec, README, configuration docs | README documents install/start/config/architecture AND review agent reports no unresolved spec deviations |

## Phase End Conditions

| 1 | file_exists | .planning/architecture-haushaltsauktion.md |
| 1 | manual | Architecture reviewed by main agent against CLAUDE.md §27, §28, §29 |
| 2 | file_exists | .planning/ux-haushaltsauktion.md |
| 3 | command_passes | docker compose up -d && docker compose ps (all healthy) |
| 3 | command_passes | npx prisma migrate deploy (exit 0) |
| 3 | command_passes | npm run seed (exit 0) |
| 4 | command_passes | npm test -w packages/shared (exit 0) |
| 4 | command_passes | value escalation test: 4 -> 6 -> 9 -> 14 |
| 5 | command_passes | npx tsc --noEmit (exit 0) |
| 5 | command_passes | npm test -w apps/api (exit 0) |
| 5 | command_passes | concurrency test: 2 volunteers, exactly 1 success |
| 6 | command_passes | npm run build -w apps/web (exit 0) |
| 6 | visual_verify | Dashboard renders seeded tasks at 390x844 with no horizontal scroll |
| 7 | metric_threshold | simulation: max member random-load <= 1.5x mean |
| 7 | command_passes | npx playwright test (exit 0) |
| 8 | file_exists | README.md documenting install, start, configuration, architecture |
| 8 | manual | Review agent finds no unresolved deviation from CLAUDE.md |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:1 | architecture-doc | file_diff | yes | .planning/architecture-haushaltsauktion.md | pass | 2 | reviewed, 8 open questions adjudicated |
| phase:2 | ux-doc | file_diff | yes | .planning/ux-haushaltsauktion.md | pass | 2 | delivered, 5 open questions adjudicated |
| phase:3 | migrations | command_result | yes | npx prisma migrate deploy | pass | 2 | applied to live Postgres, exit 0 |
| phase:4 | domain-tests | test_result | yes | npm test (both suites) | pass | 2 | 257 tests green, typecheck exit 0 |
| phase:5 | concurrency | test_result | yes | concurrent volunteer test | pass | 2 | apps/api/test/integration/concurrency.test.ts — forced-overlap gate via pg_blocking_pids, negative control confirmed the race actually forms, 11/11 clean repeat runs, 0 orphaned rows |
| phase:6 | web-build | command_result | yes | npm run build -w apps/web | pass | 2 | 42 unit tests, 17 Playwright specs, build/typecheck/lint all clean, verified independently by main agent |
| phase:7 | simulation | metric_threshold | yes | simulation distribution report | pass | 2 | 1.005x max/mean (primary), <=1.004x across 3 alternate rate assumptions, all well under 1.5x threshold; verified independently |
| phase:8 | readme | doc_update | yes | README.md | pass | 2 | written, every documented command verified against a real running system |
| phase:8 | spec-review | manual | yes | review agent report | pass | 2 | no blocking findings; all 17 §40 items and 20 §42 checkmarks re-verified independently; one real gap found (§24 notifications, backend-only) and fixed |

## Feature Ledger

| Feature | Status | Phase | Notes |
|---------|--------|-------|-------|
| PRD | complete | 0 | `.planning/prd-haushaltsauktion.md`, user-approved 2026-08-30 |
| UX & component design | complete | 2 | `.planning/ux-haushaltsauktion.md`, 1757 lines, 12 wireframes |
| Architecture design | complete | 1 | `.planning/architecture-haushaltsauktion.md`, 2575 lines |
| Design reconciliation | complete | 2 | `.planning/reconciliation-phase1-2.md`, normative over both |
| Concurrency integration tests | complete | 5 | `apps/api/test/integration/{concurrency,happy-path}.test.ts`; proved §28's row-lock design under forced real overlap, not just `Promise.all`; 133/133 apps/api tests green |
| Buyout denial disclosure | complete | 6 | `apps/web/src/components/BuyoutDisclosure/`; fixed a live bug — buyout button was silently omitted with no reason shown when denied (§32); now shows all five §31 values plus the denial reason |
| Frontend unit tests | complete | 6 | 0 -> 42 tests (vitest + testing-library + jsdom): format utils, BuyoutDisclosure, StringsContext enum-exhaustiveness |
| Playwright E2E harness | complete | 6 | root `e2e/`, real Postgres->API->Vite->Chromium stack; 17 specs (login/dashboard flows + 390x844 no-horizontal-scroll sweep across 5 routes) |
| §34 simulation module | complete | 7 | `apps/api/src/simulation/`; 1.005x max/mean random-load ratio (threshold 1.5x), drives real domain fairness/buyout/value functions over 1000 seeded cycles |
| E2E core-mechanic flows | complete | 7 | `e2e/flow-{1,2,3,4}-*.spec.ts`: voluntary takeover, concurrent-volunteer race, random-assign+buyout+escalation, admin config edit. 23 specs total, 3x stable |
| Docker deployment | complete | 8 | `apps/{api,web}/Dockerfile`, `apps/web/nginx.conf`, `.dockerignore`; `docker compose up` now genuinely a single working command (§30) — verified end to end, not just built |
| README | complete | 8 | install/start/config/architecture/testing, every command verified against a real running system before being written down |
| §24 in-app notifications | complete | 8 | `apps/web/src/components/NotificationBell/`; review agent found the backend fully built (since early phases) with zero frontend consumption — closed rather than left as a silent gap |
| Parallel local dev workflow | complete | 8 | `apps/api` had no `dev` script and root `npm run dev` ran workspaces serially (a dev server never exits, so only the first would ever start) — found while verifying README claims against a real run, fixed with `concurrently` |

## Decision Log

- 2026-08-30: Backend is TypeScript/Node, not Kotlin/Spring. CLAUDE.md §30 left this
  open; user chose TS. One language across the stack, and it matches the provisional
  harness config.
- 2026-08-30: Fastify over Express. §36 requires server-side validation and rate
  limiting on critical actions; Fastify has both natively with real TS types.
- 2026-08-30: Prisma for schema and migrations. §37 requires migrations and full typing.
- 2026-08-30: Vite SPA over Next.js. The API is a separate service, so SSR buys nothing
  and doubles the deploy surface.
- 2026-08-30: Buyout charges the pre-increase value, then raises it. Fixed by the worked
  example in §21 (cost 6, resulting value 9).
- 2026-08-30: Voluntary takeovers are released free, never bought out. §8 scopes buyout
  to random assignments; charging to un-volunteer would punish the behavior the product
  exists to encourage.
- 2026-08-30: `preventImmediateReassignment` degrades rather than deadlocks. If the
  cooldown empties the eligible set, it is dropped and `constraint_relaxed` is written
  to the audit log.
- 2026-08-30: WEIGHTED_FAIRNESS formula defined in PRD §3E with a 0.1 weight floor, so
  no member becomes permanently unreachable and §34's simulation cannot show exclusion.
- 2026-08-30: `currentValue` lives on TaskInstance only and resets on completion *and*
  on expiry, so inflated value cannot ratchet across occurrences.
- 2026-08-30: Formula evaluation is a hand-rolled arithmetic AST evaluator. §17 forbids
  eval(); a ~120-line auditable parser beats a general expression library's attack surface.
- 2026-08-30: Phase 5 concurrency test gates from outside the process (an external
  transaction takes `FOR UPDATE` on the target row first, confirmed via
  `pg_blocking_pids`) rather than through `Deps.hooks.beforeLock`. Finding:
  `beforeLock` is dead code — `app/deps.ts` documents it as the seam for exactly
  this kind of two-party barrier test, but no use-case (`volunteerForTask`,
  `completeTask`, `executeBuyout`, `reopen.ts`) ever calls it, only `afterLock`.
  Not fixed (out of scope for a testing task) — needs a decision: wire it up or
  delete the comment describing a capability the code doesn't have.
- 2026-08-30: Phase 7's E2E-flow sub-agent reported "3/3 stable runs," but the
  first main-agent verification run afterward found `flow-3` (random
  assignment + buyout — the app's core mechanic) skipping or intermittently
  failing on repeat runs. Root-caused and fixed directly rather than accepted
  as-is, since a skip on exactly the flow this phase exists to prove would
  have left the campaign's Definition of Done (§42: "Zufallsvergabe
  funktioniert", "Freikauf funktioniert") unverified in practice. Two real,
  independent bugs, both in test infrastructure, not app logic:
  (1) the background sweep worker (`SWEEP_INTERVAL_SECONDS`, on by default)
  ran throughout every E2E session and raced the deterministic test-triggered
  sweep, materializing instances with real (minutes-out) `offerExpiresAt`
  instead of the immediately-ripe one seed/fixture scripts use — fixed by
  disabling it for the E2E process (`playwright.config.ts`) and by
  `apps/api/prisma/e2e-fixture-refresh.ts` ripening any leftovers from
  before that fix, without ever deleting a `TaskInstance` (ledger integrity,
  `onDelete: Restrict`). (2) `clearAssignedTasks` trusted `waitForURL` as
  proof the detail page had rendered; react-router v7 updates the URL before
  the transitioned route's DOM commits, so under multiple simultaneous
  assignments (which the fix above now makes routine) button queries could
  hit the still-mounted list page and throw a strict-mode multi-match —
  fixed by waiting for the detail page's own heading instead. Verified 3x
  stable after both fixes, by the main agent, not re-delegated.
- 2026-08-30: `docker-compose.yml` declared `build.dockerfile` for `api` and
  `web` but neither Dockerfile existed — `docker compose up` (§30's required
  single command) would have failed at the build step. Wrote both, fixed the
  `api` healthcheck's path (`/health`, which never existed, to the real
  `/healthz`), and verified the full stack end to end rather than just
  confirming the images built: all three services healthy, SPA served,
  `/api/*` correctly reverse-proxied through nginx to the `api` service, a
  proxied `GET /api/config/public` reaching the real route (401, not a proxy
  404). `prisma migrate deploy` runs on every container start (idempotent) so
  no separate manual migration step is needed; seeding stays a deliberate
  one-off command, not automatic, so a real deployment is never silently
  reseeded on restart.
- 2026-08-30: Phase 8 review agent (read-only, full CLAUDE.md re-read, ran
  every verification command itself rather than trusting prior claims) found
  no blocking issues — all 17 §40 MVP items and all 20 §42 DoD checkmarks
  confirmed genuinely true, §44 invariants confirmed structurally enforced
  (zero-points-for-random-completion goes through one function no config key
  can bypass), household-scoping confirmed by a custom ESLint rule
  (`eslint-rules/index.js`) plus manual review, argon2id password hashing
  with timing-attack mitigation confirmed, audit log coverage confirmed
  complete for all listed categories, §33 Market Value confirmed correctly
  out-of-scope per CLAUDE.md's own text. One genuine, previously-unflagged
  gap: §24 in-app notifications were fully implemented on the backend
  (`GET/POST /notifications*`, written transactionally on assignment/
  completion/buyout) but had zero frontend consumption — dead functionality,
  not a recorded scope decision. Not left as-is: closed with
  `NotificationBell` (bell icon, unread badge, drawer), which required
  enriching `listNotifications` with a `taskTitle` join (same pattern
  `listHistory` already used) since the raw payload alone couldn't produce a
  useful message. Verified against a live dev server that the enriched API
  response's `taskTitle` values match the rendered German copy exactly.
- 2026-08-30: While verifying the README's own local-dev instructions
  against a real run (not trusting them once written), found `apps/api` had
  no `dev` script at all, and that the root `dev` script
  (`npm run dev --workspaces --if-present`) runs workspace scripts serially
  — since a dev server never exits, only the first workspace's would ever
  start. Fixed with `concurrently`, confirmed both `localhost:3000` and
  `localhost:8080` come up together afterward.

## Review Queue

- [x] Architecture: concurrency design for §28's three atomic operations — verified under
  real forced concurrent load in Phase 5, design holds, no bug found
- [x] UX: buyout decision screen must give both options equal visual weight (§31, no dark
  patterns) — fixed, commit 7f10477 (Accept and Buyout both `variant="secondary"`)
- [x] Security: verify no binding value (buyout cost) is ever computed client-side (§36) —
  confirmed by the Phase 8 review agent: `executeBuyout.ts` only ever compares
  client-submitted values against server-recomputed ones (`QUOTE_STALE` protocol);
  spot-checked TaskCard.tsx and ValueChip.tsx beyond BuyoutDisclosure, both display-only
- [x] Code health: `Deps.hooks.beforeLock` is documented but dead (no caller) — removed,
  commit 7f10477

All Review Queue items closed as of Phase 8.

## Circuit Breakers

- 3+ consecutive sub-agent failures on the same phase
- Typecheck introduces 5+ new errors
- Any test asserting a §44 invariant fails and is not fixed within 2 attempts
- Ledger integrity check fails (sum of transactions != cached balance)
- Session cap of 3 reached — park with continuation state written
- Direction drift: features appear that serve no §40 MVP item

## Active Context

**2026-08-30 reconciliation (session resume via `/do continue` -> `/archon continue`):**
This section and Continuation State below were stale — they still described the
Phase 1/2 dispatch from the very start of the campaign, while `git log` shows work
has actually progressed past that through Phase 6 (5 build commits: scaffold,
domain core, HTTP API layer, and a substantial React/Vite frontend with routing,
auth, dashboard, admin config UI). Verified actual state before resuming:

- Phase 1-4: confirmed complete. Docs exist, Docker/Postgres healthy, migrations
  applied, `npm test -w packages/shared` — 128 tests pass.
- Phase 5 (API layer): code exists and works — `npx tsc --noEmit` clean,
  `npm test -w apps/api` — 129 tests pass. But its own exit condition
  ("concurrent-volunteer test yields exactly 1 success") is **not met**: no
  integration test exercises the real HTTP layer or the row-locking in
  `apps/api/src/app/tx.ts` under concurrency — only domain-level unit tests
  exist (`apps/api/test/domain/*`, no `apps/api/test/http` or similar).
  Reopened as in-progress rather than left "pending" or wrongly marked complete.
- Phase 6 (frontend): far more built than tracking showed (Dashboard, Login,
  TaskList, TaskDetail, Account, History, Ledger, Admin pages all exist and
  `npm run build -w apps/web` is clean), but `apps/web` has **zero test files**
  (`npm test -w apps/web` exits 1: "No test files found") and there is no
  Playwright install/config/spec anywhere in the repo, despite the root
  `"e2e": "playwright test"` script and this phase's required
  login-to-dashboard E2E test. Also found one abandoned half-feature from an
  interrupted prior session: `apps/web/src/strings/de.ts` has unused
  `buyout.disabled` / `buyout.reasons` translation strings (uncommitted) that
  are never imported or rendered anywhere — the buyout-denial-reason UI they
  were meant for was never wired up.
- Phase 7-8: not started.

**2026-08-30, later same session — Phases 5 and 6 both closed.** Both sub-agents
verified independently by the main agent (re-ran every command, did not trust
agent-reported output): apps/api 129->133 tests green, apps/web 0->42 tests
green, 17/17 Playwright specs green (run 3x), root typecheck/build/lint clean.
Commits 09d16de (Phase 5) and 79a2f8c (Phase 6).

Direction alignment check (due every 2 phases): re-read Direction against the
Feature Ledger — every item added this session (concurrency proof, buyout
disclosure fix, unit tests, E2E harness) serves an explicit §40 MVP line or
§42 DoD line. No drift.

**2026-08-30, later same session — Phase 7 closed.** Two sub-agents (simulation
module, E2E flows) ran in parallel; both delivered real, working results, but
the E2E agent's "3/3 stable" claim didn't survive the main agent's own
re-verification — see the two Decision Log entries above for what broke and
how it was fixed directly (not re-delegated). Commits 9eb14f8 (simulation)
and 817e733 (E2E flows + fixes). Final state re-verified by the main agent
after fixing: full `npm test` (309 tests: 128+139+42), `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run sim -w apps/api`, and `npx
playwright test` (23 specs) all green — the last one run 3x consecutively.

Direction alignment check: due again at phase 9, but there is no phase 9 —
next is Phase 8, the final phase. Spot-checked anyway: simulation and E2E
work both trace directly to §34 and §35/§42.

**2026-08-30, later same session — Phase 8 in progress.** Both open Review
Queue items closed (commit 7f10477): buyout decision screen now gives Accept
and Buyout equal visual weight (§31/§32), and `Deps.hooks.beforeLock` dead
code removed. Two more real DoD gaps found and fixed (not just documented
around): `docker-compose.yml` referenced `apps/api/Dockerfile` and
`apps/web/Dockerfile`, neither of which existed — `docker compose up` (§30's
required single command) would have failed at the build step. Wrote both
(commit 02ec7d4), verified end to end (`docker compose build && up -d`, all
three services healthy, SPA served, `/api/*` correctly reverse-proxied,
health-check path fixed from a nonexistent `/health` to the real `/healthz`).
README.md written and committed (8e015ae) — install, start, config,
architecture, testing, demo credentials; every documented command verified
against the actual running system before being written down, including the
Docker seed command.

Dispatched a Review Agent (per CLAUDE.md §2/§41's own stated methodology)
for the final spec-deviation pass. Its report: no blocking findings, one
real gap (§24 notifications, backend-only) — see Decision Log. Closed it
directly (commit 86736f0), including the `listNotifications` title-join
enrichment needed to make the messages actually useful. While verifying the
README's dev-workflow claims against a real run, found and fixed a second,
unrelated real bug: `apps/api` had no `dev` script and root `npm run dev`
ran workspaces serially rather than in parallel (commit 5d9d766).

Final verification, run by the main agent after every fix above (not
trusted from any sub-agent or written claim): `npm run typecheck` (root +
e2e) clean; `npm test` — 314/314 (128 shared + 139 api + 47 web); `npm run
lint` clean; `npm run build` clean; `npm run sim -w apps/api` — 1.005x
max/mean, PASS; `docker compose build && up -d` — all three services
healthy, verified end to end; `npx playwright test` — 23/23, run multiple
times across this session's fixes, consistently green. All Review Queue
items closed. All 8 phases complete.

**Campaign complete.** No known open gaps against CLAUDE.md. Moving to
`.planning/campaigns/completed/`.

## Continuation State

Phase: 8 — complete. Campaign complete.
Sub-step: none — nothing left to resume
Files modified this session: see commit list in Active Context above
  (2a39f16 through 86736f0, plus 5d9d766 and this file's final update)
Blocking: none

<!-- session-end: 2026-08-30T12:43:05.821Z -->

## Adjudicated: Frontend Agent open questions (2026-08-30)

Ruled by main agent. All five accepted, with reasoning recorded so they are not re-debated.

1. **No leaderboard in the MVP — ACCEPTED.** §19 lists a Rangliste as optional and then says
   it must not sit at the centre of the UX because the goal is cooperation, not competition.
   An unranked fairness bar serves the stated intent; a ranked list works against it. Not a
   scope cut — a correct reading.
2. **Symmetric two-tap friction on the decision screen — ACCEPTED.** It trades against §31's
   "wenige Klicks", but the alternative is an asymmetric nudge on the one screen where §31
   explicitly forbids one, and a mis-tap here costs real points. Two taps on both branches is
   the right side of that trade.
3. **First-run "Beispielaufgaben übernehmen" — ACCEPTED.** A household created through the UI
   should not need the seed script to become useful. Cheap, and it removes an empty-state dead end.
4. **Dev-only demo login row with a production build assertion — ACCEPTED.** A demo login that
   survives into production is a credential bypass. The build check is worth its small cost.
5. **Two webfonts (~65 KB) — ACCEPTED.** Acceptable on a household-scale app (§43 is explicit
   that this is not a high-load platform). Fonts must be self-hosted and preloaded, not fetched
   from a third party, so the app keeps working on a LAN and leaks nothing.

All five API additions requested in UX §11 are accepted and must appear in the architecture:
aggregate `GET /api/dashboard`; `GET /api/config/public` (member-safe subset only);
`POST /api/admin/config/preview` (server-evaluated, never client-side); the `BuyoutQuote`
token with `409 QUOTE_STALE`; and `GET /api/assignments/:id/explanation` with enum reasons
rather than prose. Plus a stable machine-readable `code` on every 4xx, and `TaskHistoryEvent`
as a discriminated union with typed payloads so the German wording lives in the copy deck.
