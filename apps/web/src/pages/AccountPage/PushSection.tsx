/**
 * Web Push opt-in (push-notifications §Architekturvorschlag, Phase 2).
 *
 * Same structure as `TodoistSection` on purpose: a member-owned setting under
 * „Ich", gated by the household's public-config switch, with every
 * consequence stated **before** the action (§31) — here, that a push
 * subscription is per-device, and that iOS requires the app to already be
 * installed to the Home Screen (Safari does not support Push in a plain
 * browser tab).
 */

import {
  usePushSubscriptionStatus,
  useSubscribeToPush,
  useUnsubscribeFromPush,
} from '../../api/hooks';
import { Button } from '../../components/Button/Button';
import { useStrings } from '../../context/StringsContext';
import styles from './AccountPage.module.css';

function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function PushSection({ enabled }: { enabled: boolean }) {
  const { de } = useStrings();
  const t = de.push;

  const status = usePushSubscriptionStatus();
  const subscribe = useSubscribeToPush();
  const unsubscribe = useUnsubscribeFromPush();

  // The household switch is off — the member has nothing to decide here.
  if (!enabled) return null;
  if (status.isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;

  const permission = currentPermission();
  const subscribed = status.data?.subscribed === true;

  const failed = (error: unknown): string =>
    (error as { message?: string }).message ?? t.saveFailed;

  return (
    <section className={styles.card}>
      <h2 className={styles.name}>{t.title}</h2>

      {/* §31: stated once, unconditionally, before anything actionable. */}
      <p className={styles.email}>{t.intro}</p>
      <p className={styles.email}>{t.iosNote}</p>

      {permission === 'unsupported' && <p className={styles.household}>{t.unsupported}</p>}

      {/* A browser/OS-level block is not repeatedly re-prompted — the member
          must go change it in their own settings, which we tell them rather
          than showing a button that would just silently fail again. */}
      {permission === 'denied' && (
        <p role="alert" className={styles.household}>
          {t.permissionDenied}
        </p>
      )}

      {permission !== 'unsupported' && permission !== 'denied' && (
        <div className={styles.actions}>
          {subscribed ? (
            <>
              <p className={styles.household}>{t.subscribed}</p>
              <Button
                variant="secondary"
                onClick={() => unsubscribe.mutate()}
                disabled={unsubscribe.isPending}
                fullWidth
              >
                {unsubscribe.isPending ? t.unsubscribing : t.unsubscribe}
              </Button>
            </>
          ) : (
            <Button onClick={() => subscribe.mutate()} disabled={subscribe.isPending} fullWidth>
              {subscribe.isPending ? t.subscribing : t.subscribe}
            </Button>
          )}
        </div>
      )}

      {subscribe.isError && (
        <p role="alert" className={styles.email}>
          {failed(subscribe.error)}
        </p>
      )}
      {unsubscribe.isError && (
        <p role="alert" className={styles.email}>
          {failed(unsubscribe.error)}
        </p>
      )}
    </section>
  );
}
