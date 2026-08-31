/**
 * PWA install affordance (CLAUDE.md §30 "PWA-fähig").
 *
 * `beforeinstallprompt` only fires on Chromium-based browsers that judge the
 * page installable (valid manifest, registered service worker, served over
 * HTTPS or localhost) — Safari/iOS never fires it, so this component simply
 * renders nothing there. No fallback UI is added for those browsers; iOS's
 * own "Add to Home Screen" share-sheet flow is the platform's own affordance,
 * not something a page can trigger.
 *
 * A dismissal is remembered in localStorage so the banner never nags a
 * visitor who already said no — matching §31's "no manipulative dark
 * patterns."
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../Button/Button';
import styles from './InstallPrompt.module.css';

const DISMISS_KEY = 'hh-install-prompt-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    // Private mode / storage disabled — never block the banner over it.
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, 'true');
  } catch {
    // Worst case: the banner may reappear next visit. Not worth failing over.
  }
}

export function InstallPrompt() {
  const { de } = useStrings();
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (readDismissed()) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferredEvent(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferredEvent) return null;

  const dismiss = () => {
    setDeferredEvent(null);
    writeDismissed();
  };

  const install = async () => {
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    // Accepted or dismissed, the native prompt cannot be reused either way.
    setDeferredEvent(null);
  };

  return (
    <div className={styles.banner} role="note">
      <span className={styles.text}>{de.install.prompt}</span>
      <div className={styles.actions}>
        <Button size="md" onClick={() => void install()}>
          {de.install.action}
        </Button>
        <button
          type="button"
          className={styles.dismiss}
          onClick={dismiss}
          aria-label={de.install.dismiss}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
