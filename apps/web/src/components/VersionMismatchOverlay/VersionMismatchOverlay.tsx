/**
 * Bugfix "reliable-update-check-forced-reload-overlay" — replaces the old
 * dismissible `UpdatePrompt` banner. `checkVersionHeader()`
 * (`apps/web/src/api/versionCheck.ts`) fires on every backend response via
 * the shared `api()`/`operatorApi()` funnels, so this reacts within one
 * request-response cycle of a redeploy instead of waiting on the service
 * worker's own update lifecycle — which only checks for a new worker on
 * navigation, the exact unreliability this replaces.
 *
 * Deliberately not dismissible: no Escape key, no outside click, no close
 * button. §36's "server-side-only business logic" means a stale client is a
 * coordination/UX problem, not a correctness one, but the request was
 * explicit — immediate, unavoidable, no choice to make.
 *
 * Still tries `updateServiceWorker(true)` first (best-effort, bounded): if a
 * new service worker happened to already be waiting, this lets it activate
 * before the reload lands, so the reloaded tab gets fully-fresh precached
 * assets instead of needing a second reload. The reload itself never
 * depends on that succeeding — under `registerType: 'prompt'`,
 * `updateServiceWorker()` only sends a skip-waiting message and does not
 * reload the page on its own when nothing was waiting yet (vite-plugin-pwa's
 * `client/build/register.js`), so relying on it alone would silently do
 * nothing in the exact case this overlay exists for.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useStrings } from '../../context/StringsContext';
import { onVersionMismatch } from '../../api/versionCheck';
import styles from './VersionMismatchOverlay.module.css';

const SKIP_WAITING_GRACE_MS = 300;

export function VersionMismatchOverlay() {
  const { de } = useStrings();
  const { updateServiceWorker } = useRegisterSW();
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    // `onVersionMismatch` returns the unsubscribe function — returning it
    // directly (not just calling it) is what makes this the effect's
    // cleanup, so the listener is removed on unmount.
    const unsubscribe = onVersionMismatch(() => setMismatch(true));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!mismatch) return;
    let cancelled = false;
    // `updateServiceWorker` is only a real Promise-returning function in a
    // built/registered service worker (vite-plugin-pwa's production
    // register.js); its dev-mode stub (client/dev/react.js, used whenever
    // no service worker is actually registered) returns `undefined`
    // synchronously — wrapping in `Promise.resolve` normalizes both so this
    // never throws on the un-awaited return value.
    void Promise.resolve(updateServiceWorker(true)).catch(() => {});
    const timer = setTimeout(() => {
      if (!cancelled) window.location.reload();
    }, SKIP_WAITING_GRACE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mismatch, updateServiceWorker]);

  if (!mismatch) return null;

  return (
    <Dialog.Root open modal onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby="version-mismatch-message"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.title}>{de.update.overlayTitle}</Dialog.Title>
          <p id="version-mismatch-message" className={styles.message}>
            {de.update.overlayMessage}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
