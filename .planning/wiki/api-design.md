---
topic: api-design
last-compiled: 2026-09-04
sources: 1
---

# API Design

## Additive DTO evolution instead of breaking renames
**Mechanism:** When a DTO needed to expose a list instead of a single item (e.g. every active assignment instead of one), the existing singular field was kept unchanged (still the lowest-index entry, for backward compatibility) and a new plural field was added alongside it, rather than renaming/removing the singular field. This let backend phases ship independently of the frontend phase that would consume the new shape.
**Evidence:** multi-worker-tasks campaign Phase 3 (2026-09-04) — `activeAssignment`/`assignment`/`assignee` kept, `activeAssignments`/`assignees` added
**Confidence:** high
**Last confirmed:** 2026-09-04
**Applies to:** Any phased campaign where backend and frontend consumption of a widened DTO happen in separate phases

## Decision: treat an architecture doc's named file list as a floor, not a ceiling
**Mechanism:** An architecture doc's file list for a phase was extended beyond its literal contents (adding the hand-maintained admin type declarations and the actual admin create/edit form component) rather than treated as fixed scope, because the doc had named only a read-only display component and missed where the actual form logic lived — the phase's end conditions were literally unreachable without touching the missing files.
**Evidence:** multi-worker-tasks campaign Phase 4 (2026-09-04) — logged explicitly as a documentation gap rather than scope creep, no rework needed
**Confidence:** medium
**Last confirmed:** 2026-09-04
**Applies to:** Any build phase where the architecture doc's file list doesn't obviously cover the entry point (form/CRUD UI) for the feature it describes — verify the doc's list against the actual admin/CRUD entry points before starting, not after hitting an unreachable end condition
