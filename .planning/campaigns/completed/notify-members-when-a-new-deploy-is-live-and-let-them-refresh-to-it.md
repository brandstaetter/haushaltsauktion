---
version: 1
id: "8673048d-faf0-4043-b06a-66f5cea4934c"
status: completed
started: "2026-09-03T13:46:38.722Z"
completed_at: null
direction: "Notify members when a new deploy is live and let them refresh to it"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Notify members when a new deploy is live and let them refresh to it

Status: completed
Started: 2026-09-03T13:46:38.722Z
Direction: Notify members when a new deploy is live and let them refresh to it

## Claimed Scope
- apps/web/vite.config.ts, apps/web/src/main.tsx, apps/web/src/App.tsx (or a new UpdatePrompt component), apps/web/src/strings/de.ts

## Intake Source

- File: .planning/intake/notify-on-new-deploy-and-refresh-cache.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

The PWA campaign (`.planning/campaigns/completed/pwa.md`) added `vite-plugin-pwa`
(`apps/web/vite.config.ts:11-25`) with `registerType: 'autoUpdate'` — a **deliberate**
decision at the time: the service worker updates itself silently on the next load,
with no "new version available" UI, because the app has no local-only state that a
silent reload could lose (everything is server-backed).

This intake item asks to reverse that specific decision: show a visible notification
when a new build is live, and let the member trigger the refresh themselves (or do
it automatically) rather than updating silently in the background. Two reasons this
now matters more than it did at PWA-campaign time: (1) household members may have
long-lived open tabs (the app polls `/dashboard`, `/notifications` every 30s per
`apps/web/src/api/hooks.ts`, so a tab can sit open for hours), and a silent SW
update means a stale tab keeps running old JS against a live server until the next
navigation/reload — someone could act on an outdated view of task values or point
balances without knowing a fix/change shipped; (2) "everyone on the latest version"
implies this is also a coordination concern (a family debugging "why does my screen
look different from yours") which autoUpdate's silence doesn't address.

**Mechanism**: `vite-plugin-pwa` exposes exactly this via `virtual:pwa-register/react`
(a `useRegisterSW()` hook) or the framework-agnostic `virtual:pwa-register`, giving a
`needRefresh` signal and an `updateServiceWorker()` function — no hand-rolled service
worker or polling needed, just switching `registerType` to `'prompt'` and wiring the
hook to a small notification/banner component. Precedent for a notification-shaped UI
already exists (`apps/web/src/api/hooks.ts`'s `useNotifications`), though this is a
client-build-version signal, not a server-side `Notification` row, so it's a separate,
purely client-side mechanism — no backend/API/database change is in scope here.

## Acceptance Criteria

- `registerType` changes from `'autoUpdate'` to `'prompt'` in `vite.config.ts`,
  with a comment updated to reflect the new decision and reasoning (superseding the
  PWA campaign's original comment, not silently contradicting it).
- When a new deploy's service worker is detected, a visible in-app notification
  appears (banner/toast, German copy matching `apps/web/src/strings/de.ts`'s
  existing tone) telling the member an update is available.
- Accepting the notification calls `updateServiceWorker()` and reloads to the new
  version; the new build's precached assets and Workbox `cleanupOutdatedCaches`
  behavior (already configured) mean the refreshed tab is fully on the new version,
  not a mix of old/new chunks.
- Decide and document (in code comment or PR description) whether acceptance is
  required (member must click) or the prompt auto-accepts after a grace period —
  either is acceptable, but the choice must be deliberate, not accidental default
  behavior.
- No `/api/*` request pattern changes — this stays purely in the existing
  service-worker/build-version mechanism `vite-plugin-pwa` already provides; no new
  backend endpoint, no new polling loop.
- Existing PWA behavior (offline app-shell launch, `/api/*` staying network-only)
  is unaffected — verify by re-running whatever manual/E2E check the PWA campaign
  used originally, if one exists.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |   complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat | resolved | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run test (144+305+121 tests, all pass) | resolved | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-03T13:46:38.722Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-03: Implemented Phase 2. Switched `registerType` to `'prompt'` in
  `apps/web/vite.config.ts`, added `UpdatePrompt` component (mirrors the
  existing `InstallPrompt` pattern: manual click required, no auto-accept —
  a deliberate choice per acceptance criteria) wired into `App.tsx`, added
  `de.update.*` strings, `virtual:pwa-register/react` type reference in
  `env.d.ts`, and a vitest alias + stub (`src/test/mocks/pwaRegister.ts`)
  since that virtual module only exists under the real Vite plugin.
- 2026-09-03: Phase 3 verification. `npm run typecheck` and `npm run lint`
  clean; `npm run test` green across all workspaces (shared 144, api 305,
  web 121 incl. 3 new UpdatePrompt tests); `npm run build -w apps/web`
  confirmed the `prompt` registerType still emits a valid service worker
  (workbox-window now bundled, as expected only in prompt mode).

## Active Context

Delivery preflight complete. Next action: implement Phase 2 using the claimed scope, acceptance criteria, map context, and evidence contract.

## Continuation State

Phase: 2
Sub-step: implementation not started
Files modified: campaign scaffold only
Blocking: none

## Completion Record

- Completed At: 2026-09-03T13:55:09.345Z
- Outcome: review-package
- Verification: npm run typecheck, npm run lint, npm run test (all workspaces green: shared 144, api 305, web 121)

- 2026-09-03: Delivered as PR #53: https://github.com/brandstaetter/haushaltsauktion/pull/53 (branch feat/notify-deploy-and-todoist-docs, bundled with the other pending intake item).
