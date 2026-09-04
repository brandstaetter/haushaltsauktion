---
topic: generalization-patterns
last-compiled: 2026-09-04
sources: 1
---

# Generalization Patterns

## Mirror an existing correct implementation exactly when generalizing a parallel code path
**Mechanism:** When fixing a function's missing staffing-aware reopen logic, the fix copied a sibling function's already-correct gating pattern verbatim (same lock helper, same threshold computation, same branch structure) rather than inventing a new approach. This kept the degenerate single-cardinality case provably safe (it can never reach the new branch) and made the fix trivially reviewable by diffing against a known-correct reference.
**Evidence:** multi-worker-tasks campaign, `reopen.ts` fix (2026-09-04) — both bugs in `releaseOrRevokeAssignment` were fixed by direct comparison against `executeBuyout.ts`'s already-correct Phase 2 implementation
**Confidence:** high
**Last confirmed:** 2026-09-04
**Applies to:** Generalizing a single-cardinality code path to N-cardinality when a sibling function already handles the N-cardinality case correctly

## Decision: isolate the highest-regression-risk file as hard no-touch, verify zero-diff every phase
**Mechanism:** Isolating the highest-regression-risk file (an exhaustively-tested core state machine) and proving zero-diff every phase was chosen as the primary regression-safety strategy for a campaign, over trying to extend that file itself for the new semantics.
**Evidence:** multi-worker-tasks campaign (2026-09-04) — `state-machine.ts` marked no-touch for the whole campaign; zero-diff maintained and independently re-verified across all 6 phases, no regression ever traced to this file
**Confidence:** high
**Last confirmed:** 2026-09-04
**Applies to:** Campaigns generalizing existing business logic where one file represents disproportionate regression risk relative to the rest of the change

## Decision: resolve open architectural questions concretely in the design doc rather than mid-build
**Mechanism:** Two open questions from a PRD (what floor/ceiling apply to two of three new modes) were resolved concretely in the architecture doc rather than left for a mid-build question, with the reasoning for each choice written down.
**Evidence:** multi-worker-tasks campaign (2026-09-04) — `AT_MOST` implies a floor of 1 (mirrors the existing single-worker guarantee); `AT_LEAST` has no ceiling (its whole purpose is unbounded recruiting)
**Confidence:** medium
**Last confirmed:** 2026-09-04
**Applies to:** Architecture phases with open questions that have a defensible default — write the reasoning down and flag it for a later human confirmation rather than blocking the build on it
