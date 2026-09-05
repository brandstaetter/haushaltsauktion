/**
 * Custom service worker (push-notifications §Architekturvorschlag,
 * "Service-Worker-Strategiewechsel"). Replaces `vite-plugin-pwa`'s implicit
 * `generateSW` mode — needed because `generateSW` cannot register custom
 * `push`/`notificationclick` listeners.
 *
 * `precacheAndRoute` + the `NavigationRoute` below reproduce `generateSW`'s
 * previous behaviour 1:1 (see `vite.config.ts`'s `VitePWA({ strategies:
 * 'injectManifest', … })` call): precache the built app shell, and serve
 * `index.html` for any navigation that is not `/api/*`, exactly what the old
 * `navigateFallbackDenylist: [/^\/api\//]` did. `VersionMismatchOverlay`
 * depends on that fallback existing (it unregisters this worker and clears
 * caches itself when a version mismatch fires, so it does not depend on any
 * particular update timing here — only on navigation still working normally
 * until that moment).
 *
 * Deliberately **not** `self.skipWaiting()`/`clients.claim()` on install —
 * `registerType: 'prompt'` (unchanged) means `VersionMismatchOverlay` is the
 * only thing that ever tells a waiting worker to skip waiting
 * (`updateServiceWorker(true)`), right before its own forced reload. Adding
 * an unconditional skip-waiting here would let a new worker activate under a
 * still-open tab whenever it wants, which is exactly what `registerType:
 * 'prompt'` was chosen to avoid.
 *
 * Excluded from `tsconfig.json`'s program (see that file's `exclude`): the
 * `webworker` lib this file needs is incompatible with the `DOM` lib the rest
 * of the app uses in the same TS program. `apps/web/tsconfig.sw.json` is a
 * separate, editor-only program for this one file; Vite/esbuild bundles it
 * for real without a full type-check, same as it does for every other file.
 */
/// <reference lib="webworker" />

import { precacheAndRoute, createHandlerBoundToURL, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

precacheAndRoute(self.__WB_MANIFEST);

// Equivalent to `generateSW`'s `navigateFallbackDenylist: [/^\/api\//]`: every
// non-API navigation gets the precached app shell, so client-side routing and
// deep links keep working offline / on a flaky connection.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
);

// ───────────────────────── Web Push ─────────────────────────
// push-notifications §Architekturvorschlag, Phase 2. Payload shape sent by
// `apps/api/src/app/notifications/pushNotifier.ts`'s `deliverToMember`.

interface PushWirePayload {
  type: string;
  taskInstanceId: string | null;
  taskTitle: string | null;
  payload: Record<string, unknown>;
}

/**
 * Minimal, static duplicate of `apps/web/src/strings/de.ts`'s
 * `notifications.types` — only the types this phase actually pushes
 * (`pushNotifier.ts`'s `PUSH_ENABLED_NOTIFICATION_TYPES`). A service worker
 * cannot import the app's `StringsContext` (there is no React tree here), and
 * this is the standard shape of that limitation: a small, self-contained
 * string table instead of a runtime dependency. Keep this in sync with
 * `de.ts` if any of these lines ever changes there.
 */
const PUSH_MESSAGE_TEMPLATES: Record<string, string> = {
  TASK_AVAILABLE: '„{task}“ ist jetzt freiwillig verfügbar — aktueller Wert {value}',
  TASK_ASSIGNED: 'Dir wurde „{task}“ zufällig zugewiesen — aktueller Wert {value}',
  TASK_TAKEN: 'Du hast „{task}“ übernommen — aktueller Wert {value}',
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function renderPushMessage(data: PushWirePayload): { title: string; body: string } {
  const template = PUSH_MESSAGE_TEMPLATES[data.type];
  const task = data.taskTitle ?? '';
  if (template === undefined) {
    return { title: 'Haushaltsauktion', body: task };
  }
  const value = typeof data.payload['value'] === 'number' ? String(data.payload['value']) : '';
  return { title: 'Haushaltsauktion', body: interpolate(template, { task, value }) };
}

self.addEventListener('push', (event: PushEvent) => {
  let data: PushWirePayload | null = null;
  try {
    data = (event.data?.json() ?? null) as PushWirePayload | null;
  } catch {
    data = null;
  }
  if (data === null) return;

  const { title, body } = renderPushMessage(data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: data.taskInstanceId ?? data.type,
      data,
      icon: '/icons/icon-192.png',
    }),
  );
});

// Focuses an already-open tab if one exists, otherwise opens a new one —
// research doc's requirement for `notificationclick`.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const existing = list.find((client) => 'focus' in client);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
