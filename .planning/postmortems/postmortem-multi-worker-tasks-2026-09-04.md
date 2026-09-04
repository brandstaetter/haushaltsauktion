# Postmortem: Multi-Worker Tasks

> Date: 2026-09-04
> Campaign: `.planning/campaigns/completed/multi-worker-tasks.md`
> Duration: ~5.5 hours wall-clock (2026-09-04T04:09:34Z → ~09:45Z), across a usage-limit pause and resume
> Outcome: completed

## Summary
Generalized `TaskDefinition`/`TaskInstance` to support `AT_LEAST`/`AT_MOST`/`EXACTLY(n)` concurrent workers per task, across schema, domain logic, API, and frontend, in 6 sequential phases. All phases completed and were independently re-verified; `EXACTLY(1)` (today's default) was preserved byte-identical throughout. Three real, previously-undetected correctness bugs were found and fixed during the campaign — none catchable by typecheck or unit-level tests in isolation.

## What Broke

### 1. Task materialization silently dropped worker-count configuration
- **What happened:** Phase 2 made `volunteerForTask`/`executeBuyout`/`completeTask`/`runAssignmentSweep`/`candidates.ts` fully slot-aware, but neither of the two real instance-creation paths — `runAssignmentSweep.ts`'s T1 auto-materialization, nor `admin.ts`'s manual `/materialize` endpoint — copied `workerCountMode`/`workerCount` from the `TaskDefinition` onto the new `TaskInstance`. Every instance created through a real path silently reverted to the schema default `EXACTLY(1)`, regardless of configuration.
- **Caught by:** A Phase 3 build sub-agent, while wiring the admin CRUD surface, not by any test.
- **Cost:** None in rework — found and fixed within the same phase, before the phase was marked complete. But it means the feature was completely inert for two full phases (1-2) without anyone noticing, because Phase 1-2's own tests only ever created instances directly via `db.taskInstance.create`, bypassing both real paths.
- **Fix:** Additive `select`/`data` fields in both materialization call sites.
- **Infrastructure created:** None — no new test category was added specifically to prevent "creation path forgets to copy a new field" as a class; this is a recommendation below.

### 2. Admin routes picked an arbitrary assignment via unordered `findFirst`
- **What happened:** Three admin routes (`revoke-assignment`, `complete`, `reject-completion` in `admin.ts`) each fetched "the" `ACTIVE`/`COMPLETED` assignment on an instance with an unordered `findFirst` — correct when at most one exists, silently ambiguous once a multi-slot instance can carry more than one.
- **Caught by:** A Phase 4 frontend build sub-agent, while wiring the admin unassign UI, not by any test (this pattern pre-dated the campaign and had never been exercised with >1 candidate before).
- **Cost:** The sub-agent shipped an honest stopgap (a disclosed-gap warning banner) rather than faking a fix, then a dedicated follow-up sub-agent run was needed to fix it properly — one extra delegation cycle.
- **Fix:** All three routes now accept an optional `assignmentId`; a new `AMBIGUOUS_ASSIGNMENT` (409) error fires when it's omitted and more than one candidate exists. `EXACTLY(1)` behavior is byte-identical (0 or 1 candidates never hits the new branch).
- **Infrastructure created:** New error code `AMBIGUOUS_ASSIGNMENT` (`packages/shared/src/api/errors.ts`, `error-mapper.ts`); new test file `admin-assignment-disambiguation.test.ts` (5 tests).

### 3. Releasing/revoking one slot incorrectly reopened the *whole* instance (two variants)
- **What happened:** `reopen.ts`'s `releaseOrRevokeAssignment` (shared by member self-release and admin revoke) unconditionally flipped the entire `TaskInstance` to `AVAILABLE` on any single slot closing, with no `activeSlotCount`-vs-`minRequired` staffing check — unlike `executeBuyout.ts`, which already did this correctly since Phase 2. This directly violated the campaign's own stated invariant. A second, narrower variant of the same root cause surfaced later: the function's top-level guard only accepted `instance.status === 'ASSIGNED'`, so a lone early volunteer on a still-recruiting `AT_LEAST`/`AT_MOST(n>1)` instance (status still `AVAILABLE`, below `minRequired`) could never release their own free slot at all.
- **Caught by:** The first variant was caught by a Phase 4 sub-agent's own integration testing while building the admin-disambiguation fix above (it wrote a test that happened to stage a co-assignee first). The second variant was caught only by an actual live browser click-through during Phase 5 — no automated test staged that exact sequence (early lone volunteer, still recruiting, tries to back out) until one was added afterward specifically to cover it.
- **Cost:** Two extra dedicated fix-and-verify cycles (one per variant), each independently re-verified before the campaign could close.
- **Fix:** `reopen.ts` now mirrors `executeBuyout.ts`'s `staysStaffed` gating exactly, branching three ways (still-staffed / `ASSIGNED`→`AVAILABLE` / `AVAILABLE`→`AVAILABLE`).
- **Infrastructure created:** Two new regression tests (`multi-worker-lifecycle.test.ts`); `lockActiveAssignmentsOfInstance` registered in the eslint lock-order rule (`LOCK_LEVELS`), closing a Phase 2 Review Queue item that had flagged this exact area as "worth a second look" without anyone recognizing it as a live bug at the time.

## What Safety Systems Caught
| System | What It Caught | Times | Impact Prevented |
|--------|---------------|-------|-------------------|
| `external-action-gate` hook | Sub-agent shell commands reading/grepping `.env` files (secrets) | 4 | Credential exposure into a sub-agent's transcript/output during Phase 1 setup and the Phase 5 live-check's local dev-server bring-up |
| Phase-validator (independent re-verification) | Would have accepted at least one HANDOFF's self-reported numbers without a second read of the actual diff | Every phase (0 fresh delegations were accepted without independent Archon verification) | Nothing is confirmed to have slipped through, but this is exactly the discipline that caught bug #3's first variant before it reached the "phase complete" state |
| `state-machine.ts` hard no-touch circuit breaker | Never triggered — zero-diff maintained throughout | 0 trips | Confirms the campaign's core regression-safety strategy (isolate the highest-risk file, verify zero-diff every phase) held for all 6 phases |
| Typecheck/lint/full-suite gates | Never found a regression themselves — all 3 bugs above were behavioral, not type or lint errors | 0 catches (of these 3 bugs) | This is itself a finding: automated static checks provided no signal for any of the three real bugs found this campaign — see Patterns below |

## Scope Analysis
- **Planned:** 6 phases — baseline, schema+domain module, slot-aware use-cases, API surface, frontend, full regression+smoke test — exactly as decomposed by `/architect` before the campaign began.
- **Built:** All 6 phases, matching the plan. Two files were added to Phase 4's scope beyond the architecture doc's literal file list (`apps/web/src/api/types.ts`, `apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx`) because the doc had named only the read-only `TaskMaintenanceCard` and missed where the actual admin create/edit form lives — logged as a documentation gap in the architecture doc, not scope creep in the campaign's execution.
- **Drift:** None in direction. The three bug-fix detours were all corrective work within already-Claimed Scope files, not new features — each was logged in the Decision Log with an explicit "why this isn't scope creep" justification before being dispatched.

## Patterns

- **Every one of the three real bugs was invisible to typecheck, lint, and isolated unit/mechanic tests.** All three were found by (a) a build sub-agent actually wiring two pieces together end-to-end (bug #1, #2, first variant of #3), or (b) live, real-UI interaction (second variant of #3). The campaign's own Phase 5 decision to convert a "manual smoke test" end condition into a full end-to-end HTTP-driven regression test — and to actually perform the optional live browser check rather than skip it — is what surfaced the last bug. A campaign that treated "manual" end conditions as safely skippable, or that only ran isolated-mechanic tests, would have shipped this feature with all three bugs live.
- **Delegation telemetry logging was inconsistent.** `agent-runs.jsonl` shows `campaign-start` and Phase 1-2 `agent-start`/`agent-complete` events logged via the script, but no corresponding entries for the Phase 3, 4, or 5 sub-agent delegations, the two corrective-fix delegations, or the four phase-validator spawns performed later in this same session — Archon called the `Agent` tool directly for all of those without the paired `telemetry-log.cjs --event agent-start/agent-complete` calls the protocol specifies. A `campaign-complete` event even appears at 07:43:41Z, mid-Phase-3, well before the campaign actually finished — likely a stale artifact from an earlier session attempt, but it means anyone reading raw telemetry for this campaign would see a misleadingly short, prematurely-"complete" activity trail.
- **Phase-validator sub-agents twice hit their turn limit** (Phase 3's and Phase 5's validation passes) and needed an explicit `SendMessage` to resume and produce a final verdict. Neither run lost work — both resumed cleanly and returned correct verdicts — but it added a round-trip to two of the five validation passes performed this campaign.

## Recommendations
1. Add a repo-level convention (or a Citadel anti-pattern check) for "a new denormalized field on an entity must be copied at every creation path" — bug #1's root cause (a field added in one phase, a second creation path added/touched in an earlier phase never learns about it) is a generic risk, not specific to this campaign, and would recur for any future denormalized-field addition.
2. When `/architect` names specific files for a phase, treat the list as a floor, not a ceiling, and have the architecture doc reviewed once against the actual admin/CRUD entry points before a build phase starts — Phase 4's file-list gap (missing the real edit form) cost a logged detour that a one-time cross-check could have caught earlier.
3. Actually invoke `telemetry-log.cjs --event agent-start`/`agent-complete` around every `Agent` tool delegation and validator spawn, not only the first two phases — the gap this campaign left makes its own telemetry an unreliable record of how much verification work actually happened.
4. For any future campaign with a "manual smoke test" end condition, prefer converting it into a permanent end-to-end regression test (as Phase 5 did here) over a one-off click-through — and treat the "optional" live-UI check as effectively mandatory for any campaign that touches both backend state transitions and their frontend consumers, since it was the only thing that caught bug #3's second variant.

## Numbers
| Metric | Value |
|--------|-------|
| Phases planned | 6 |
| Phases completed | 6 |
| Commits | 0 (all work remains uncommitted in the working tree as of campaign completion) |
| Files changed | 52 (30 modified, 22 new — per `git status --short`) |
| Circuit breaker trips | 0 |
| Quality gate blocks (external-action-gate, secrets) | 4 |
| Real bugs found and fixed mid-campaign | 3 |
| Corrective fix delegations (beyond the 5 planned build/verify phases) | 3 |
| Phase-validator runs | 5 (one per phase completed; 2 needed a resume after hitting their turn limit) |
| Final test count | 614 (144 shared + 342 api + 128 web), 0 failures |
| Final typecheck/lint errors | 0 / 0 |
