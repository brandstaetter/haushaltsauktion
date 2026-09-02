# Delivery Review Package: apps/web ist von ESLint ausgenommen und wird in CI nicht gelintet

Generated: 2026-09-02T07:43:57.983Z
Outcome: review-package
Campaign: .planning/campaigns/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
Review Target: .planning/review-packages/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: feat/categories-drag-drop-and-admin-ux-parity
- Status: M .github/workflows/deploy.yml
 M .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md
 M .planning/intake/web-lint-not-in-ci.md
 M apps/web/src/components/TaskCard/TaskCard.module.css
 M apps/web/src/components/TaskCard/TaskCard.tsx
 M apps/web/vitest.config.ts
?? .planning/campaigns/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
?? .planning/campaigns/kategorie-label-auf-der-aufgabenliste-farbig-hinterlegen.md
?? .planning/intake/task-card-category-color-badge.md
?? .planning/review-packages/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
?? .planning/review-packages/kategorie-label-auf-der-aufgabenliste-farbig-hinterlegen.md
?? apps/web/src/utils/color.test.ts
?? apps/web/src/utils/color.ts

### Changed Files

- .github/workflows/deploy.yml
- .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md
- .planning/intake/web-lint-not-in-ci.md
- apps/web/src/components/TaskCard/TaskCard.module.css
- apps/web/src/components/TaskCard/TaskCard.tsx
- apps/web/vitest.config.ts

### Diff Stat

```
.github/workflows/deploy.yml                            |  5 +++++
 ...en-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md |  6 ++++++
 .planning/intake/web-lint-not-in-ci.md                  |  3 ++-
 apps/web/src/components/TaskCard/TaskCard.module.css    |  3 +++
 apps/web/src/components/TaskCard/TaskCard.tsx           | 17 ++++++++++++++++-
 apps/web/vitest.config.ts                               |  1 -
 6 files changed, 32 insertions(+), 3 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: apps/web/vitest.config.ts (-1, removed redundant triple-slash reference), .github/workflows/deploy.yml (+5, new `npm run lint -w apps/web` step in the `test` job) | pass | pass |
| phase:3 | verification-command | test_result | yes | npm run lint (root): clean; npm run lint -w apps/web: clean (triple-slash-reference error resolved); npm run typecheck (root + web + e2e): clean; npm run test --workspaces --if-present: shared 128 tests, api 249 tests, web 107 tests, all passed | pass | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md | resolved | pass |

## Verification

- npm run lint (root): clean; npm run lint -w apps/web: clean (triple-slash-reference error resolved); npm run typecheck (root + web + e2e): clean; npm run test --workspaces --if-present: shared 128 tests, api 249 tests, web 107 tests, all passed: pass (pass)

---HANDOFF---
- Review target: .planning/review-packages/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
- Campaign: .planning/campaigns/apps-web-ist-von-eslint-ausgenommen-und-wird-in-ci-nicht-gelintet.md
- Evidence readiness: ready
- Git status: dirty
---
