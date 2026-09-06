# Delivery Review Package: Expired ASSIGNED instances (random or voluntary) should penalize and re-offer — not silently terminate

Generated: 2026-09-06T03:38:57.112Z
Outcome: review-package
Campaign: .planning/campaigns/completed/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
Review Target: .planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: feat/task-due-soon-reminder
- Status: M .citadel/version.txt
 M .planning/campaigns/completed/push-benachrichtigungen-web-push-vapid-implementieren.md
 M .planning/intake/push-notifications-web-push-implementation.md
 M apps/api/prisma/schema.prisma
 M apps/api/src/app/assignment/runAssignmentSweep.ts
 M apps/api/src/domain/points/ledger-math.ts
 M apps/api/test/domain/ledger.test.ts
 M apps/web/src/components/NotificationBell/NotificationBell.test.tsx
 M apps/web/src/pages/HistoryPage/HistoryPage.test.tsx
 M apps/web/src/strings/de.ts
 M packages/shared/src/api/history.ts
 M packages/shared/src/config/defaults.ts
 M packages/shared/src/config/schema.ts
 M packages/shared/src/config/types.ts
 M packages/shared/src/domain/enums.ts
 M packages/shared/test/config.test.ts
?? .citadel/effective-config.json
?? .planning/app-server/
?? .planning/campaigns/completed/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
?? .planning/checkpoints/
?? .planning/intake/assigned-task-expiry-penalty-reoffer.md
?? .planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
?? .planning/verification/
?? apps/api/prisma/migrations/20260906031500_add_expiry_penalty_events/
?? apps/api/test/integration/assignment-expiry-penalty.test.ts

### Changed Files

- .citadel/version.txt
- .planning/campaigns/completed/push-benachrichtigungen-web-push-vapid-implementieren.md
- .planning/intake/push-notifications-web-push-implementation.md
- apps/api/prisma/schema.prisma
- apps/api/src/app/assignment/runAssignmentSweep.ts
- apps/api/src/domain/points/ledger-math.ts
- apps/api/test/domain/ledger.test.ts
- apps/web/src/components/NotificationBell/NotificationBell.test.tsx
- apps/web/src/pages/HistoryPage/HistoryPage.test.tsx
- apps/web/src/strings/de.ts
- packages/shared/src/api/history.ts
- packages/shared/src/config/defaults.ts
- packages/shared/src/config/schema.ts
- packages/shared/src/config/types.ts
- packages/shared/src/domain/enums.ts
- packages/shared/test/config.test.ts

### Diff Stat

```
.citadel/version.txt                               |   2 +-
 ...chrichtigungen-web-push-vapid-implementieren.md |   2 +-
 .../push-notifications-web-push-implementation.md  |   2 +-
 apps/api/prisma/schema.prisma                      |   2 +
 apps/api/src/app/assignment/runAssignmentSweep.ts  | 212 ++++++++++++++++++++-
 apps/api/src/domain/points/ledger-math.ts          |   1 +
 apps/api/test/domain/ledger.test.ts                |   8 +
 .../NotificationBell/NotificationBell.test.tsx     |  13 ++
 .../web/src/pages/HistoryPage/HistoryPage.test.tsx |  12 ++
 apps/web/src/strings/de.ts                         |   3 +
 packages/shared/src/api/history.ts                 |  10 +
 packages/shared/src/config/defaults.ts             |   5 +
 packages/shared/src/config/schema.ts               |  12 ++
 packages/shared/src/config/types.ts                |  11 ++
 packages/shared/src/domain/enums.ts                |   3 +
 packages/shared/test/config.test.ts                |  20 ++
 16 files changed, 307 insertions(+), 11 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | `git diff --stat` — expiry sweep, config, enum/migration, ledger, history/notification rendering, and focused tests changed | passed | pass |
| phase:3 | verification-command | test_result | yes | Direct workspace verification: shared 149/149, API 420/420, web 177/177; `npm run typecheck`; `npm run lint`; `npx prisma validate` with repo DATABASE_URL; elevated `npx vite build` (dist/sw.js generated). Root npm wrappers hit sandbox parent-directory traversal before test/build collection. | passed | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md | resolved | pass |

## Verification

- Direct workspace verification: shared 149/149, API 420/420, web 177/177; `npm run typecheck`; `npm run lint`; `npx prisma validate` with repo DATABASE_URL; elevated `npx vite build` (dist/sw.js generated). Root npm wrappers hit sandbox parent-directory traversal before test/build collection.: passed (pass)

---HANDOFF---
- Review target: .planning/review-packages/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
- Campaign: .planning/campaigns/completed/expired-assigned-instances-random-or-voluntary-should-penalize-and-re-offer-not-.md
- Evidence readiness: ready
- Git status: dirty
---
