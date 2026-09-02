# Delivery Review Package: CI: E2E-Tests gegen einen temporären Wegwerf-Stack vor dem echten Deploy

Generated: 2026-09-01T18:33:55.650Z
Outcome: review-package
Campaign: .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md
Review Target: https://github.com/brandstaetter/haushaltsauktion/pull/31
Review Target Type: pull-request
Readiness: ready

## Git Snapshot

- Branch: feat/e2e-throwaway-stack
- Status: M .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md
?? .planning/intake/member-row-card-redesign.md

### Changed Files

- .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md

### Diff Stat

```
...ests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

## Evidence Summary

| Target | ID | Type | Required | Evidence | Status | Result |
|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | `.github/workflows/deploy.yml` (new `e2e` job + `pull_request` trigger + `build-and-push`/`deploy` guards), `apps/web/Dockerfile` (`VITE_DEMO_LOGIN` build arg), `deploy/docker-compose.e2e.yml` (new CI-only overlay), `playwright.config.ts` (`E2E_EXTERNAL_SERVERS` conditional webServer), `docs/hosting-plan.md` (§3, §3.1, §10 updated) | pass | pass |
| phase:3 | verification-command | test_result | yes | `npm run typecheck` clean, `npm run lint` clean, `npm run test` — 465/465 passed (shared 128, api 248, web 89); locally built both Docker images and started the full throwaway stack (`docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml -p haushaltsauktion-e2e up -d --build --wait`) — db/api/web all reported `Healthy`; confirmed the built web bundle contains the demo-login row (`grep "nur in der Demo"` on the served JS) only because `VITE_DEMO_LOGIN=true` was passed, proving the login-flow fix works against the real image. Did not run the Playwright suite itself against this local stack (would have required overwriting the developer's real, already-populated `.env`, which is out of scope to touch) — the actual E2E run happens on push via the new `e2e` CI job on a clean runner. | pass | pass |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/31 | resolved | pass |

## Verification

- `npm run typecheck` clean, `npm run lint` clean, `npm run test` — 465/465 passed (shared 128, api 248, web 89); locally built both Docker images and started the full throwaway stack (`docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml -p haushaltsauktion-e2e up -d --build --wait`) — db/api/web all reported `Healthy`; confirmed the built web bundle contains the demo-login row (`grep "nur in der Demo"` on the served JS) only because `VITE_DEMO_LOGIN=true` was passed, proving the login-flow fix works against the real image. Did not run the Playwright suite itself against this local stack (would have required overwriting the developer's real, already-populated `.env`, which is out of scope to touch) — the actual E2E run happens on push via the new `e2e` CI job on a clean runner.: pass (pass)

---HANDOFF---
- Review target: https://github.com/brandstaetter/haushaltsauktion/pull/31
- Campaign: .planning/campaigns/ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy.md
- Evidence readiness: ready
- Git status: dirty
---
