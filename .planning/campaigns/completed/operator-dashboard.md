---
version: 1
id: "609f7455-36dd-444e-b306-9cc26a424d1a"
status: completed
started: "2026-09-03T04:30:00.000Z"
direction: "Build the operator dashboard per .planning/architecture-operator-dashboard.md"
phase_count: 6
current_phase: 6
branch: null
worktree_status: null
---

# Campaign: Operator Dashboard

Status: completed
Started: 2026-09-03T04:30:00.000Z
Direction: Build the operator dashboard per .planning/architecture-operator-dashboard.md

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/prisma/migrations/**, apps/api/prisma/create-operator.ts
- apps/api/src/infra/auth/operatorSession.ts, apps/api/src/infra/http/operatorContext.ts
- apps/api/src/app/operator/**, apps/api/src/infra/http/routes/operator.ts, apps/api/src/infra/http/server.ts
- apps/api/test/integration/operator-isolation.test.ts, apps/api/test/integration/operator-metrics.test.ts, apps/api/test/integration/_fixture.ts
- apps/web/src/api/operatorClient.ts, apps/web/src/api/operatorHooks.ts, apps/web/src/api/operatorTypes.ts
- apps/web/src/pages/OperatorDashboardPage/**, apps/web/src/router.tsx
- README.md

## Intake Source

- File: .planning/intake/operator-dashboard-active-households-users-metrics.md
- Priority: normal
- Initial Status: briefed (sharpened via /citadel:grill, 2026-09-03 — six forks resolved: active-household definition, active-user recency windows, multi-operator bootstrap, v1 metric set, snapshot-vs-trend scope, auth hardening)
- Scope note (from intake): Large — a second, fully independent auth system, two new Prisma models, a new route namespace, a new frontend shell, and the one deliberate exception to CLAUDE.md §36's household-isolation guarantee.

## Delivery Brief

Full architecture: `.planning/architecture-operator-dashboard.md`. Summary —

A new platform-operator role, structurally separate from `User`/`HouseholdMember`/`Session`
(new `OperatorAccount`/`OperatorSession` Prisma models, new `operator_session` cookie,
new `requireOperator` preHandler that never touches `activeHouseholdId`), exposing
`GET /api/operator/metrics` (total/active households, total/active-24h/active-7d users,
and five v1 metrics: task throughput, ledger volume, buyout rate, Todoist adoption,
audit volume — all live aggregates, no history table) behind its own login at a
standalone `/betrieb` frontend route. Bootstrapped via a re-runnable `create-operator.ts`
CLI script (no in-app operator management, no self-service signup).

The one piece of genuinely new correctness logic is the isolation guarantee: a household
`Session` must never grant `/api/operator/*` access, and an `OperatorSession` must never
grant access to any household route. This gets its own dedicated regression test
(`operator-isolation.test.ts`), not just implicit coverage.

## Acceptance Criteria

(Full list in the intake file's Acceptance Criteria section — condensed here)

- New `OperatorAccount`/`OperatorSession` models and migration; no reuse of `User`,
  `HouseholdMember`, or `Session`.
- `npm run create-operator` creates an operator account interactively (re-runnable for
  additional operators), following the `create-admin.ts` one-time-password pattern.
- `POST /api/operator/login`/`logout` issue/revoke an `operator_session` cookie distinct
  from `SESSION_COOKIE`; cross-system access is a regression-tested 401/403 in both
  directions.
- `GET /api/operator/metrics` returns all resolved metrics, computed live, server-side,
  no client-trusted numbers (CLAUDE.md §36).
- Frontend `/betrieb` renders the metrics behind its own login, reachable without ever
  selecting or being scoped to a household.
- README documents `create-operator`, the login URL, and the identity separation.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation if a phase needs it.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | research | Baseline | typecheck (api+web) and `npm test -w apps/api` pass on current `main`, recorded in Active Context |
| 2 |  complete | build | Data model — OperatorAccount/OperatorSession | `prisma validate` and a clean `prisma migrate dev` pass; existing test suite unaffected |
| 3 |  complete | build | Operator identity infrastructure | `create-operator.ts` re-runnable and working; `operatorSession.ts`/`operatorContext.ts` unit-testable in isolation, no `RequestContext` coupling |
| 4 |  complete | build | Operator routes + isolation guarantee | login/logout/metrics work end-to-end; isolation regression test passes in both directions; typecheck+tests green |
| 5 |  complete | build | Operator frontend | `/betrieb` login→dashboard→logout works against the real API in a manual check; web typecheck passes |
| 6 |  complete | verify | Documentation + final verification | README "Operator-Dashboard" section written; full `npm run typecheck` and `npm test` green across both workspaces |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:1 | baseline-check | command_result | yes | typecheck (api+web) + `npm test -w apps/api` all pass pre-change | pass | 3 | record baseline |
| phase:2 | schema-migration | command_result | yes | `prisma validate`/`format` clean; migration `20260903043326_add_operator_accounts` applied to local dev DB; `prisma generate` completed after orchestrator cleared a file lock; typecheck+270/270 tests green; phase-validator: pass | pass | 3 | — |
| phase:3 | identity-infra | file_diff | yes | create-operator.ts (re-runnable, guards only on duplicate email), operatorSession.ts (reuses session.ts crypto, no duplication), operatorContext.ts (no householdId/RequestContext coupling, verified by reading the file) present; smoke-tested issue/resolve/revoke round trip against real dev DB; typecheck+270/270 tests green; phase-validator: pass | pass | 3 | — |
| phase:4 | isolation-test | test_result | yes | operator-isolation.test.ts: 4 tests, both isolation directions + positive-path sanity, all pass; operator-metrics.test.ts: 3 tests, race-condition fixed (boundary-proof assertions instead of flaky deltas under vitest fileParallelism); server.ts wiring and rate-limit config confirmed by validator reading actual file contents; typecheck+277/277 tests green (25 files); phase-validator: pass | pass | 3 | — |
| phase:5 | frontend-flow | manual | yes | Orchestrator performed the real manual browser check itself (Chrome automation): login → dashboard rendered real live metrics → logout redirected correctly (confirms reactive-cache fix) → direct nav to /betrieb while logged out redirected to login (guard confirmed). Test account created and cleaned up. Router nesting, cache-subscription fix, and independent CSRF state confirmed by validator reading actual code. Unrelated finding: a stale, unrelated Docker stack (`hausarbeitsbrse-*`) squats ports 3000/8080 via IPv6 on this machine — worked around for verification via explicit IPv4/DNS ordering, not a campaign bug, flagged to user separately. phase-validator: pass | pass | 3 | — |
| phase:6 | final-verification | command_result | yes | README "Betriebsdashboard (Operator-Dashboard)" section added (setup command, `/betrieb` login URL, identity-separation rationale, no new env var). Final clean-slate run: `npm run typecheck -w apps/api` clean, `npm run typecheck -w apps/web` clean, `npm test -w apps/api` 25/25 files 277/277 tests, `npm test -w apps/web` 19/19 files 110/110 tests | pass | 3 | — |

## Decision Log

- 2026-09-03T04:30:00.000Z: Created campaign from `.planning/architecture-operator-dashboard.md`, itself derived from a grill-sharpened intake item.
  Reason: architecture already resolved every open fork (active-household definition, metric set, auth hardening, etc.) — no further design decisions expected during build; campaign is pure execution against a settled plan.
- 2026-09-03T04:30:00.000Z: Baseline (Phase 1) confirmed green before any change — see Active Context.
- 2026-09-03T04:38:00.000Z: Phase 2 (data model) complete and validator-confirmed pass. `prisma generate`'s native-engine step initially failed with EPERM because the user's running `npm run dev -w apps/api` (tsx watch) held `query_engine-windows.dll.node` open. Orchestrator asked the user for confirmation, killed the three dev-server node processes, re-ran `prisma generate` successfully, and re-verified typecheck+tests green.
  Reason for the flag: this is an operational side effect of the campaign (the user's dev server was stopped) that they need to know about — they'll need to restart `npm run dev -w apps/api` themselves whenever they next want the dev server running.
- 2026-09-03T04:44:00.000Z: Phase 3 (operator identity infrastructure) complete and validator-confirmed pass. `operatorSession.ts` reuses `session.ts`'s crypto primitives (`generateToken`/`hashToken`/`csrfTokenFor`/`cookieOptions`) rather than duplicating them; `operatorContext.ts` kept structurally separate from `context.ts` per the architecture's Key Decision, confirmed to have no `householdId` field or `RequestContext` import.
- 2026-09-03T04:53:00.000Z: Phase 4 (operator routes + isolation guarantee) complete and validator-confirmed pass. The implementing agent's own first draft of `operator-metrics.test.ts` used before/after delta assertions that were flaky under vitest's `fileParallelism` (other integration files mutate the same global tables concurrently) — it caught this itself, root-caused it correctly as a race rather than a logic bug, and rewrote to boundary-proof assertions against a known fixture row. Validator independently confirmed both isolation directions, the rate-limit config, and the 14-day `households.active` window by reading the actual file contents, not just trusting the HANDOFF.
  Reason for logging: this is the phase with the campaign's one genuinely load-bearing new correctness guarantee (CLAUDE.md §36 cross-household isolation) — worth recording that both the implementer and the validator did real, independent verification rather than rubber-stamping.
- 2026-09-03T05:05:00.000Z: Phase 5 (operator frontend) complete and validator-confirmed pass. The implementing fork caught and fixed its own bug (non-reactive `getQueryData()` read that would have broken logout updating an already-mounted dashboard). Orchestrator then performed the actual manual browser verification the fork couldn't (no browser in that environment): full login→dashboard→logout→guard-redirect cycle against the real API, using Chrome automation. Discovered and worked around an unrelated environmental issue — a stale Docker stack (`hausarbeitsbrse-api-1`/`-web-1`, unrelated project, running 24h) squatting ports 3000/8080 on IPv6, causing "localhost" to resolve to the wrong server for both curl and the Vite dev proxy. Not a campaign bug; not fixed in code — worked around for verification only via `--dns-result-order=ipv4first`. Flagged to the user directly (not silently fixed, since it involves another project's containers).
  Reason for logging: (1) genuine end-to-end proof this feature works, not just typecheck/unit coverage; (2) the Docker port conflict is worth the user's awareness even though it's out of this campaign's scope.

## Active Context

All 6 phases complete and validated. Phase 6 (documentation + final verification) starting now: README section, then a full clean-slate typecheck+test run across both workspaces before closing the campaign. Note for the user (carried over): their `npm run dev -w apps/api` watcher is still stopped from Phase 2's file-lock fix — restart with `npm run dev -w apps/api` when needed. Separately, an unrelated Docker stack (`hausarbeitsbrse-api-1`/`-web-1`) has been squatting ports 3000/8080 on this machine for 24h+; worth checking whether that's still needed.

## Continuation State

Phase: 6 (in-progress)
Sub-step: writing README section
Files modified: apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260903043326_add_operator_accounts/migration.sql (new), apps/api/src/infra/auth/operatorSession.ts (new), apps/api/src/infra/http/operatorContext.ts (new), apps/api/prisma/create-operator.ts (new), apps/api/package.json (+create-operator/precreate-operator scripts), apps/api/src/app/operator/metrics.ts (new), apps/api/src/infra/http/routes/operator.ts (new), apps/api/src/infra/http/server.ts (modified), apps/api/test/integration/_fixture.ts (modified), apps/api/test/integration/operator-isolation.test.ts (new), apps/api/test/integration/operator-metrics.test.ts (new), apps/web/src/api/operatorClient.ts (new), apps/web/src/api/operatorTypes.ts (new), apps/web/src/api/operatorHooks.ts (new), apps/web/src/pages/OperatorDashboardPage/* (new), apps/web/src/router.tsx (modified)
Blocking: none
User note (carried forward): npm run dev -w apps/api was stopped in Phase 2 to release a file lock; user has not restarted it. Unrelated Docker stack squatting ports 3000/8080 — flagged, not touched.
checkpoint-phase-1: none (read-only phase, no checkpoint needed)
checkpoint-phase-2: none (git diff/checkout used for recovery instead of stash, to keep this campaign file itself editable throughout — stashing would remove in-progress planning docs from the working tree)
checkpoint-phase-3: none (same reasoning as phase 2 — additive new files only, git diff/checkout sufficient for recovery)
checkpoint-phase-4: none (same reasoning — additive new files plus two small, isolated modifications to server.ts/_fixture.ts, both easily diffed and reverted if needed)
checkpoint-phase-5: none (same reasoning — additive new files plus one router.tsx modification, easily diffed and reverted if needed)

## Completion Record

- Completed At: 2026-09-03T05:06:48.836Z
- Outcome: review-package
- Verification: typecheck (api+web) clean; npm test -w apps/api 25/25 files 277/277 tests; npm test -w apps/web 19/19 files 110/110 tests; manual browser login/dashboard/logout/guard verified against real API
- Note: 6/6 phases complete, each independently validated by citadel:phase-validator plus orchestrator re-verification. No PR opened yet -- changes are in the working tree, ready for review/commit.
