# Delivery Review Package: Flexiblere Berechtigungen: rollenbasierte Aufgaben-Eligibility und bevorzugte Zuweisung

Generated: 2026-09-04T11:45:35.235Z
Outcome: review-package
Campaign: .planning/campaigns/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
Review Target: .planning/review-packages/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: feat/role-based-eligibility-preferred-assignee
- Status: M apps/api/prisma/schema.prisma
 M apps/api/src/app/assignment/candidates.ts
 M apps/api/src/app/assignment/runAssignmentSweep.ts
 M apps/api/src/app/queries/taskDto.ts
 M apps/api/src/app/tasks/volunteerForTask.ts
 M apps/api/src/domain/assignment/eligibility.ts
 M apps/api/src/domain/assignment/strategies.ts
 M apps/api/src/domain/assignment/weights.ts
 M apps/api/src/domain/task/worker-slots.ts
 M apps/api/src/infra/http/routes/admin.ts
 M apps/api/src/simulation/simulate.ts
 M apps/api/test/domain/eligibility.test.ts
 M apps/api/test/domain/fairness.test.ts
 M apps/api/test/domain/worker-slots.test.ts
 M apps/api/test/integration/_fixture.ts
 M apps/web/src/api/hooks.ts
 M apps/web/src/api/types.ts
 M apps/web/src/components/AssignmentExplanation/AssignmentExplanation.test.tsx
 M apps/web/src/components/AssignmentExplanation/AssignmentExplanation.tsx
 M apps/web/src/components/TaskMaintenanceCard/TaskMaintenanceCard.stories.tsx
 M apps/web/src/components/TaskMaintenanceCard/TaskMaintenanceCard.tsx
 M apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx
 M apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
 M apps/web/src/strings/de.ts
 M package.json
 M packages/shared/src/config/defaults.ts
 M packages/shared/src/config/schema.ts
 M packages/shared/src/config/types.ts
 M packages/shared/src/domain/reasons.ts
?? .planning/campaigns/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
?? .planning/daemon-scheduled-restart.ps1
?? .planning/daemon.json
?? .planning/intake/add-test-coverage-tooling.md
?? .planning/intake/task-role-based-eligibility-and-preferred-assignee.md
?? .planning/intake/todoist-worker-not-multi-instance-safe.md
?? .planning/review-packages/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
?? apps/api/prisma/migrations/20260904112603_role_based_eligibility_preferred_assignee/
?? apps/api/test/integration/role-based-eligibility-preferred-assignee.test.ts

### Changed Files

- apps/api/prisma/schema.prisma
- apps/api/src/app/assignment/candidates.ts
- apps/api/src/app/assignment/runAssignmentSweep.ts
- apps/api/src/app/queries/taskDto.ts
- apps/api/src/app/tasks/volunteerForTask.ts
- apps/api/src/domain/assignment/eligibility.ts
- apps/api/src/domain/assignment/strategies.ts
- apps/api/src/domain/assignment/weights.ts
- apps/api/src/domain/task/worker-slots.ts
- apps/api/src/infra/http/routes/admin.ts
- apps/api/src/simulation/simulate.ts
- apps/api/test/domain/eligibility.test.ts
- apps/api/test/domain/fairness.test.ts
- apps/api/test/domain/worker-slots.test.ts
- apps/api/test/integration/_fixture.ts
- apps/web/src/api/hooks.ts
- apps/web/src/api/types.ts
- apps/web/src/components/AssignmentExplanation/AssignmentExplanation.test.tsx
- apps/web/src/components/AssignmentExplanation/AssignmentExplanation.tsx
- apps/web/src/components/TaskMaintenanceCard/TaskMaintenanceCard.stories.tsx
- apps/web/src/components/TaskMaintenanceCard/TaskMaintenanceCard.tsx
- apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx
- apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
- apps/web/src/strings/de.ts
- package.json
- packages/shared/src/config/defaults.ts
- packages/shared/src/config/schema.ts
- packages/shared/src/config/types.ts
- packages/shared/src/domain/reasons.ts

### Diff Stat

```
apps/api/prisma/schema.prisma                      |  58 +++++++--
 apps/api/src/app/assignment/candidates.ts          |  22 +++-
 apps/api/src/app/assignment/runAssignmentSweep.ts  |  54 +++++++-
 apps/api/src/app/queries/taskDto.ts                |  11 +-
 apps/api/src/app/tasks/volunteerForTask.ts         |  39 +++++-
 apps/api/src/domain/assignment/eligibility.ts      |  64 ++++++++--
 apps/api/src/domain/assignment/strategies.ts       |   2 +-
 apps/api/src/domain/assignment/weights.ts          |  23 +++-
 apps/api/src/domain/task/worker-slots.ts           |  38 ++++++
 apps/api/src/infra/http/routes/admin.ts            |  78 ++++++++++--
 apps/api/src/simulation/simulate.ts                |   9 +-
 apps/api/test/domain/eligibility.test.ts           |  56 ++++++++-
 apps/api/test/domain/fairness.test.ts              |  41 ++++--
 apps/api/test/domain/worker-slots.test.ts          |  53 ++++++++
 apps/api/test/integration/_fixture.ts              |   1 +
 apps/web/src/api/hooks.ts                          |   2 +-
 apps/web/src/api/types.ts                          |   8 ++
 .../AssignmentExplanation.test.tsx                 |  54 ++++++++
 .../AssignmentExplanation.tsx                      |   7 ++
 .../TaskMaintenanceCard.stories.tsx                |  17 +++
 .../TaskMaintenanceCard/TaskMaintenanceCard.tsx    |  15 +++
 .../AdminPage/TaskDefinitionsSection.test.tsx      | 139 +++++++++++++++++++++
 .../src/pages/AdminPage/TaskDefinitionsSection.tsx |  90 ++++++++++++-
 apps/web/src/strings/de.ts                         |  22 ++++
 package.json                                       |   3 +-
 packages/shared/src/config/defaults.ts             |   1 +
 packages/shared/src/config/schema.ts               |   5 +
 packages/shared/src/config/types.ts                |   9 ++
 packages/shared/src/domain/reasons.ts              |  25 +++-
 29 files changed, 878 insertions(+), 68 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | 28 files changed, 876 insertions(+), 67 deletions(-) across schema/migration, domain (eligibility.ts, weights.ts, strategies.ts, worker-slots.ts), app layer (candidates.ts, volunteerForTask.ts, runAssignmentSweep.ts, taskDto.ts), admin routes, shared config/reasons, and web UI (TaskDefinitionsSection, TaskMaintenanceCard, AssignmentExplanation) | verified | pass |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 360/360, web 132/132 all passing; npm run typecheck clean; npm run lint clean | verified | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md | resolved | pass |

## Verification

- npm run test: shared 144/144, api 360/360, web 132/132 all passing; npm run typecheck clean; npm run lint clean: verified (pass)

---HANDOFF---
- Review target: .planning/review-packages/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
- Campaign: .planning/campaigns/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md
- Evidence readiness: ready
- Git status: dirty
---
