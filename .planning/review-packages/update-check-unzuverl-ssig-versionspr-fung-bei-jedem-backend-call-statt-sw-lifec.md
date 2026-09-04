# Delivery Review Package: Update-Check unzuverlässig: Versionsprüfung bei jedem Backend-Call statt SW-Lifecycle, sofortiges blockierendes Reload-Overlay

Generated: 2026-09-04T16:11:57.258Z
Outcome: review-package
Campaign: .planning/campaigns/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
Review Target: .planning/review-packages/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: feat/admin-audit-log-local
- Status: M .github/workflows/deploy.yml
 M apps/api/Dockerfile
 M apps/api/src/app/queries/taskDto.ts
 M apps/api/src/config.ts
 M apps/api/src/infra/http/server.ts
 M apps/api/test/integration/tasks-all.test.ts
 M apps/web/Dockerfile
 M apps/web/src/App.tsx
 M apps/web/src/api/client.ts
 M apps/web/src/api/operatorClient.ts
 M apps/web/src/components/TaskCard/TaskCard.stories.tsx
 M apps/web/src/components/TaskCard/TaskCard.test.tsx
 M apps/web/src/components/TaskCard/TaskCard.tsx
 D apps/web/src/components/UpdatePrompt/UpdatePrompt.module.css
 D apps/web/src/components/UpdatePrompt/UpdatePrompt.test.tsx
 D apps/web/src/components/UpdatePrompt/UpdatePrompt.tsx
 M apps/web/src/env.d.ts
 M apps/web/src/pages/TaskDetailPage/TaskDetailPage.test.tsx
 M apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx
 M apps/web/src/pages/TaskListPage/TaskListPage.test.tsx
 M apps/web/src/strings/de.ts
 M apps/web/vite.config.ts
 M package.json
 M packages/shared/src/api/tasks.ts
?? .planning/campaigns/completed/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
?? .planning/campaigns/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
?? .planning/daemon-scheduled-restart.ps1
?? .planning/daemon.json
?? .planning/handoffs/
?? .planning/intake/add-test-coverage-tooling.md
?? .planning/intake/admin-audit-log-checkbox-grid-filters.md
?? .planning/intake/multi-worker-task-vanishes-from-available-list-after-first-volunteer.md
?? .planning/intake/reliable-update-check-forced-reload-overlay.md
?? .planning/intake/todoist-worker-not-multi-instance-safe.md
?? .planning/review-packages/multi-worker-aufgabe-at-least-at-most-verschwindet-aus-allen-volunteer-listen-so.md
?? .planning/review-packages/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
?? apps/api/test/integration/app-version-header.test.ts
?? apps/api/test/integration/multi-worker-available-list.test.ts
?? apps/web/src/api/client.test.ts
?? apps/web/src/api/versionCheck.test.ts
?? apps/web/src/api/versionCheck.ts
?? apps/web/src/components/VersionMismatchOverlay/

### Changed Files

- .github/workflows/deploy.yml
- apps/api/Dockerfile
- apps/api/src/app/queries/taskDto.ts
- apps/api/src/config.ts
- apps/api/src/infra/http/server.ts
- apps/api/test/integration/tasks-all.test.ts
- apps/web/Dockerfile
- apps/web/src/App.tsx
- apps/web/src/api/client.ts
- apps/web/src/api/operatorClient.ts
- apps/web/src/components/TaskCard/TaskCard.stories.tsx
- apps/web/src/components/TaskCard/TaskCard.test.tsx
- apps/web/src/components/TaskCard/TaskCard.tsx
- apps/web/src/components/UpdatePrompt/UpdatePrompt.module.css
- apps/web/src/components/UpdatePrompt/UpdatePrompt.test.tsx
- apps/web/src/components/UpdatePrompt/UpdatePrompt.tsx
- apps/web/src/env.d.ts
- apps/web/src/pages/TaskDetailPage/TaskDetailPage.test.tsx
- apps/web/src/pages/TaskDetailPage/TaskDetailPage.tsx
- apps/web/src/pages/TaskListPage/TaskListPage.test.tsx
- apps/web/src/strings/de.ts
- apps/web/vite.config.ts
- package.json
- packages/shared/src/api/tasks.ts

### Diff Stat

```
.github/workflows/deploy.yml                       | 10 ++++
 apps/api/Dockerfile                                |  8 +++
 apps/api/src/app/queries/taskDto.ts                | 31 ++++++++++-
 apps/api/src/config.ts                             | 15 ++++++
 apps/api/src/infra/http/server.ts                  | 11 ++++
 apps/api/test/integration/tasks-all.test.ts        |  5 ++
 apps/web/Dockerfile                                |  8 +++
 apps/web/src/App.tsx                               |  4 +-
 apps/web/src/api/client.ts                         |  2 +
 apps/web/src/api/operatorClient.ts                 |  2 +
 .../src/components/TaskCard/TaskCard.stories.tsx   | 23 +++++++-
 apps/web/src/components/TaskCard/TaskCard.test.tsx | 36 ++++++++++++-
 apps/web/src/components/TaskCard/TaskCard.tsx      |  7 ++-
 .../UpdatePrompt/UpdatePrompt.module.css           | 34 ------------
 .../components/UpdatePrompt/UpdatePrompt.test.tsx  | 62 ----------------------
 .../src/components/UpdatePrompt/UpdatePrompt.tsx   | 55 -------------------
 apps/web/src/env.d.ts                              |  2 +
 .../pages/TaskDetailPage/TaskDetailPage.test.tsx   | 47 ++++++++++++++++
 .../src/pages/TaskDetailPage/TaskDetailPage.tsx    |  6 ++-
 .../src/pages/TaskListPage/TaskListPage.test.tsx   |  1 +
 apps/web/src/strings/de.ts                         |  9 ++--
 apps/web/vite.config.ts                            | 25 +++++----
 package.json                                       |  3 +-
 packages/shared/src/api/tasks.ts                   | 11 ++++
 24 files changed, 244 insertions(+), 173 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat (11 tracked files, +81/-15) + 6 new files (versionCheck.ts + 5 tests) + UpdatePrompt/ deleted (3 files) | verified | pass |
| phase:3 | verification-command | test_result | yes | npm run test: 636/636 passed (shared 144, api 347, web 145); npm run typecheck: clean; npm run lint -w apps/web: clean; eslint on changed api files: clean; manual Docker build + boot smoke test confirmed X-App-Version header and baked-in VITE_APP_VERSION; manual browser verification of the overlay (dev server, forced mismatch) confirmed render, updateServiceWorker(true) call, and forced reload | pass | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md | resolved | pass |

## Verification

- npm run test: 636/636 passed (shared 144, api 347, web 145); npm run typecheck: clean; npm run lint -w apps/web: clean; eslint on changed api files: clean; manual Docker build + boot smoke test confirmed X-App-Version header and baked-in VITE_APP_VERSION; manual browser verification of the overlay (dev server, forced mismatch) confirmed render, updateServiceWorker(true) call, and forced reload: pass (pass)

---HANDOFF---
- Review target: .planning/review-packages/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
- Campaign: .planning/campaigns/update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec.md
- Evidence readiness: ready
- Git status: dirty
---
