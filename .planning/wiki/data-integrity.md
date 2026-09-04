---
topic: data-integrity
last-compiled: 2026-09-04
sources: 1
---

# Data Integrity

## Anti-pattern: unordered findFirst on a status filter that can match more than one row
**What was tried:** Three admin routes fetched "the" `ACTIVE`/`COMPLETED` row for an instance via `findFirst` with no `orderBy` and no way to specify which one — correct only when the filter matches at most one row.
**Failure mode:** Once a feature made more than one row able to match the same filter (multiple concurrent `ACTIVE` assignments per instance), the query silently picked an arbitrary one instead of erroring or requiring disambiguation — this had no automated coverage because no prior test had ever staged more than one matching row.
**Evidence:** multi-worker-tasks campaign Phase 4 (2026-09-04) — `admin.ts` `revoke-assignment`/`complete`/`reject-completion` routes
**Avoidance:** When adding a feature that lets a previously-1:1 relationship become 1:N, grep for every `findFirst`/find-the-single-X query against the changed relationship and either add an explicit disambiguating id or a hard multiplicity check that errors loudly rather than picking arbitrarily.
**Last confirmed:** 2026-09-04

## Anti-pattern: whole-entity state mutated from a single related-row event without an aggregate check
**What was tried:** A function flipped an entire parent entity's status whenever any one child row closed, without checking how many other child rows were still active on the same parent.
**Failure mode:** Once the parent could hold more than one concurrent active child, closing one incorrectly reset the whole parent's status even though co-children were still actively in use — violating the feature's own stated staffing invariant. A second, narrower variant of the same missing-aggregate-check root cause (the function's top-level guard assumed the parent could only be in one specific prior state) was found later by live testing, not by any automated test.
**Evidence:** multi-worker-tasks campaign Phase 4-5 (2026-09-04) — `reopen.ts`'s `releaseOrRevokeAssignment`, two fix rounds
**Avoidance:** When an entity's status is derived from the state of multiple child rows, any mutation triggered by a single child row changing must recompute the aggregate (count/sum/etc.) before deciding whether the parent's status should also change — never assume the mutating child is the only one.
**Last confirmed:** 2026-09-04

## Anti-pattern: denormalized field not copied at every entity-creation path
**What was tried:** New fields were added to an entity and correctly used by every use-case that reads them, but not every real code path that creates that entity was updated to copy the values from the parent record — only some creation paths were audited.
**Failure mode:** Every row created through an un-audited path silently reverted to the schema default, making the feature completely inert end-to-end for two full phases, undetected because those phases' own tests created rows directly via a DB insert that bypassed the real creation paths.
**Evidence:** multi-worker-tasks campaign Phase 3 (2026-09-04) — `runAssignmentSweep.ts` T1 materialization and `admin.ts`'s `/materialize` endpoint both forgot to copy `workerCountMode`/`workerCount` from the `TaskDefinition`
**Avoidance:** When adding a new field to an entity, grep for every `.create()` call site for that entity's table, not just the use-cases that read the new field, and verify each one either sets it explicitly or is provably fine relying on the schema default.
**Last confirmed:** 2026-09-04
