# Delivery Review Package: Due-soon reminder for assigned tasks with a set duration — implement the dormant TASK_DUE_SOON scaffold

Generated: 2026-09-05T20:37:11.826Z
Outcome: review-package
Campaign: .planning/campaigns/due-soon-reminder-for-assigned-tasks-with-a-set-duration-implement-the-dormant-t.md
Review Target: https://github.com/brandstaetter/haushaltsauktion/pull/79
Review Target Type: pull-request
Readiness: needs-evidence

## Git Snapshot

- Branch: feat/task-due-soon-reminder
- Status: M .planning/campaigns/due-soon-reminder-for-assigned-tasks-with-a-set-duration-implement-the-dormant-t.md
?? .planning/intake/assigned-task-expiry-penalty-reoffer.md

### Changed Files

- .planning/campaigns/due-soon-reminder-for-assigned-tasks-with-a-set-duration-implement-the-dormant-t.md

### Diff Stat

```
...-for-assigned-tasks-with-a-set-duration-implement-the-dormant-t.md | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (7 files changed, 199 insertions(+), 2 deletions(-); new migration + new test file untracked) | done | fail |
| phase:3 | verification-command | test_result | yes | npm run test — 3/3 workspaces passed: shared 146/146, api 409/409, web 175/175; repo-wide typecheck clean; eslint clean on changed files | done | fail |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/79 | resolved | pass |

## Verification

- npm run test — 3/3 workspaces passed: shared 146/146, api 409/409, web 175/175; repo-wide typecheck clean; eslint clean on changed files: done (fail)

---HANDOFF---
- Review target: https://github.com/brandstaetter/haushaltsauktion/pull/79
- Campaign: .planning/campaigns/due-soon-reminder-for-assigned-tasks-with-a-set-duration-implement-the-dormant-t.md
- Evidence readiness: needs-evidence
- Git status: dirty
---
