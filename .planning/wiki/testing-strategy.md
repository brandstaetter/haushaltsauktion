---
topic: testing-strategy
last-compiled: 2026-09-04
sources: 1
---

# Testing Strategy

## Convert manual smoke-test end conditions into permanent end-to-end regression tests
**Mechanism:** Rather than performing a one-off manual click-through for an architecture doc's "manual smoke test" end condition, write one integration test that drives the complete multi-step narrative through real HTTP routes against a live test database, asserting the full history/ledger trace. This preserves the verification as a permanent regression guard instead of a one-time click that leaves no trace.
**Evidence:** multi-worker-tasks campaign Phase 5 (2026-09-04) — `multi-worker-full-lifecycle.test.ts`; this is exactly the kind of full-narrative test that caught a regression none of the earlier phases' isolated-mechanic tests staged
**Confidence:** high
**Last confirmed:** 2026-09-04
**Applies to:** Any campaign phase whose end condition is phrased as a manual walkthrough of a multi-step business process
