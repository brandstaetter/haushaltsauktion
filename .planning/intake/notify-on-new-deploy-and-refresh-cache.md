---
title: "Notify members when a new deploy is live and let them refresh to it"
status: completed
priority: normal
target: apps/web/vite.config.ts, apps/web/src/main.tsx, apps/web/src/App.tsx (or a new UpdatePrompt component), apps/web/src/strings/de.ts
campaign: notify-members-when-a-new-deploy-is-live-and-let-them-refresh-to-it
---

## Description

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
