# Delivery Review Package: Aufgaben-Seite: dritter Tab \"Alle\" mit sämtlichen offenen Aufgaben und ihren Zuweisungen

Generated: 2026-09-02T20:48:09.376Z
Outcome: review-package
Campaign: .planning/campaigns/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
Review Target: .planning/review-packages/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: main
- Status: M .gitignore
 M .planning/intake/add-storybook-for-component-prototyping.md
 M .planning/intake/admin-bottom-nav-label-wrap-narrow-screens.md
 M .planning/intake/points-shop-virtual-gamification-items.md
 M .planning/intake/task-list-page-add-all-open-tasks-tab.md
 M README.md
 M apps/api/src/app/queries/taskDto.ts
 M apps/api/src/infra/http/routes/tasks.ts
 M apps/web/package.json
 M apps/web/src/api/hooks.ts
 M apps/web/src/components/Nav/Nav.module.css
 M apps/web/src/components/Nav/Nav.tsx
 M apps/web/src/components/TaskCard/TaskCard.module.css
 M apps/web/src/components/TaskCard/TaskCard.tsx
 M apps/web/src/pages/TaskListPage/TaskListPage.tsx
 M apps/web/src/strings/de.ts
 M e2e/helpers.ts
 M e2e/mobile-layout.spec.ts
 M package-lock.json
 M packages/shared/src/api/index.ts
 M packages/shared/src/api/tasks.ts
?? .planning/campaigns/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
?? .planning/campaigns/completed/admin-bottom-navigation-einstellungen-bricht-auf-schmalen-handybildschirmen-um-u.md
?? .planning/campaigns/completed/storybook-f-r-apps-web-hinzuf-gen-komponenten-isoliert-entwerfen-und-prototypen.md
?? .planning/review-packages/admin-bottom-navigation-einstellungen-bricht-auf-schmalen-handybildschirmen-um-u.md
?? .planning/review-packages/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
?? .planning/review-packages/storybook-f-r-apps-web-hinzuf-gen-komponenten-isoliert-entwerfen-und-prototypen.md
?? apps/api/test/integration/tasks-all.test.ts
?? apps/web/.storybook/
?? apps/web/src/components/Button/Button.stories.tsx
?? apps/web/src/components/CategoryBadge/CategoryBadge.stories.tsx
?? apps/web/src/components/StatusBadge/StatusBadge.stories.tsx
?? apps/web/src/components/TaskCard/TaskCard.stories.tsx
?? apps/web/src/components/TaskCard/TaskCard.test.tsx
?? apps/web/src/components/ValueChip/ValueChip.stories.tsx
?? apps/web/src/pages/TaskListPage/TaskListPage.test.tsx

### Changed Files

- .gitignore
- .planning/intake/add-storybook-for-component-prototyping.md
- .planning/intake/admin-bottom-nav-label-wrap-narrow-screens.md
- .planning/intake/points-shop-virtual-gamification-items.md
- .planning/intake/task-list-page-add-all-open-tasks-tab.md
- README.md
- apps/api/src/app/queries/taskDto.ts
- apps/api/src/infra/http/routes/tasks.ts
- apps/web/package.json
- apps/web/src/api/hooks.ts
- apps/web/src/components/Nav/Nav.module.css
- apps/web/src/components/Nav/Nav.tsx
- apps/web/src/components/TaskCard/TaskCard.module.css
- apps/web/src/components/TaskCard/TaskCard.tsx
- apps/web/src/pages/TaskListPage/TaskListPage.tsx
- apps/web/src/strings/de.ts
- e2e/helpers.ts
- e2e/mobile-layout.spec.ts
- package-lock.json
- packages/shared/src/api/index.ts
- packages/shared/src/api/tasks.ts

### Diff Stat

```
.gitignore                                         |    1 +
 .../add-storybook-for-component-prototyping.md     |    3 +-
 .../admin-bottom-nav-label-wrap-narrow-screens.md  |    3 +-
 .../points-shop-virtual-gamification-items.md      |    3 +-
 .../task-list-page-add-all-open-tasks-tab.md       |    3 +-
 README.md                                          |   17 +
 apps/api/src/app/queries/taskDto.ts                |   63 +
 apps/api/src/infra/http/routes/tasks.ts            |   13 +
 apps/web/package.json                              |    6 +-
 apps/web/src/api/hooks.ts                          |    9 +
 apps/web/src/components/Nav/Nav.module.css         |   33 +
 apps/web/src/components/Nav/Nav.tsx                |   23 +-
 .../src/components/TaskCard/TaskCard.module.css    |    6 +
 apps/web/src/components/TaskCard/TaskCard.tsx      |   20 +-
 apps/web/src/pages/TaskListPage/TaskListPage.tsx   |   91 +-
 apps/web/src/strings/de.ts                         |    6 +
 e2e/helpers.ts                                     |   37 +
 e2e/mobile-layout.spec.ts                          |   57 +-
 package-lock.json                                  | 1974 ++++++++++++++++++--
 packages/shared/src/api/index.ts                   |    2 +
 packages/shared/src/api/tasks.ts                   |   14 +
 21 files changed, 2136 insertions(+), 248 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | verified | pass |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test --workspaces: shared 138/138, api 271/271, web 117/117 — all pass. Reviewed the backend query, DTO, and frontend diffs directly (INSTANCE_INCLUDE assignments join, listAllOpenTasks/toHouseholdTaskDto, GET /tasks/all route, TaskCard's additive assignee prop, read-only household tab). Independently re-run outside the build agent's own session, matching its reported results exactly. | verified | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md | resolved | pass |

## Verification

- npm run typecheck: clean. npm run lint: clean. npm run test --workspaces: shared 138/138, api 271/271, web 117/117 — all pass. Reviewed the backend query, DTO, and frontend diffs directly (INSTANCE_INCLUDE assignments join, listAllOpenTasks/toHouseholdTaskDto, GET /tasks/all route, TaskCard's additive assignee prop, read-only household tab). Independently re-run outside the build agent's own session, matching its reported results exactly.: verified (pass)

---HANDOFF---
- Review target: .planning/review-packages/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
- Campaign: .planning/campaigns/aufgaben-seite-dritter-tab-alle-mit-s-mtlichen-offenen-aufgaben-und-ihren-zuweis.md
- Evidence readiness: ready
- Git status: dirty
---
