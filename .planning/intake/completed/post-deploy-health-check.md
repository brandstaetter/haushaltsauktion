---
title: "Post-deploy health check in the Deploy workflow"
status: completed
priority: high
target: .github/workflows/deploy.yml, deploy/docker-compose.prod.yml
campaign: post-deploy-health-check-in-the-deploy-workflow
---

## Description

`deploy.yml`'s `deploy` job runs `docker compose pull && docker compose up -d` over SSH and then exits successfully — `docker compose up -d` returning success only means the containers were *started*, not that they stayed healthy. There is no step that checks whether the stack actually came up working before the workflow reports green.

This bit in production on 2026-08-31: PR #3's merge deployed a compose file with `INTEGRATION_ENCRYPTION_KEY: ${INTEGRATION_ENCRYPTION_KEY}` unconditionally declared. The Lightsail instance's `.env` never had that variable set, so Compose substituted an empty string; the API's config validation treated that as a malformed key and crashed the process at boot. `docker compose up -d` still exited 0, the `deploy` job still reported success, and the workflow run showed green — while the API container was actually crash-looping and Caddy was returning 502 for every request. The gap between "deploy succeeded" and "the app is actually up" went undetected until the user hit the site and reported it manually.

Add a health-check step to the `deploy` job (or a follow-up job) that verifies the stack is actually serving before declaring success. `api` already has a `/healthz` endpoint and a Docker healthcheck defined in `deploy/docker-compose.prod.yml:62-66` — this just needs to be polled from the deploy script after `docker compose up -d`, not just trusted implicitly.

## Acceptance Criteria

- After `docker compose up -d`, the deploy script polls `docker compose ps --format json` (or curls `/healthz` through Caddy, or both) with a bounded retry/timeout, and fails the workflow run if any service isn't healthy within that window.
- A crash-looping container (exit code, unhealthy status, or restart-looping) fails the GitHub Actions run visibly, rather than reporting green.
- Consider also checking the public HTTPS endpoint end-to-end (through Caddy) as a final check, since a container can be "healthy" per its own healthcheck while the reverse-proxy path is still broken.
- Document in `docs/hosting-plan.md` what the health check covers and what it deliberately doesn't (e.g. it confirms the process boots and answers `/healthz`, not full functional correctness — that's what the e2e suite is for).
