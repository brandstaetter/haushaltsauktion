# Delivery Review Package: Multi-Worker-Aufgabe (AT_LEAST/AT_MOST) verschwindet aus allen Volunteer-Listen, sobald der erste Freiwillige übernimmt

Generated: 2026-09-04T15:20:11.182Z
Outcome: review-package
Campaign: .planning/campaigns/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
Review Target: .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: feat/admin-audit-log-local
- Status: M apps/api/src/app/queries/taskDto.ts
 M apps/api/test/integration/tasks-all.test.ts
 M apps/web/src/components/TaskCard/TaskCard.stories.tsx
 M apps/web/src/components/TaskCard/TaskCard.test.tsx
 M apps/web/src/components/TaskCard/TaskCard.tsx
 M apps/web/src/pages/TaskDetailPage/TaskDetailPage.test.tsx
 M apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx
 M apps/web/src/pages/TaskListPage/TaskListPage.test.tsx
 M package.json
 M packages/shared/src/api/tasks.ts
?? .planning/campaigns/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
?? .planning/daemon-scheduled-restart.ps1
?? .planning/daemon.json
?? .planning/handoffs/
?? .planning/intake/add-test-coverage-tooling.md
?? .planning/intake/multi-worker-task-vanishes-from-available-list-after-first-volunteer.md
?? .planning/intake/todoist-worker-not-multi-instance-safe.md
?? .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
?? apps/api/test/integration/multi-worker-available-list.test.ts

### Changed Files

- apps/api/src/app/queries/taskDto.ts
- apps/api/test/integration/tasks-all.test.ts
- apps/web/src/components/TaskCard/TaskCard.stories.tsx
- apps/web/src/components/TaskCard/TaskCard.test.tsx
- apps/web/src/components/TaskCard/TaskCard.tsx
- apps/web/src/pages/TaskDetailPage/TaskDetailPage.test.tsx
- apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx
- apps/web/src/pages/TaskListPage/TaskListPage.test.tsx
- package.json
- packages/shared/src/api/tasks.ts

### Diff Stat

```
apps/api/src/app/queries/taskDto.ts                | 31 +++++++++++++-
 apps/api/test/integration/tasks-all.test.ts        |  5 +++
 .../src/components/TaskCard/TaskCard.stories.tsx   | 23 ++++++++++-
 apps/web/src/components/TaskCard/TaskCard.test.tsx | 36 ++++++++++++++++-
 apps/web/src/components/TaskCard/TaskCard.tsx      |  7 +++-
 .../pages/TaskDetailPage/TaskDetailPage.test.tsx   | 47 ++++++++++++++++++++++
 .../src/pages/TaskDetailPage/TaskDetailPage.tsx    |  6 ++-
 .../src/pages/TaskListPage/TaskListPage.test.tsx   |  1 +
 package.json                                       |  3 +-
 packages/shared/src/api/tasks.ts                   | 11 +++++
 10 files changed, 163 insertions(+), 7 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (9 tracked files, +161/-6) + 1 new untracked test file: apps/api/test/integration/multi-worker-available-list.test.ts | verified | pass |
| phase:3 | verification-command | test_result | yes | npm run test: 627/627 passed (shared 144, api 345, web 138); npm run typecheck: clean (root+web+e2e); eslint on changed api/shared files: 0 errors | pass | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md | resolved | pass |

## Verification

- npm run test: 627/627 passed (shared 144, api 345, web 138); npm run typecheck: clean (root+web+e2e); eslint on changed api/shared files: 0 errors: pass (pass)

---HANDOFF---
- Review target: .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
- Campaign: .planning/campaigns/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
- Evidence readiness: ready
- Git status: dirty
---
