# Delivery Review Package: Notify members when a new deploy is live and let them refresh to it

Generated: 2026-09-03T13:54:49.126Z
Outcome: review-package
Campaign: .planning/campaigns/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
Review Target: .planning/review-packages/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
Review Target Type: local-package
Readiness: ready

## Git Snapshot

- Branch: main
- Status: M .planning/intake/notify-on-new-deploy-and-refresh-cache.md
 M apps/web/src/App.tsx
 M apps/web/src/env.d.ts
 M apps/web/src/strings/de.ts
 M apps/web/vite.config.ts
 M apps/web/vitest.config.ts
?? .planning/campaigns/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
?? .planning/review-packages/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
?? apps/web/src/components/UpdatePrompt/
?? apps/web/src/test/mocks/

### Changed Files

- .planning/intake/notify-on-new-deploy-and-refresh-cache.md
- apps/web/src/App.tsx
- apps/web/src/env.d.ts
- apps/web/src/strings/de.ts
- apps/web/vite.config.ts
- apps/web/vitest.config.ts

### Diff Stat

```
.planning/intake/notify-on-new-deploy-and-refresh-cache.md |  3 ++-
 apps/web/src/App.tsx                                       |  2 ++
 apps/web/src/env.d.ts                                      |  1 +
 apps/web/src/strings/de.ts                                 |  5 +++++
 apps/web/vite.config.ts                                    | 12 +++++++++++-
 apps/web/vitest.config.ts                                  |  2 ++
 6 files changed, 23 insertions(+), 2 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | resolved | pass |
| phase:3 | verification-command | test_result | yes | npm run test (144+305+121 tests, all pass) | resolved | pass |
| phase:4 | review-package | review_package | yes | .planning/review-packages/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md | resolved | pass |

## Verification

- npm run test (144+305+121 tests, all pass): resolved (pass)

---HANDOFF---
- Review target: .planning/review-packages/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
- Campaign: .planning/campaigns/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md
- Evidence readiness: ready
- Git status: dirty
---
