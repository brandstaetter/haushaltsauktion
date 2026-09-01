---
version: 1
id: "9b0835a7-2c31-4d18-8714-d4889ea9ea80"
status: active
started: "2026-09-01T03:13:20.668Z"
completed_at: null
direction: "Post-deploy health check in the Deploy workflow"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Post-deploy health check in the Deploy workflow

Status: active
Started: 2026-09-01T03:13:20.668Z
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
| 2 | pending | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | pending | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | pending | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test | pending | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/post-deploy-health-check-in-the-deploy-workflow.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-01T03:13:20.668Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

## Active Context

Delivery preflight complete. Next action: implement Phase 2 using the claimed scope, acceptance criteria, map context, and evidence contract.

## Continuation State

Phase: 2
Sub-step: implementation not started
Files modified: campaign scaffold only
Blocking: none
