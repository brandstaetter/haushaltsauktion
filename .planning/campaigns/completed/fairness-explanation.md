---
version: 1
id: "dfb684c3-99b4-47e3-8b88-b315b0ff2def"
status: completed
started: "2026-08-30T23:45:16Z"
completed_at: "2026-08-31T01:55:00Z"
direction: "Wire up §32's fairness-transparency UI (\"Warum wurde mir diese Aufgabe zugewiesen?\") — the backend endpoint and even the frontend query hook already exist and are already tested; nothing renders them anywhere"
phase_count: 3
current_phase: 2
branch: null
worktree_status: null
session_cap: 2
---

# Campaign: Fairness Explanation UI

Status: completed
Started: 2026-08-30T23:45:16Z
Completed: 2026-08-31T01:55:00Z
Direction: Build the CLAUDE.md §32 fairness-transparency screen — when a member is looking at a task they were randomly assigned, show them the same selection reasoning example §32 specifies: how many people were eligible, who was excluded and why, each remaining candidate's weight/probability, who was picked, and whether any fairness constraint had to be relaxed to make a selection possible at all.

Session cap: 2 (novice trust level). Small, single-feature, frontend-only scope — expected to finish in one session.

## Why this is small

Everything server-side already exists and is already tested, confirmed by reading the real code before writing this campaign, not assumed:
- `GET /api/assignments/:id/explain` (`apps/api/src/infra/http/routes/assignments.ts:137`) — its own comment names it as the §32 implementation.
- `explainAssignment()` (`apps/api/src/app/queries/reads.ts:296`) returns a fully-shaped `SelectionExplanationDto`: strategy, `eligibleCount`, `constraintsRelaxed`, and per-candidate `displayName`/`included`/`exclusionReason`/`weightTerms`/`weight`/`probability`/`selected`.
- `useAssignmentExplanation(assignmentId)` already exists in `apps/web/src/api/hooks.ts` — and is currently called by **zero** components. That's the entire gap.
- The reason-code vocabulary (`EligibilityReason`, `RelaxableConstraint` in `packages/shared/src/domain/reasons.ts`) is deliberately prose-free by design — its file header says German rendering belongs in the web app. None exists yet.

So this campaign is: one new UI component, its German string labels for the reason-code enums, wiring it into `TaskDetailPage` for random assignments, and tests. No backend changes, no schema changes, no new dependencies.

## Claimed Scope

- `apps/web/src/pages/TaskDetailPage/`
- `apps/web/src/components/` (new component)
- `apps/web/src/strings/de.ts`
- `apps/web/src/api/hooks.ts` (likely no change — hook already exists; touch only if its shape needs a tweak)

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 0 | complete | verify | Baseline — record current typecheck/test state | `npm run typecheck`, `npm run typecheck -w apps/web`, and `npm run test` output captured in Active Context |
| 1 | complete | build | Fairness explanation component + wiring | New component renders `SelectionExplanationDto` per §32's exact example shape (eligible count, per-candidate exclusion reason or weight/probability, relaxed-constraints note); wired into `TaskDetailPage` only for `activeAssignment.kind === 'RANDOM'`; all copy via `de.fairness.*`; tests cover a normal explanation, an excluded candidate, and a relaxed-constraints note |
| 2 | complete | verify | Final regression sweep + live verification | `npm run typecheck` + `npm run typecheck -w apps/web` both 0 new errors vs baseline; `npm run test` 0 new failures vs baseline; live-browser-verified against a real random assignment in the running dev stack |

## Phase End Conditions

| 0 | command_passes | npm run typecheck (record output) |
| 0 | command_passes | npm run typecheck -w apps/web (record output) |
| 0 | command_passes | npm run test (record pass/fail counts per workspace) |
| 1 | file_exists | new fairness-explanation component file |
| 1 | command_passes | npm run typecheck -w apps/web -- 0 new errors vs Phase 0 baseline |
| 1 | test_result | component test(s): renders eligible count + candidate list; excluded candidate shows its `exclusionReason` in German, not the raw enum value; relaxed-constraints note renders when `constraintsRelaxed` is non-empty and is absent when it's empty |
| 1 | manual | component is reachable only from a RANDOM-kind active assignment on TaskDetailPage, not shown for VOLUNTARY assignments |
| 2 | command_passes | npm run typecheck -- 0 new errors vs baseline |
| 2 | command_passes | npm run typecheck -w apps/web -- 0 new errors vs baseline |
| 2 | command_passes | npm run test -- 0 new failures vs baseline |
| 2 | visual_verify | live browser check against a real random assignment in the running dev stack (seed data or a triggered sweep), screen matches §32's worked example structure |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:0 | baseline | command_result | yes | typecheck x2 + test | pass | 3 | 0 errors both typecheck commands; 327 tests passing across 23 files (shared 128, api 144, web 55) |
| phase:1 | explanation-component | test_result | yes | new component test file | pass | 3 | AssignmentExplanation.test.tsx, 3 tests, all passing |
| phase:2 | final-regression | command_result | yes | typecheck x2 + test (repo root) | pass | 3 | 0 errors both typecheck commands; 330/330 tests passing across 24 files (shared 128, api 144, web 58) |
| phase:2 | live-verify | visual_verify | yes | live browser session against real random assignment | pass | 3 | Elke's real seeded random assignment ("Küche gründlich reinigen"): Sheet renders exact §32 worked-example format — "Für diese Aufgabe waren 3 Personen verfügbar.", strategy description, Arthur excluded with real reason text, Elke/Hannes/Luise weights (0,382 / 0,1 / 0,382), Elke marked "ausgewählt", closing line. Real production fairness-selection data, not a mock. |

## Feature Ledger

| Feature | Status | Phase | Notes |
|---------|--------|-------|-------|
| Fairness explanation component | complete | 1 | `apps/web/src/components/AssignmentExplanation/` — Sheet-triggered disclosure, wired into `TaskDetailPage.tsx` only for `activeAssignment.kind === 'RANDOM'`. `useAssignmentExplanation` (hooks.ts) properly typed to `SelectionExplanationDto` (was untyped `unknown` before — a one-line fix in scope). 3 new component tests, all passing. 330 tests total (up from 327), 0 typecheck errors. |

## Decision Log

- 2026-08-30: Scoped directly by Archon without a separate PRD/architecture pass — the prior turn (same session) already established the gap by reading the real endpoint, query function, shared types, and the unused hook; a formal PRD would just restate what's already verified above. Proportional to a small, single-feature, frontend-only task.
- 2026-08-30: No new component library or state pattern — reuses `useAssignmentExplanation` (hooks.ts, pre-existing), `useStrings()`, and follows `BuyoutDisclosure.tsx`'s established pattern (a disclosure section shown via `Sheet`, reason codes mapped through a `de.*.reasons[...]` lookup) since it's the closest existing precedent for "explain a server decision to the user."
- 2026-08-30: Found a second, more interesting unwired artifact while adding the `fairness` key to `de.ts`: a `fairness` string block already existed — a fully-written UX scaffold from the MVP campaign (title "Warum ich?", strategy descriptions, per-reason German text) that was never wired to any component. Its `reasons` sub-object used stale key names (`LAST_COMPLETED`, `COOLDOWN`, `INACTIVE`, `ABSENT`, `TASK_EXCLUDED`, `MAX_ASSIGNMENTS_REACHED`) that don't match the actual `EligibilityReason` enum shipped in `packages/shared/src/domain/reasons.ts` (`MEMBER_INACTIVE`, `MEMBER_ABSENT`, `EXCLUDED_FROM_TASK`, `NOT_IN_ALLOWLIST`, `CATEGORY_EXCLUDED`, `RANDOM_ASSIGNMENT_CAP_REACHED`, `IMMEDIATE_REASSIGNMENT_BLOCKED`) — presumably written before that enum was finalized, then abandoned. Adopted the existing block's title/tone/`strategies` sub-object (a nice touch this campaign's own draft hadn't planned — the strategy description now shows in the component) rather than discarding it, but corrected `reasons`' keys to match the real enum and added the handful of fields (`trigger`, `loading`, `excludedLabel`, `relaxedNote`) the actual component needs. One `fairness` key in the file now, not two.

## Review Queue

(none yet)

## Circuit Breakers

Status: armed, none tripped.

## Active Context

**Campaign complete.** All 3 phases done in one session, as estimated. Built `apps/web/src/components/AssignmentExplanation/`, wired into `TaskDetailPage.tsx` for RANDOM-kind assignments only, reconciled a stale MVP-era `de.fairness.*` string scaffold against the real `EligibilityReason` enum instead of leaving a duplicate, fixed `useAssignmentExplanation`'s missing type parameter. 330/330 tests passing (up from 327), 0 typecheck errors, live-verified against real production fairness-selection data matching CLAUDE.md §32's worked example exactly.

## Continuation State

- Not applicable — campaign is complete, no further sessions needed for this work.
