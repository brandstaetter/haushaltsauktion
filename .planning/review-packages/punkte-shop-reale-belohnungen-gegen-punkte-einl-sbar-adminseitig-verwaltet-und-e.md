# Delivery Review Package: Punkte-Shop: reale Belohnungen gegen Punkte einlösbar, adminseitig verwaltet und erfüllt

Generated: 2026-09-03T06:15:39.186Z
Outcome: review-package
Campaign: .planning/campaigns/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
Review Target: .planning/review-packages/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
Review Target Type: local-package
Readiness: needs-evidence

## Git Snapshot

- Branch: main
- Status: M .planning/intake/points-shop-real-life-rewards.md
 M .planning/intake/points-shop-virtual-gamification-items.md
 M apps/api/prisma/schema.prisma
 M apps/api/src/app/points/postTransaction.ts
 M apps/api/src/app/points/verifyLedgerIntegrity.ts
 M apps/api/src/domain/points/ledger-math.ts
 M apps/api/src/infra/http/error-mapper.ts
 M apps/api/src/infra/http/routes/admin.ts
 M apps/api/src/infra/http/server.ts
 M apps/api/src/simulation/simulate.ts
 M apps/api/test/domain/_ledger.ts
 M apps/api/test/domain/ledger.test.ts
 M apps/api/test/integration/_fixture.ts
 M apps/web/src/api/hooks.ts
 M apps/web/src/api/types.ts
 M apps/web/src/components/Nav/Nav.tsx
 M apps/web/src/pages/AccountPage/AccountPage.tsx
 M apps/web/src/router.tsx
 M apps/web/src/strings/de.ts
 M eslint-rules/index.js
 M packages/shared/src/api/errors.ts
 M packages/shared/src/api/index.ts
 M packages/shared/src/config/defaults.ts
 M packages/shared/src/config/schema.ts
 M packages/shared/src/config/types.ts
 M packages/shared/src/domain/enums.ts
?? .planning/campaigns/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
?? .planning/campaigns/punkte-shop-virtuelle-gamification-items-mit-zeitlich-begrenzten-effekten-tr-nke.md
?? .planning/review-packages/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
?? apps/api/prisma/migrations/20260903055947_add_reward_shop/
?? apps/api/prisma/migrations/20260903060000_add_reward_shop_constraints/
?? apps/api/src/app/rewards/
?? apps/api/src/domain/rewards/
?? apps/api/src/infra/http/routes/rewards.ts
?? apps/api/test/domain/rewards.test.ts
?? apps/api/test/integration/reward-shop.test.ts
?? apps/web/src/components/RewardPurchaseDisclosure/
?? apps/web/src/pages/AdminPage/AdminRewardsPage.tsx
?? apps/web/src/pages/AdminPage/RewardRedemptionsSection.tsx
?? apps/web/src/pages/AdminPage/RewardsSection.tsx
?? apps/web/src/pages/RewardsShopPage/
?? packages/shared/src/api/rewards.ts

### Changed Files

- .planning/intake/points-shop-real-life-rewards.md
- .planning/intake/points-shop-virtual-gamification-items.md
- apps/api/prisma/schema.prisma
- apps/api/src/app/points/postTransaction.ts
- apps/api/src/app/points/verifyLedgerIntegrity.ts
- apps/api/src/domain/points/ledger-math.ts
- apps/api/src/infra/http/error-mapper.ts
- apps/api/src/infra/http/routes/admin.ts
- apps/api/src/infra/http/server.ts
- apps/api/src/simulation/simulate.ts
- apps/api/test/domain/_ledger.ts
- apps/api/test/domain/ledger.test.ts
- apps/api/test/integration/_fixture.ts
- apps/web/src/api/hooks.ts
- apps/web/src/api/types.ts
- apps/web/src/components/Nav/Nav.tsx
- apps/web/src/pages/AccountPage/AccountPage.tsx
- apps/web/src/router.tsx
- apps/web/src/strings/de.ts
- eslint-rules/index.js
- packages/shared/src/api/errors.ts
- packages/shared/src/api/index.ts
- packages/shared/src/config/defaults.ts
- packages/shared/src/config/schema.ts
- packages/shared/src/config/types.ts
- packages/shared/src/domain/enums.ts

### Diff Stat

```
.planning/intake/points-shop-real-life-rewards.md  |  3 +-
 .../points-shop-virtual-gamification-items.md      |  2 +
 apps/api/prisma/schema.prisma                      | 92 ++++++++++++++++++++--
 apps/api/src/app/points/postTransaction.ts         |  4 +
 apps/api/src/app/points/verifyLedgerIntegrity.ts   |  2 +
 apps/api/src/domain/points/ledger-math.ts          | 37 +++++++++
 apps/api/src/infra/http/error-mapper.ts            |  2 +
 apps/api/src/infra/http/routes/admin.ts            | 91 +++++++++++++++++++++
 apps/api/src/infra/http/server.ts                  |  2 +
 apps/api/src/simulation/simulate.ts                |  1 +
 apps/api/test/domain/_ledger.ts                    |  3 +
 apps/api/test/domain/ledger.test.ts                |  1 +
 apps/api/test/integration/_fixture.ts              |  4 +
 apps/web/src/api/hooks.ts                          | 75 ++++++++++++++++++
 apps/web/src/api/types.ts                          | 32 ++++++++
 apps/web/src/components/Nav/Nav.tsx                |  3 +-
 apps/web/src/pages/AccountPage/AccountPage.tsx     |  7 ++
 apps/web/src/router.tsx                            | 18 +++++
 apps/web/src/strings/de.ts                         | 54 +++++++++++++
 eslint-rules/index.js                              |  3 +
 packages/shared/src/api/errors.ts                  |  5 ++
 packages/shared/src/api/index.ts                   |  1 +
 packages/shared/src/config/defaults.ts             |  8 ++
 packages/shared/src/config/schema.ts               | 26 ++++++
 packages/shared/src/config/types.ts                | 20 +++++
 packages/shared/src/domain/enums.ts                | 12 +++
 26 files changed, 501 insertions(+), 7 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat — 26 files changed, 501 insertions(+), 7 deletions(-); plus new files (2 migrations, app/rewards/, domain/rewards/, infra/http/routes/rewards.ts, RewardsShopPage, AdminRewardsPage, RewardsSection, RewardRedemptionsSection, RewardPurchaseDisclosure, packages/shared/src/api/rewards.ts, 2 new test files) | done | fail |
| phase:3 | verification-command | test_result | yes | npm run typecheck (root, clean) · npm run lint (root, clean) · npm run test (shared 144 passed, api 293 passed incl. new reward-shop domain+integration tests, web 118 passed) — all against a live Postgres via migrate dev | done | fail |
| phase:4 | review-package | review_package | yes | .planning/review-packages/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md | resolved | pass |

## Verification

- npm run typecheck (root, clean) · npm run lint (root, clean) · npm run test (shared 144 passed, api 293 passed incl. new reward-shop domain+integration tests, web 118 passed) — all against a live Postgres via migrate dev: done (fail)

---HANDOFF---
- Review target: .planning/review-packages/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
- Campaign: .planning/campaigns/punkte-shop-reale-belohnungen-gegen-punkte-einl-sbar-adminseitig-verwaltet-und-e.md
- Evidence readiness: needs-evidence
- Git status: dirty
---
