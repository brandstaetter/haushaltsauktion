---
version: 1
id: "ddfabe2c-5cf1-4926-8836-5033194b1157"
status: completed
started: "2026-09-04T04:09:34Z"
completed_at: "2026-09-04T09:45:00Z"
direction: "Let a TaskDefinition require more than one worker at once (AT_LEAST/AT_MOST/EXACTLY(n)), generalizing the existing single-slot lock/state-machine/ledger mechanisms to N slots without a parallel code path."
phase_count: 6
current_phase: 5
branch: null
worktree_status: null
---

# Campaign: Multi-Worker Tasks

Status: active
Started: 2026-09-04T04:09:34Z
Direction: Let a TaskDefinition require more than one worker at once (AT_LEAST/AT_MOST/EXACTLY(n)), generalizing the existing single-slot lock/state-machine/ledger mechanisms to N slots without a parallel code path.

PRD: .planning/prd-multi-worker-tasks.md
Architecture: .planning/architecture-multi-worker-tasks.md

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/prisma/migrations/
- packages/shared/src/domain/enums.ts, packages/shared/src/api/tasks.ts
- apps/api/src/domain/task/worker-slots.ts (new)
- apps/api/src/app/tx.ts, apps/api/src/app/assignment/, apps/api/src/app/tasks/, apps/api/src/app/buyout/executeBuyout.ts
- apps/api/src/app/queries/taskDto.ts, apps/api/src/app/queries/reads.ts, apps/api/src/app/config/validateConfig.ts
- apps/api/src/infra/http/routes/tasks.ts, apps/api/src/infra/http/routes/admin.ts
- apps/api/test/domain/, apps/api/test/integration/
- apps/web/src/components/TaskMaintenanceCard/, apps/web/src/components/TaskCard/, apps/web/src/pages/TaskDetailPage/

## Phases
| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 0 | complete | research | Baseline — record current typecheck/test/lint state | Decision Log has baseline pass/fail counts for typecheck, full test suite, lint |
| 1 | complete | build | Schema migration + pure worker-slots domain module | Migration applies cleanly with correct backfill; worker-slots.ts has full branch coverage; typecheck/lint/tests unaffected outside this phase's files |
| 2 | complete | build | Slot-aware use cases (volunteer/buyout/complete/sweep/candidates) | New multi-slot concurrency + lifecycle integration tests pass; full pre-existing suite passes unmodified (EXACTLY(1) parity) |
| 3 | complete | build | API surface — task-definition CRUD + DTOs expose slot list | Admin task create/update validates workerCountMode/workerCount; task DTOs list every active slot |
| 4 | complete | build | Frontend — admin form + TaskCard + TaskDetailPage | Admin can set worker-count mode/count; multi-slot tasks render correctly; web typecheck/tests pass |
| 5 | complete | verify | Full regression + manual multi-worker lifecycle smoke test | npm run test / typecheck / lint all pass, 0 failures; manual AT_LEAST(2) end-to-end trace matches expectations |

## Phase End Conditions
| 0 | command_passes | npm run typecheck (record exit code + error count) |
| 0 | command_passes | npm run test (record pass/fail counts) |
| 0 | command_passes | npm run lint (record exit code + error count) |
| 1 | file_exists | apps/api/prisma/migrations/*_multi_worker_tasks/migration.sql |
| 1 | file_exists | apps/api/src/domain/task/worker-slots.ts |
| 1 | file_exists | apps/api/test/domain/worker-slots.test.ts |
| 1 | command_passes | npm run test -w apps/api -- worker-slots (exit 0) |
| 1 | command_passes | npm run typecheck (exit 0, 0 new errors vs Phase 0 baseline) |
| 2 | file_exists | apps/api/test/integration/multi-worker-concurrency.test.ts |
| 2 | file_exists | apps/api/test/integration/multi-worker-lifecycle.test.ts |
| 2 | command_passes | npm run test -w apps/api (exit 0, includes full pre-existing suite unmodified) |
| 2 | command_passes | npm run typecheck (exit 0, 0 new errors) |
| 3 | command_passes | npm run test -w apps/api (exit 0) |
| 3 | command_passes | npm run typecheck (exit 0, 0 new errors) |
| 4 | command_passes | npm run typecheck -w apps/web (exit 0, 0 new errors) |
| 4 | command_passes | npm run test -w apps/web (exit 0, 0 new failures) |
| 5 | command_passes | npm run test (exit 0, all workspaces, 0 failures) |
| 5 | command_passes | npm run typecheck (exit 0) |
| 5 | command_passes | npm run lint (exit 0) |
| 5 | manual | User (or a phase-validator trace) confirms an AT_LEAST(2) task: two volunteers, one buyout, sweep refill, both complete — ledger + history trace matches expectations |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:0 | baseline-typecheck | command_result | yes | npm run typecheck | satisfied | 2 | none — 0 errors |
| phase:0 | baseline-tests | test_result | yes | npm run test | satisfied | 2 | none — 575/575 passed |
| phase:1 | migration-apply | command_result | yes | prisma migrate against schema copy | satisfied | 2 | none — applied cleanly, backfill verified via psql |
| phase:1 | worker-slots-coverage | test_result | yes | npm run test -w apps/api -- worker-slots | satisfied | 2 | none — 18/18 passed |
| phase:2 | multi-worker-race | test_result | yes | npm run test -w apps/api -- multi-worker-concurrency | satisfied | 2 | none — 2/2 passed (real-lock proof) |
| phase:2 | regression-suite | test_result | yes | npm run test -w apps/api | satisfied | 2 | none — 333/333 passed, 0 failures |
| phase:4 | web-regression | test_result | yes | npm run test -w apps/web | satisfied | 2 | none — 128/128 passed |
| phase:5 | full-regression | test_result | yes | npm run test (all workspaces) | satisfied | 2 | none — 614/614 passed (144 shared + 342 api + 128 web) |

## Feature Ledger
| Feature | Status | Phase | Notes |
|---------|--------|-------|-------|
| Baseline recorded | complete | 0 | typecheck 0 errors, lint 0 errors, tests 575/575 passed (shared 144, api 309, web 122) across 57 test files |
| Migration + worker-slots.ts domain module | complete | 1 | additive migration `20260904050000_multi_worker_tasks` applied cleanly, backfill verified; worker-slots.ts (minRequired/maxAllowed/slotOutcome), 18 new tests; full suite 593/593 passing (575 baseline + 18 new); state-machine.ts zero-diff confirmed; activeForInstanceId kept alongside new activeSlotKey (6 app-layer readers still on old field — migrating them is Phase 2 scope) |
| Slot-aware use cases (volunteer/buyout/complete/sweep/candidates) | complete | 2 | volunteerForTask/executeBuyout/completeTask/runAssignmentSweep/candidates.ts rewritten for per-slot semantics; new `lockActiveAssignmentsOfInstance` (plural) in tx.ts; 2 new integration tests (multi-worker-concurrency 2 tests real-lock proof, multi-worker-lifecycle 4 tests); full api suite 333/333, repo-wide 599/599 (144 shared + 333 api + 122 web); typecheck 0 errors; state-machine.ts zero-diff confirmed |
| API surface — task-definition CRUD + DTOs expose slot list | complete | 3 | `admin.ts`'s `DefinitionBody` validates `workerCountMode`/`workerCount` (mode-independent `.min(1).max(20)`, default `EXACTLY(1)`) on both create/update; `taskDto.ts` DTO builders now compute every `ACTIVE` slot (ordered by `slotIndex`) instead of `assignments[0]` — additive shape: singular `activeAssignment`/`assignment`/`assignee` kept as lowest-slotIndex for backward compat, new plural `activeAssignments`/`assignees` arrays added alongside; `AvailableTaskDto` gained `workerCountMode`/`workerCount`/`activeSlotCount`. Found and fixed 3 real bugs while wiring this: (1) `routes/tasks.ts` `/volunteer` returned an arbitrary slot as "your assignment" instead of the caller's own; (2) `reads.ts`'s `loadDashboard` used `take:1` on terminal-status/reward queries, silently dropping data for multi-slot instances; (3) neither `runAssignmentSweep.ts`'s T1 auto-materialization nor `admin.ts`'s manual `/materialize` copied `workerCountMode`/`workerCount` onto the new `TaskInstance`, so every materialized instance silently reverted to `EXACTLY(1)` regardless of configuration — this was the most significant find, since it meant the feature was inert on the two real instance-creation paths despite Phases 1-2 passing all their tests (which only ever created instances directly via `db.taskInstance.create`, bypassing both paths). `validateConfig.ts` correctly left untouched (household-level config only, unrelated). `state-machine.ts` and `validateConfig.ts` confirmed zero-diff. Re-verified independently by Archon (not just sub-agent self-report): typecheck 0 errors, `npm run test -w apps/api` 333/333, lint 0 errors. Phase-validator verdict: pass, 0 conditions failed. |
| Full regression + end-to-end lifecycle trace | complete | 5 | Converted the architecture doc's "manual smoke test" end condition into a permanent regression test (`multi-worker-full-lifecycle.test.ts`) driving the full AT_LEAST(2) narrative through real HTTP routes against live Postgres — two volunteers, one release (not buyout — a VOLUNTARY slot is released per §3B, only RANDOM is bought out), sweep fills the gap, both complete — asserting the full 10-event history trace and point ledger. A live browser check (docker compose + `npm run dev`, logged in as a seeded member) of the admin form, TaskCard badge, and TaskDetailPage surfaced a THIRD real bug this campaign: `releaseOrRevokeAssignment` (`reopen.ts`) only accepted `instance.status === 'ASSIGNED'`, so a lone early volunteer on a still-recruiting `AT_LEAST`/`AT_MOST(n>1)` instance (status `AVAILABLE`, below `minRequired`) could never release their own free slot — reproduced live, fixed by widening the guard and branching the reopen logic three ways (still-staffed / ASSIGNED→AVAILABLE / AVAILABLE→AVAILABLE), with a new regression test in `multi-worker-lifecycle.test.ts`. Final independently-verified state: typecheck 0 errors, `npm run test` (all workspaces) 614/614 (144 shared + 342 api + 128 web), lint 0 errors, `state-machine.ts` zero-diff. Phase-validator verdict: pass, 0 conditions failed — the campaign's last phase. |
| Frontend — admin form + TaskCard + TaskDetailPage | complete | 4 | Admin form (`TaskDefinitionsSection.tsx`) gained mode/count inputs, default `EXACTLY(1)`; `TaskCard`/`TaskMaintenanceCard` show "N/M besetzt" only when `workerCount > 1`; `TaskDetailPage` fully rewritten around `activeAssignments` (plural) — lists every co-assignee, targets viewer's own slot via `.find(memberId)`. `apps/web/src/api/types.ts` and `TaskDefinitionsSection.tsx` added to scope beyond the architecture doc's file list (logged, not scope creep — end conditions unreachable otherwise). Two real backend bugs surfaced and fixed same-session, both validator-confirmed: (1) three admin routes (`revoke-assignment`/`complete`/`reject-completion`) picked "the" assignment via unordered `findFirst`, ambiguous once >1 slot exists — fixed with optional `assignmentId` + new `AMBIGUOUS_ASSIGNMENT` (409) error, `EXACTLY(1)`-parity preserved; (2) `reopen.ts`'s `releaseOrRevokeAssignment` unconditionally flipped the *whole instance* to `AVAILABLE` on any single slot's release/revoke — a direct violation of the campaign's own staffing invariant — fixed to mirror `executeBuyout.ts`'s `staysStaffed` gating exactly. Also closed the open Review Queue item (registered `lockActiveAssignmentsOfInstance` in the eslint lock-order rule). Final state independently re-verified by Archon: typecheck 0 errors, `npm run test` (all workspaces) 612/612 (144 shared + 340 api + 128 web), lint 0 errors, `state-machine.ts`/`executeBuyout.ts` zero-diff. Phase-validator verdict: pass, 0 conditions failed. |

## Decision Log
- 2026-09-04: Campaign created from .planning/architecture-multi-worker-tasks.md, itself built on .planning/prd-multi-worker-tasks.md.
  Reason: user approved the PRD (AskUserQuestion: 3 explicit modes, full-value-per-volunteer reward, unanimous completion gate, per-slot buyout) and asked for /architect then /archon in sequence within this session.
- 2026-09-04: Two of the PRD's Open Questions were resolved concretely in the architecture doc rather than left for a mid-build question: AT_MOST(n) implies a floor of 1 (same staffing guarantee as today's single-worker sweep), AT_LEAST(n) has no ceiling (unbounded recruiting is what distinguishes it from EXACTLY). Flagged for user visibility, not re-litigated during phases 1-2 unless a build agent finds the interpretation unworkable.
- 2026-09-04: state-machine.ts is a hard no-touch file for this campaign — zero-diff is the primary regression-risk reducer (91-pair exhaustive transition test). All slot-threshold logic lives in the new domain/task/worker-slots.ts instead.
- 2026-09-04: Phase 0 baseline recorded. `npm run typecheck`: 0 errors (root, apps/web, e2e all clean). `npm run lint`: 0 errors. `npm run test` (all workspaces): 575/575 tests passed across 57 test files — shared 144/144 (4 files), api 309/309 (31 files), web 122/122 (22 files). This is the zero-regression baseline every later phase's command_passes conditions compare against.
- 2026-09-04: Phase 1 complete, validator pass. `activeForInstanceId` kept alongside the new `activeSlotKey` — still read/written in 6 app-layer files (completeTask.ts, rejectCompletion.ts, assignment/reopen.ts, assignment/runAssignmentSweep.ts, tasks/volunteerForTask.ts, buyout/executeBuyout.ts). Migrating those readers to `activeSlotKey` and dropping `activeForInstanceId` is explicitly Phase 2 work, not deferred scope creep — flagging here so Phase 2 doesn't skip it.
- 2026-09-04: Checkpoint skipped for Phase 1 (`checkpoint-phase-1: none`) — pre-existing uncommitted state (modified package.json, several untracked .planning/ files including this campaign file and daemon.json) made a full `git stash --include-untracked` unsafe: it would have stashed the campaign file being actively written mid-phase and the daemon's own state file. Rollback for this phase, if ever needed, is by path: the phase touched exactly 5 files (schema.prisma, enums.ts, migrations/20260904050000_multi_worker_tasks/, worker-slots.ts, worker-slots.test.ts), all new or additively-diffed, confirmed via `git status --short`.
- 2026-09-04: Phase 2 complete, validator pass (with warnings, no blocking findings). Two schema-level blockers not caught in Phase 1 review surfaced only via live `23514`/`23505` errors while writing the concurrency test: a CHECK constraint `ta_active_sentinel_set_iff_active` required `activeForInstanceId` non-null on every ACTIVE row, and a separate partial unique index `ta_one_active_assignment_per_instance` forbade a second concurrently-ACTIVE row per instance regardless of slot — both pre-dated this campaign and were invisible from schema review alone. Fixed with a second migration, `20260904060000_multi_worker_tasks_slot_sentinel` (relaxes the CHECK, drops the redundant partial index in favor of Phase 1's `activeSlotKey` unique index). App code now sets `activeForInstanceId = instanceId` only for `slotIndex===0`, else `null`.
- 2026-09-04: Phase 2 touched two files outside its named list (`reopen.ts`, `rejectCompletion.ts` — both within Claimed Scope directories, not scope creep) as regression fixes discovered mid-phase: `reopen.ts` now nulls `activeSlotKey` on close (an unpatched EXACTLY(1) regression risk — a released slot's stale key would collide with the next volunteer for that slot); `rejectCompletion.ts`'s `REASSIGN_TO_MEMBER` redo now carries the original assignment's `slotIndex` instead of hardcoding 0 (byte-identical for EXACTLY(1), prevents a multi-slot collision).
- 2026-09-04: Validator flagged a deferred gap, logged to Review Queue: the new `lockActiveAssignmentsOfInstance` (plural) helper in tx.ts is not yet registered in `eslint-rules/index.js`'s `LOCK_LEVELS` map, so the static lock-order check doesn't cover it. Not a blocker (typecheck/tests are the phase's actual gates), but must be closed before the campaign's final verify phase.
- 2026-09-04: Phase 3 complete, validator pass (0 conditions failed). Additive DTO shape (see Feature Ledger) rather than renaming — deliberate, since `apps/web` still reads the singular `activeAssignment`/`assignment`/`assignee` fields and touching it was explicitly out of scope for this phase (Phase 4). The sub-agent's most valuable find was outside its literal file list but inside its Claimed Scope directories: T1 auto-materialization (`runAssignmentSweep.ts`) and manual materialization (`admin.ts`'s `/materialize`) never copied `workerCountMode`/`workerCount` from the definition onto the new instance, so both real instance-creation paths silently produced `EXACTLY(1)` regardless of configuration — undetected by Phases 1-2 because their tests created instances directly via `db.taskInstance.create`. Fixed additively in both places. Archon independently re-ran typecheck/test/lint after the sub-agent finished (did not just trust the HANDOFF numbers) and spot-checked every diff before accepting.
- 2026-09-04: Direction check: aligned — 3 phases in (build phases 1-3 all shipped exactly the API/domain surface the architecture doc specified for them), no drift.
- 2026-09-04: Phase 4 (frontend) built and independently re-verified by Archon: admin form mode/count inputs, "N/M besetzt" on TaskCard/TaskMaintenanceCard, TaskDetailPage rewritten around `activeAssignments` (plural). Re-ran `npm run typecheck` (0 errors, all workspaces), `npm run test -w apps/web` (128/128, up from 122 baseline), `npm run lint` (0 errors) myself rather than trusting the sub-agent's reported numbers. Architecture doc's Phase 4 file list undercounted by two real files (`apps/web/src/api/types.ts`, `apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx` — the actual admin create/edit form; the doc only named the read-only `TaskMaintenanceCard`) — included them since the end conditions were unreachable otherwise, logged rather than treated as scope creep.
- 2026-09-04: Phase 4's sub-agent surfaced a real backend correctness gap while building the admin unassign UI (not a frontend issue): three admin routes in `admin.ts` (`revoke-assignment`, `complete`, `reject-completion`) each pick "the" assignment on an instance via an unordered `findFirst`, ambiguous once an instance can carry more than one `ACTIVE`/`COMPLETED` assignment. Only `revoke-assignment` is reachable from the UI today; the sub-agent shipped a disclosed-gap warning banner as an honest stopgap rather than faking a fix — correct call, but not an acceptable permanent answer for a Definition-of-Done item ("Race Conditions abgesichert", correctness-of-business-logic priority #1). Dispatched a follow-up fix (same session): all three routes now accept optional `assignmentId`, disambiguate via a new `AMBIGUOUS_ASSIGNMENT` (409) error when omitted and >1 candidate exists, byte-identical behavior when ≤1 candidate exists (EXACTLY(1) parity). Frontend's `TaskDetailPage` now sends the specific row's `assignmentId`; the warning banner and its string key were removed. New test file `apps/api/test/integration/admin-assignment-disambiguation.test.ts` (5 tests). Sub-agent reported `npm run test` (all workspaces) 610/610, typecheck 0 errors, lint 0 errors — not yet independently re-verified by Archon (deferred to a single consolidated pass after the next fix below lands, since both touch overlapping files).
- 2026-09-04: The disambiguation fix's own testing surfaced a second, more serious gap: `apps/api/src/app/assignment/reopen.ts`'s `releaseOrRevokeAssignment` (shared by member self-release and admin revoke) unconditionally flips the **entire instance** to `AVAILABLE` on any single slot's release/revoke, with no `activeSlotCount`-vs-`minRequired` staffing check — unlike `executeBuyout.ts`, which already does this correctly (Phase 2). For a `workerCount > 1` task, releasing/revoking one of several active slots incorrectly reopens the whole instance while a co-assignee's `ACTIVE` assignment is left pointing at an instance now claiming to be `AVAILABLE` — a direct violation of the campaign's own stated invariant ("leaves co-assignees' active assignments and the instance's ASSIGNED status untouched when activeSlotCount - 1 >= minRequired"). This is exactly what Review Queue item (closed below) had flagged as worth a second look, but the actual failure mode is worse than "cache staleness" — it's a wrong state transition. Not deferred to Phase 5: dispatched a same-session fix mirroring `executeBuyout.ts`'s `staysStaffed` branch pattern exactly, plus registering `lockActiveAssignmentsOfInstance` in the eslint lock-order rule (closing the other open Review Queue item in the same pass).

- 2026-09-04: Phase 5 (final phase) complete, validator pass (0 conditions failed). Converted the "manual smoke test" end condition into a permanent regression test rather than a one-off click-through — `multi-worker-full-lifecycle.test.ts` drives the full AT_LEAST(2) narrative through real HTTP routes, asserting the complete history trace and ledger. Its docstring documents two deliberate, domain-justified deviations from the campaign brief's literal wording (first volunteer doesn't reach `ASSIGNED` under `AT_LEAST(2)`; a `VOLUNTARY` slot is released, not bought out) rather than silently rewriting the brief's intent. The live browser check (not skipped, despite being optional) found a THIRD real bug: `releaseOrRevokeAssignment` rejected release attempts on an instance still `AVAILABLE`-and-recruiting, trapping an early lone volunteer on a multi-slot task. Fixed with a three-way branch (still-staffed / ASSIGNED→AVAILABLE / AVAILABLE→AVAILABLE) mirroring the existing `staysStaffed` pattern; `EXACTLY(1)`/`AT_MOST(1)` provably cannot reach the new branch. Final state: typecheck 0 errors, `npm run test` 614/614, lint 0 errors, `state-machine.ts` zero-diff — all independently re-verified by Archon, not taken from any sub-agent's self-report. **Campaign complete.** Three real, previously-undetected correctness bugs were found and fixed across Phases 3-5 (materialization dropping worker-count config, admin-route assignment ambiguity, and two variants of the whole-instance-reopen gap) — none would have been caught by typecheck or by testing each mechanic in isolation; all three surfaced only when a phase (or, twice, its own live verification) exercised realistic multi-step or live-UI scenarios. This is the strongest evidence for why every phase in this campaign was independently re-verified rather than accepted on a sub-agent's HANDOFF alone.

## Review Queue
- [x] Architecture: Confirm the AT_MOST-floor-of-1 / AT_LEAST-unbounded interpretation (Decision Log 2026-09-04) matches what the household actually wants — left open for the user, not something Archon can decide alone; the implementation is consistent and documented (`worker-slots.ts`), and no phase's testing surfaced a case where the interpretation itself (as opposed to code that failed to honor it) caused incorrect behavior. Flagging in the campaign HANDOFF rather than blocking completion on it.
- [x] Register `lockActiveAssignmentsOfInstance` (plural, tx.ts, added Phase 2) in `eslint-rules/index.js`'s `LOCK_LEVELS` map so the static lock-order check covers it — closed, Archon-verified (`eslint-rules/index.js` line 21, level 2).
- [x] Phase 2 validator suggested a code-level confirmation that `activeSlotCount` staleness through `reopen.ts`/`rejectCompletion.ts` can't drift under concurrent load — turned out to be a real bug, not just staleness (see Decision Log 2026-09-04, `releaseOrRevokeAssignment` whole-instance-reopen). Fixed and Archon-verified same session; `rejectCompletion.ts` itself was already confirmed correct in Phase 2 (carries `slotIndex` through redo), only `reopen.ts` had the gap.

## Circuit Breakers
- 3+ consecutive sub-agent failures on the same phase
- Typecheck introduces 5+ new errors in a single phase
- Any change to apps/api/src/domain/task/state-machine.ts (out of scope by design — see Decision Log)
- A build phase touches a file outside Claimed Scope without a logged reason
- Regression in the existing single-worker (EXACTLY(1)) test suite that isn't fixed within the same phase

## Active Context
Phase 4 complete and validator-passed (0 conditions failed, both corrective fixes included). Frontend now fully consumes the slot-aware API surface: admin form sets worker-count mode/count, TaskCard/TaskMaintenanceCard show occupancy, TaskDetailPage lists every co-assignee and targets the viewer's own slot correctly. Along the way, two real backend correctness bugs were found and fixed in the same session (not deferred to Phase 5): admin-route assignment-targeting ambiguity (`revoke-assignment`/`complete`/`reject-completion`) and a whole-instance-reopen regression in `reopen.ts` that violated the campaign's own staffing invariant. Both Review Queue items closed. All 6 build/verify phases so far (0-4) have been independently re-verified by Archon after every sub-agent run — never taking a HANDOFF's reported numbers on faith. Direction check: aligned. Ready to start Phase 5 (Full regression + manual multi-worker lifecycle smoke test) — the last phase, verification-only, no new files.

## Continuation State
Phase: 5 (final — campaign complete)
Sub-step: complete
Files modified this session (Phase 5): apps/api/test/integration/multi-worker-full-lifecycle.test.ts (new), apps/api/test/integration/multi-worker-lifecycle.test.ts (new regression test appended), apps/api/src/app/assignment/reopen.ts (third bug fix — AVAILABLE-status release), .planning/campaigns/multi-worker-tasks.md
Blocking: none — nothing left to continue. See HANDOFF below for what remains for a human (Review Queue item on AT_MOST/AT_LEAST interpretation) and suggested next steps.

<!-- session-end: 2026-09-04T04:49:41.747Z -->

<!-- session-end: 2026-09-04T04:49:58.041Z -->

<!-- session-end: 2026-09-04T05:36:21.606Z -->

<!-- session-end: 2026-09-04T05:37:28.278Z -->

<!-- session-end: 2026-09-04T05:38:35.107Z -->

<!-- session-end: 2026-09-04T05:39:41.817Z -->

<!-- session-end: 2026-09-04T05:40:48.425Z -->

<!-- session-end: 2026-09-04T05:41:55.078Z -->

<!-- session-end: 2026-09-04T05:43:01.742Z -->

<!-- session-end: 2026-09-04T05:44:08.432Z -->

<!-- session-end: 2026-09-04T05:45:15.145Z -->

<!-- session-end: 2026-09-04T05:46:21.848Z -->

<!-- session-end: 2026-09-04T05:47:28.483Z -->

<!-- session-end: 2026-09-04T05:48:35.059Z -->

<!-- session-end: 2026-09-04T05:49:41.862Z -->

<!-- session-end: 2026-09-04T05:50:48.524Z -->

<!-- session-end: 2026-09-04T05:51:55.250Z -->

<!-- session-end: 2026-09-04T05:53:01.936Z -->

<!-- session-end: 2026-09-04T05:54:08.617Z -->

<!-- session-end: 2026-09-04T05:55:15.440Z -->

<!-- session-end: 2026-09-04T05:56:22.125Z -->

<!-- session-end: 2026-09-04T05:57:28.809Z -->

<!-- session-end: 2026-09-04T06:00:18.961Z -->
