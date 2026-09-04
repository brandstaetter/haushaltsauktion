---
topic: archon-workflow
last-compiled: 2026-09-04
sources: 1
---

# Archon Workflow

## Anti-pattern: inconsistent delegation telemetry logging within a single orchestrator session
**What was tried:** Archon logged `campaign-start` and its first phases' `agent-start`/`agent-complete` events to telemetry, but later phases (including corrective-fix delegations and validator spawns) used the `Agent` tool directly without the paired telemetry calls the protocol specifies.
**Failure mode:** The raw agent-runs telemetry for the campaign understated how much delegation and independent-verification work actually happened, and even contained a stray premature `campaign-complete` event logged mid-campaign from an earlier session attempt — making the telemetry trail unreliable as a record of the campaign's actual activity.
**Evidence:** multi-worker-tasks campaign (2026-09-04), postmortem "Patterns" section
**Avoidance:** Call `telemetry-log.cjs --event agent-start`/`agent-complete` around every `Agent` tool delegation and validator spawn for the full duration of a campaign, not only its first phases.
**Last confirmed:** 2026-09-04
