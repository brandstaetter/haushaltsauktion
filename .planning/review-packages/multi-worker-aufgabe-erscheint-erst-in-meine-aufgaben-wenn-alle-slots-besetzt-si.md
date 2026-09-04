# Delivery Review Package: Multi-Worker-Aufgabe erscheint erst in „Meine Aufgaben“, wenn alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält

Generated: 2026-09-04T20:25:34.354Z
Outcome: review-package
Campaign: .planning/campaigns/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
Review Target: .planning/review-packages/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: main
- Status: M apps/api/src/app/queries/taskDto.ts
?? .planning/campaigns/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
?? .planning/intake/multi-worker-task-not-in-my-tasks-until-fully-staffed.md
?? .planning/review-packages/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
?? apps/api/test/integration/multi-worker-assigned-to-me.test.ts

### Changed Files

- apps/api/src/app/queries/taskDto.ts

### Diff Stat

```
apps/api/src/app/queries/taskDto.ts | 17 +++++++++++++++--
 1 file changed, 15 insertions(+), 2 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: taskDto.ts 15 insertions/2 deletions + new 256-line integration test file | pass | pass |
| phase:3 | verification-command | test_result | yes | npm run test --workspaces: 144+373+152 tests passed, 0 failed (api +2 for the new test file) | pass | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md | resolved | pass |

## Verification

- npm run test --workspaces: 144+373+152 tests passed, 0 failed (api +2 for the new test file): pass (pass)

---HANDOFF---
- Review target: .planning/review-packages/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
- Campaign: .planning/campaigns/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md
- Evidence readiness: ready
- Git status: dirty
---
