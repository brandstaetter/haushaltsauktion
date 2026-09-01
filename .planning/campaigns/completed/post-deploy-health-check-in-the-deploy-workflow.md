---
version: 1
id: "9b0835a7-2c31-4d18-8714-d4889ea9ea80"
status: completed
started: "2026-09-01T03:13:20.668Z"
completed_at: "2026-09-01T03:45:20.000Z"
direction: "Post-deploy health check in the Deploy workflow"
phase_count: 4
current_phase: 4
branch: "fix/post-deploy-health-check, fix/web-healthcheck-missing-wget"
worktree_status: null
---

# Campaign: Post-deploy health check in the Deploy workflow

Status: completed
Started: 2026-09-01T03:13:20.668Z
Completed: 2026-09-01T03:45:20.000Z
Direction: Post-deploy health check in the Deploy workflow

## Claimed Scope
- .github/workflows/deploy.yml, deploy/docker-compose.prod.yml

## Intake Source

- File: .planning/intake/post-deploy-health-check.md
- Priority: high
- Initial Status: pending

## Delivery Brief

`deploy.yml`'s `deploy` job runs `docker compose pull && docker compose up -d` over SSH and then exits successfully — `docker compose up -d` returning success only means the containers were *started*, not that they stayed healthy. There is no step that checks whether the stack actually came up working before the workflow reports green.

This bit in production on 2026-08-31: PR #3's merge deployed a compose file with `INTEGRATION_ENCRYPTION_KEY: ${INTEGRATION_ENCRYPTION_KEY}` unconditionally declared. The Lightsail instance's `.env` never had that variable set, so Compose substituted an empty string; the API's config validation treated that as a malformed key and crashed the process at boot. `docker compose up -d` still exited 0, the `deploy` job still reported success, and the workflow run showed green — while the API container was actually crash-looping and Caddy was returning 502 for every request. The gap between "deploy succeeded" and "the app is actually up" went undetected until the user hit the site and reported it manually.

Add a health-check step to the `deploy` job (or a follow-up job) that verifies the stack is actually serving before declaring success. `api` already has a `/healthz` endpoint and a Docker healthcheck defined in `deploy/docker-compose.prod.yml:62-66` — this just needs to be polled from the deploy script after `docker compose up -d`, not just trusted implicitly.

## Acceptance Criteria

- After `docker compose up -d`, the deploy script polls `docker compose ps --format json` (or curls `/healthz` through Caddy, or both) with a bounded retry/timeout, and fails the workflow run if any service isn't healthy within that window.
- A crash-looping container (exit code, unhealthy status, or restart-looping) fails the GitHub Actions run visibly, rather than reporting green.
- Consider also checking the public HTTPS endpoint end-to-end (through Caddy) as a final check, since a container can be "healthy" per its own healthcheck while the reverse-proxy path is still broken.
- Document in `docs/hosting-plan.md` what the health check covers and what it deliberately doesn't (e.g. it confirms the process boots and answers `/healthz`, not full functional correctness — that's what the e2e suite is for).

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | PR #6 (deploy.yml poll loop + web healthcheck + docs), PR #8 (curl fix for the web healthcheck) | complete | 2 | — |
| phase:3 | verification-command | test_result | yes | `npx tsc --noEmit` clean; `npm run test --workspaces` — web (67/67) passed, api integration tests need a local Postgres this environment didn't have (pre-existing gap, unrelated to this change) so real verification came from GitHub Actions' `test` job (with a real Postgres service container) on push to main, which passed on both merges | complete | 2 | — |
| phase:4 | review-package | review_package | yes | PR #6 https://github.com/brandstaetter/haushaltsauktion/pull/6 (merged), PR #8 https://github.com/brandstaetter/haushaltsauktion/pull/8 (merged) | complete | 2 | — |

## Decision Log

- 2026-09-01T03:13:20.668Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01T03:33:12Z: PR #6 merged (poll loop over `docker compose ps` + `web` Docker healthcheck + `docs/hosting-plan.md` §3.1). Deploy run on that merge failed: `web-1` came up `unhealthy` — the healthcheck used `wget --spider`, and official `nginx:alpine` ships neither `wget` nor `curl`. The new check caught this correctly; it was the healthcheck command that was wrong, not the deploy.
  Reason: Recorded here rather than as a new intake item since it's a direct follow-on bug in the same change, discovered by the change itself doing its job.
- 2026-09-01T03:45:17Z: PR #8 merged (installs `curl` explicitly in `apps/web/Dockerfile`, switches the healthcheck to use it). Verified locally first: built the image, ran it with the exact healthcheck definition against a stub `api` upstream, confirmed `healthy` on the first check. The resulting deploy run (33467353694) succeeded.
  Reason: Confirms the health check now works end-to-end in the real environment, not just in isolated local testing.

## Active Context

Campaign complete. Both PRs merged, deploy pipeline green, health check verified working against a real crash-loop-style failure (the wget/curl bug) rather than only against synthetic conditions.

## Continuation State

Phase: 4 (complete)
Sub-step: none — campaign closed
Files modified: .github/workflows/deploy.yml, deploy/docker-compose.prod.yml, apps/web/Dockerfile, docs/hosting-plan.md
Blocking: none
