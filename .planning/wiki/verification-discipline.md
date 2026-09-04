---
topic: verification-discipline
last-compiled: 2026-09-04
sources: 1
---

# Verification Discipline

## Independent re-verification of every sub-agent HANDOFF
**Mechanism:** After every build sub-agent finished, re-run the actual verification commands (typecheck/test/lint) and read the actual diff, rather than trusting the sub-agent's self-reported pass/fail counts. A phase-validator sub-agent then independently re-checks exit conditions against the code, not the HANDOFF prose.
**Evidence:** multi-worker-tasks campaign, all 6 phases (2026-09-04) — this discipline is what caught the first variant of the whole-instance-reopen bug (found during a disambiguation fix's own testing, then confirmed by Archon re-reading the diff) before the phase was marked complete
**Confidence:** high
**Last confirmed:** 2026-09-04
**Applies to:** Any multi-phase Archon campaign delegating build work to sub-agents, especially ones touching shared/concurrent state logic
