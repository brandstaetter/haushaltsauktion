/**
 * New-deploy notice (intake "notify-on-new-deploy-and-refresh-cache").
 *
 * `vite.config.ts` registers the service worker with `registerType: 'prompt'`
 * instead of `'autoUpdate'`: a long-lived open tab (the app polls
 * `/dashboard`/`/notifications` every 30s, see `apps/web/src/api/hooks.ts`)
 * must not silently swap its JS out from under a member mid-session while
 * they're looking at task values or point balances that may have just
 * changed server-side. Acceptance is a deliberate, required click — not an
 * auto-accepting grace period — matching this component's own precedent,
 * `InstallPrompt`, and CLAUDE.md §31's "no manipulative dark patterns."
 *
 * `updateServiceWorker(true)` activates the waiting worker and reloads; the
 * new build's precached assets plus Workbox's `cleanupOutdatedCaches`
 * (already configured) mean the reloaded tab is fully on the new version,
 * never a mix of old/new chunks.
 */

import { useRegisterSW } from 'virtual:pwa-register/react';
import { X } from 'lucide-react';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../Button/Button';
import styles from './UpdatePrompt.module.css';

export function UpdatePrompt() {
  const { de } = useStrings();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  const dismiss = () => setNeedRefresh(false);
  const update = () => void updateServiceWorker(true);

  return (
    <div className={styles.banner} role="note">
      <span className={styles.text}>{de.update.prompt}</span>
      <div className={styles.actions}>
        <Button size="md" onClick={update}>
          {de.update.action}
        </Button>
        <button
          type="button"
          className={styles.dismiss}
          onClick={dismiss}
          aria-label={de.update.dismiss}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
