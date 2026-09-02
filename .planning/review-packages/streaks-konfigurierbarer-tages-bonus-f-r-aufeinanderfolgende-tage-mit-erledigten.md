# Delivery Review Package: Streaks: konfigurierbarer Tages-Bonus für aufeinanderfolgende Tage mit erledigten Aufgaben

Generated: 2026-09-02T19:12:09.208Z
Outcome: review-package
Campaign: .planning/campaigns/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
Review Target: .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: main
- Status: M .planning/campaigns/aktions-button-auf-der-aufgaben-card-bricht-auf-schmalen-handybildschirmen-mitte.md
 M apps/api/prisma/schema.prisma
 M apps/api/src/app/assignment/reopen.ts
 M apps/api/src/app/points/clawback.ts
 M apps/api/src/app/tasks/completeTask.ts
 M apps/api/src/app/tasks/rejectCompletion.ts
 M apps/api/src/app/tx.ts
 M apps/api/src/domain/points/ledger-math.ts
 M apps/api/src/infra/http/routes/admin.ts
 M apps/api/src/infra/jobs/worker.ts
 M apps/web/src/strings/de.ts
 M packages/shared/src/config/defaults.ts
 M packages/shared/src/config/index.ts
 M packages/shared/src/config/schema.ts
 M packages/shared/src/config/types.ts
 M packages/shared/src/domain/enums.ts
 M packages/shared/src/index.ts
 M packages/shared/src/time/week.ts
 M packages/shared/test/config.test.ts
 M packages/shared/test/week.test.ts
?? .planning/campaigns/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
?? .planning/intake/add-storybook-for-component-prototyping.md
?? .planning/intake/admin-bottom-nav-label-wrap-narrow-screens.md
?? .planning/intake/daily-completion-streak-bonus.md
?? .planning/intake/points-shop-real-life-rewards.md
?? .planning/intake/points-shop-virtual-gamification-items.md
?? .planning/intake/task-list-page-add-all-open-tasks-tab.md
?? .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
?? apps/api/prisma/migrations/20260902184836_add_streak_bonus/
?? apps/api/prisma/migrations/20260902184900_add_streak_bonus_constraints/
?? apps/api/src/app/streak/
?? apps/api/src/domain/streak/
?? apps/api/test/domain/streak.test.ts
?? apps/api/test/integration/streak.test.ts

### Changed Files

- .planning/campaigns/aktions-button-auf-der-aufgaben-card-bricht-auf-schmalen-handybildschirmen-mitte.md
- apps/api/prisma/schema.prisma
- apps/api/src/app/assignment/reopen.ts
- apps/api/src/app/points/clawback.ts
- apps/api/src/app/tasks/completeTask.ts
- apps/api/src/app/tasks/rejectCompletion.ts
- apps/api/src/app/tx.ts
- apps/api/src/domain/points/ledger-math.ts
- apps/api/src/infra/http/routes/admin.ts
- apps/api/src/infra/jobs/worker.ts
- apps/web/src/strings/de.ts
- packages/shared/src/config/defaults.ts
- packages/shared/src/config/index.ts
- packages/shared/src/config/schema.ts
- packages/shared/src/config/types.ts
- packages/shared/src/domain/enums.ts
- packages/shared/src/index.ts
- packages/shared/src/time/week.ts
- packages/shared/test/config.test.ts
- packages/shared/test/week.test.ts

### Diff Stat

```
...-bricht-auf-schmalen-handybildschirmen-mitte.md | 16 ++--
 apps/api/prisma/schema.prisma                      | 16 ++++
 apps/api/src/app/assignment/reopen.ts              | 10 +--
 apps/api/src/app/points/clawback.ts                | 61 +++++++++++----
 apps/api/src/app/tasks/completeTask.ts             | 90 ++++++++++++++++++++--
 apps/api/src/app/tasks/rejectCompletion.ts         | 90 ++++++++++++++++++++--
 apps/api/src/app/tx.ts                             | 28 +++++--
 apps/api/src/domain/points/ledger-math.ts          | 39 ++++++++--
 apps/api/src/infra/http/routes/admin.ts            |  1 +
 apps/api/src/infra/jobs/worker.ts                  | 10 +++
 apps/web/src/strings/de.ts                         |  1 +
 packages/shared/src/config/defaults.ts             |  6 ++
 packages/shared/src/config/index.ts                |  1 +
 packages/shared/src/config/schema.ts               | 10 +++
 packages/shared/src/config/types.ts                | 16 ++++
 packages/shared/src/domain/enums.ts                |  4 +
 packages/shared/src/index.ts                       |  4 +
 packages/shared/src/time/week.ts                   | 29 +++++++
 packages/shared/test/config.test.ts                | 22 ++++++
 packages/shared/test/week.test.ts                  | 46 +++++++++++
 20 files changed, 450 insertions(+), 50 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 26 files changed, 1467 insertions(+), 44 deletions(-) across apps/api, apps/web, packages/shared, and this campaign file — see Decision Log for the full file list | verified | pass |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test: shared 138/138, api 269/269, web 110/110 — all pass, independently re-run outside the build agent's session and matching its reported counts exactly. | verified | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md | resolved | pass |

## Verification

- npm run typecheck: clean. npm run lint: clean. npm run test: shared 138/138, api 269/269, web 110/110 — all pass, independently re-run outside the build agent's session and matching its reported counts exactly.: verified (pass)

---HANDOFF---
- Review target: .planning/review-packages/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
- Campaign: .planning/campaigns/streaks-konfigurierbarer-tages-bonus-f-r-aufeinanderfolgende-tage-mit-erledigten.md
- Evidence readiness: ready
- Git status: dirty
---
