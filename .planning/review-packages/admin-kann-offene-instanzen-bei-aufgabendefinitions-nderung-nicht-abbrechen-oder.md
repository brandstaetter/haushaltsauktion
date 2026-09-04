# Delivery Review Package: Admin kann offene Instanzen bei Aufgabendefinitions-Änderung nicht abbrechen oder automatisch aktualisieren

Generated: 2026-09-04T13:17:26.082Z
Outcome: review-package
Campaign: .planning/campaigns/completed/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
Review Target: .planning/review-packages/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
Review Target Type: local-package
Readiness: needs-evidence

## Git Snapshot

- Branch: main
- Status: M apps/api/src/infra/http/routes/admin.ts
 M apps/web/src/api/hooks.ts
 M apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx
 M apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
 M apps/web/src/strings/de.ts
 M package.json
?? .planning/campaigns/completed/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
?? .planning/daemon-scheduled-restart.ps1
?? .planning/daemon.json
?? .planning/handoffs/
?? .planning/intake/add-test-coverage-tooling.md
?? .planning/intake/admin-cancel-or-sync-open-instances-on-definition-change.md
?? .planning/intake/todoist-worker-not-multi-instance-safe.md
?? .planning/review-packages/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
?? apps/api/src/app/tasks/cancelInstance.ts
?? apps/api/test/integration/cancel-instance.test.ts

### Changed Files

- apps/api/src/infra/http/routes/admin.ts
- apps/web/src/api/hooks.ts
- apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx
- apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
- apps/web/src/strings/de.ts
- package.json

### Diff Stat

```
apps/api/src/infra/http/routes/admin.ts            |  72 +++++++++---
 apps/web/src/api/hooks.ts                          |  42 +++++++
 .../AdminPage/TaskDefinitionsSection.test.tsx      |  91 +++++++++++++++
 .../src/pages/AdminPage/TaskDefinitionsSection.tsx | 124 +++++++++++++++++----
 apps/web/src/strings/de.ts                         |  13 +++
 package.json                                       |   3 +-
 6 files changed, 306 insertions(+), 39 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 6 files modified, 2 files added (apps/api/src/app/tasks/cancelInstance.ts new; apps/api/test/integration/cancel-instance.test.ts new) | complete | fail |
| phase:3 | verification-command | test_result | yes | npm run typecheck clean; npm run lint clean; npm run test — shared 144/144, api 367/367 (incl. 6 new cancel-instance integration tests + ledger integrity check), web 136/136 (incl. 1 new cancel-UI test); live browser verification: published a real instance of "Bad putzen", confirmed "Laufende Instanzen" renders the row with an "Instanz abbrechen" button and the bulk "Alle offenen Instanzen abbrechen" button, clicked cancel, confirmed toast "Instanz wurde abgebrochen." and list returned to empty state | complete | fail |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md | resolved | pass |

## Verification

- npm run typecheck clean; npm run lint clean; npm run test — shared 144/144, api 367/367 (incl. 6 new cancel-instance integration tests + ledger integrity check), web 136/136 (incl. 1 new cancel-UI test); live browser verification: published a real instance of "Bad putzen", confirmed "Laufende Instanzen" renders the row with an "Instanz abbrechen" button and the bulk "Alle offenen Instanzen abbrechen" button, clicked cancel, confirmed toast "Instanz wurde abgebrochen." and list returned to empty state: complete (fail)

---HANDOFF---
- Review target: .planning/review-packages/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
- Campaign: .planning/campaigns/completed/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md
- Evidence readiness: needs-evidence
- Git status: dirty
---
