---
title: "Betriebsdashboard: aktive Haushalte, registrierte/aktive Nutzer und weitere Kennzahlen"
status: completed
priority: normal
campaign: operator-dashboard
target: apps/api/prisma/schema.prisma, apps/api/src/infra/auth/ (new operatorSession.ts), apps/api/src/infra/http/routes/ (new operator.ts), apps/api/src/app/operator/ (new), apps/api/prisma/create-operator.ts (new), apps/web/src/pages/OperatorDashboardPage/ (new), apps/web/src/api/ (new operator client), README.md
---

## Description

New feature request: a dashboard showing platform-wide operational metrics —
how many households are active, how many users are registered vs. active,
and other relevant health/performance metrics — for whoever runs the
deployment, not for a household's own members.

**This is not a per-household admin feature — it needs a new authorization
surface.** The existing `ADMIN` role is strictly household-scoped by design:
`requireAdmin` (`apps/api/src/infra/http/context.ts:145`) calls
`requireMember` first, which resolves the session's `activeHouseholdId` to a
`HouseholdMember` row — there is no path in the current model for a
`HouseholdMember` to see anything outside their own household, and
`context.ts`'s own header comment states this is deliberately "the single
choke point for household scoping" (CLAUDE.md §36: "kein Zugriff auf fremde
Haushalte"). "How many households exist / are active" is inherently
cross-household data, so no existing role can legitimately hold it.

**Decision (confirmed with requester): new platform-operator role, not a
flag on `User` and not an unauthenticated env-gated route.** A dedicated
`OperatorAccount` identity, completely separate from `User`/`HouseholdMember`
— it must not extend `RequestContext` or reuse `Session`, since that type is
inherently household-bound (`activeHouseholdId`, `householdId`, `role:
MemberRole`). Concretely:

1. **New Prisma models**, parallel to but independent of `User`/`Session`:
   `OperatorAccount` (id, email, passwordHash, createdAt) and
   `OperatorSession` (id, operatorAccountId, tokenHash, csrfTokenHash,
   createdAt, lastSeenAt, expiresAt, revokedAt) — same shape as the existing
   `Session` model (`schema.prisma:198-216`) and the same argon2id hashing
   (`apps/api/src/infra/auth/password.ts`), but a separate cookie name (e.g.
   `operator_session`) so the two auth systems can never be confused by a
   shared cookie key.
2. **Bootstrap via CLI, not self-service signup** — model
   `apps/api/prisma/create-operator.ts` on the existing
   `apps/api/prisma/create-admin.ts` pattern (interactive prompt, random
   password shown once, never logged). No `SETUP_TOKEN`-style HTTP
   self-registration for this role — the blast radius of a leaked
   registration token is much larger here (all households, not one).
   **Resolved (grill, 2026-09-03): the script is re-runnable** — no
   single-bootstrap guard — so a second/third operator is added by running
   it again with a new email; no in-app "invite an operator" UI for v1.
   Shell/CLI access is itself the access control, matching the
   CLI-not-self-service decision above. **Also resolved: password-only
   auth (argon2id, same rate-limit plugin as `auth.ts`) — no MFA, no IP
   allowlist for v1.** The metrics surface exposes aggregate counts only
   (no PII, no per-household breakdown, per the household-size-bucketing
   cut above); the actually dangerous failure mode — a household session
   reaching operator data — is covered by the dedicated isolation
   regression test below, not by credential strength.
3. **New route file** `apps/api/src/infra/http/routes/operator.ts`:
   `POST /api/operator/login`, `POST /api/operator/logout`, `GET
   /api/operator/metrics`. A new `requireOperator` preHandler (parallel to
   `requireAdmin`, but resolving `OperatorSession` instead of `Session` —
   does not call `requireMember` and never touches `activeHouseholdId`).
4. **Metrics aggregation** (`apps/api/src/app/operator/`, read-only
   cross-household queries — the one deliberate, narrow exception to the
   household-scoping choke point, isolated to this module so it stays easy
   to audit):
   - Households: total count, and "active" — **resolved (grill,
     2026-09-03): a household counts as active if it has ≥1 `TaskInstance`
     with `publishedAt` set in the last 14 days.** Rejected "≥1 active
     member" because households essentially never deactivate their last
     member, making that definition count nearly everyone; recent task
     activity is the real usage signal and needs no new config.
   - Users: total registered (`User` count), active by `User.isActive =
     true`, plus two recency-based figures via `Session.lastSeenAt` —
     **resolved: show both a 24h and a 7d window**, not just one, since they
     answer different questions (daily engagement vs. weekly reach) and cost
     the same query either way.
   - Metrics — **resolved: all five ship in v1**, not "at least two":
     task throughput (`TaskInstance` completed today/this week, as a flat
     count — **not** bucketed by household size, since that risks
     re-identifying a specific small household from an aggregate),
     point-ledger volume (`PointTransaction` count/sum by type over a
     window), buyout rate (`TaskAssignment.buyoutCost` not null), Todoist
     adoption (`MemberIntegration` rows with `status = ACTIVE`), and audit
     volume (`AuditEvent` count) as a rough error/anomaly signal. All are
     cheap live aggregates over existing tables — **resolved: snapshot-only
     for v1, computed live on every request; no history table, no scheduled
     snapshot job.** No forcing performance reason to pre-aggregate at
     current scale (CLAUDE.md §43); trend-over-time is a clean follow-up
     intake item if it turns out to matter.
5. **New frontend shell**, not nested under `/verwaltung/*` — those pages
   assume an active household context (`useActiveHousehold`-style state) that
   an operator view must not depend on. A standalone route (e.g.
   `/betrieb`) with its own login form, posting to `/api/operator/login`,
   completely separate from the member-facing `LoginPage`.
6. **README** gets an "Operator-Dashboard" section next to the existing
   "Todoist-Integration" one, documenting `create-operator`, the login URL,
   and that this identity is intentionally separate from any household
   account.

## Acceptance Criteria

- New `OperatorAccount`/`OperatorSession` models and migration; no reuse of
  `User`, `HouseholdMember`, or `Session` for this identity.
- `npm run create-operator` (or equivalent) creates the first operator
  account interactively, following the `create-admin.ts` one-time-password
  pattern.
- `POST /api/operator/login` / `/logout` issue and revoke an
  `operator_session` cookie distinct from the member `SESSION_COOKIE`; a
  valid household session must **not** grant access to `/api/operator/*`,
  and vice versa (regression test for the isolation, not just the happy
  path).
- `GET /api/operator/metrics` returns: total households, active households
  (≥1 `TaskInstance` published in the last 14 days), total registered
  users, active users (`isActive` total plus 24h and 7d
  `Session.lastSeenAt` recency figures), and all five metrics from the
  Description section above (task throughput, ledger volume, buyout rate,
  Todoist adoption, audit volume) — all computed live, server-side, no
  client-trusted numbers (§36), no history/trend storage in v1.
- Frontend `/betrieb` (or agreed path) renders the metrics behind its own
  login, reachable without ever selecting or being scoped to a household.
- Regression test: an authenticated household `ADMIN` hitting
  `/api/operator/metrics` gets `401`/`403`, not household-filtered data —
  this is the one place a bug would leak data across all households at
  once, so it gets its own explicit test, not just implicit coverage via
  the existing per-route auth tests.

## Scope note

This is **Large**, not a single-session Autopilot build: it introduces a
second, fully independent authentication system, two new Prisma models, a
new route namespace, a new frontend shell outside the existing
household-scoped app, and a cross-household query surface that is the one
deliberate exception to CLAUDE.md §36's isolation guarantee — worth an
`/archon` campaign with its own phase for "prove the isolation holds" rather
than folding into routine intake processing.
