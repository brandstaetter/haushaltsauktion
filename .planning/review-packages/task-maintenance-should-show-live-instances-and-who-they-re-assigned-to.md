# Delivery Review Package: Task maintenance should show live instances and who they're assigned to

Generated: 2026-09-01T04:47:25.099Z
Outcome: review-package
Campaign: .planning/campaigns/task-maintenance-should-show-live-instances-and-who-they-re-assigned-to.md
Review Target: https://github.com/brandstaetter/haushaltsauktion/pull/10
Review Target Type: pull-request
Readiness: ready

## Git Snapshot

- Branch: feat/admin-live-instances-view
- Status: M .planning/campaigns/history-entries-missing-task-name-and-new-value-no-volunteer-value-reset-randoml.md
 M .planning/campaigns/task-maintenance-should-show-live-instances-and-who-they-re-assigned-to.md
?? .planning/intake/admin-unassign-random-assignment.md
?? .planning/intake/assignment-explanation-not-reachable.md
?? .planning/intake/auto-assignment-only-within-24h-of-deadline.md
?? .planning/intake/duration-and-datetime-input-components.md

### Changed Files

- .planning/campaigns/history-entries-missing-task-name-and-new-value-no-volunteer-value-reset-randoml.md
- .planning/campaigns/task-maintenance-should-show-live-instances-and-who-they-re-assigned-to.md

### Diff Stat

```
...issing-task-name-and-new-value-no-volunteer-value-reset-randoml.md | 2 ++
 ...ntenance-should-show-live-instances-and-who-they-re-assigned-to.md | 4 ++--
 2 files changed, 4 insertions(+), 2 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat — 10 files changed, 359 insertions(+), 5 deletions(-) | pass | pass |
| phase:3 | verification-command | test_result | yes | `npm run typecheck` clean; `npm run lint` clean; `npm run test --workspaces` — shared (128/128), api (244/244, incl. new admin-task-definitions integration test against local Postgres), web (73/73, incl. new instance-list test) all passed | pass | pass |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/10 | resolved | pass |

## Verification

- `npm run typecheck` clean; `npm run lint` clean; `npm run test --workspaces` — shared (128/128), api (244/244, incl. new admin-task-definitions integration test against local Postgres), web (73/73, incl. new instance-list test) all passed: pass (pass)

---HANDOFF---
- Review target: https://github.com/brandstaetter/haushaltsauktion/pull/10
- Campaign: .planning/campaigns/task-maintenance-should-show-live-instances-and-who-they-re-assigned-to.md
- Evidence readiness: ready
- Git status: dirty
---
