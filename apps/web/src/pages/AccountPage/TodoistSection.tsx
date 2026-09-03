/**
 * The member's own Todoist connection (Architektur Todoist §10).
 *
 * This lives on the member's **own** account page, never on the admin screen.
 * A personal Todoist token grants full access to that person's account, so an
 * admin must not be able to enter, view, or replace another adult's credential
 * (§36). The household-level on/off switch is the admin's business; the
 * credential is not.
 *
 * §31 governs the copy: the two consequences a member cannot discover for
 * themselves — that the token is unscoped, and that ticking a task off in
 * Todoist does *not* complete it here — are stated **before** the input, not
 * after it and not in a tooltip.
 */

import { useEffect, useState } from 'react';

import {
  useConnectTodoist,
  useDisconnectTodoist,
  useTestTodoist,
  useTodoistIntegration,
  useTodoistProjects,
  useUpdateTodoist,
} from '../../api/hooks';
import { Button } from '../../components/Button/Button';
import { useStrings } from '../../context/StringsContext';
import styles from './AccountPage.module.css';

export function TodoistSection({ enabled }: { enabled: boolean }) {
  const { de } = useStrings();
  const t = de.todoist;

  const { data, isLoading } = useTodoistIntegration(enabled);
  const connect = useConnectTodoist();
  const update = useUpdateTodoist();
  const disconnect = useDisconnectTodoist();
  const test = useTestTodoist();

  const connected = data?.connected === true;
  const projects = useTodoistProjects(enabled && connected);

  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Clear the field as soon as the connection succeeds: there is no reason for
  // a live credential to sit in component state a moment longer than needed.
  useEffect(() => {
    if (connected) setToken('');
  }, [connected]);

  // The household switch is off — the member has nothing to decide here.
  if (!enabled) return null;
  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;

  const failed = (error: unknown): string =>
    (error as { message?: string }).message ?? t.saveFailed;

  const handleConnect = (): void => {
    setMessage(null);
    connect.mutate(
      { token: token.trim() },
      {
        onSuccess: () => {
          setToken('');
          setMessage(null);
        },
        onError: (error) => setMessage(failed(error)),
      },
    );
  };

  const handleDisconnect = (): void => {
    if (!window.confirm(t.disconnectConfirm)) return;
    setMessage(null);
    disconnect.mutate(undefined, { onError: (error) => setMessage(failed(error)) });
  };

  const handleTest = (): void => {
    setMessage(null);
    test.mutate(undefined, {
      onSuccess: () => setMessage(t.testOk),
      onError: (error) => setMessage(failed(error)),
    });
  };

  const setTrigger = (key: 'VOLUNTARY' | 'RANDOM', value: boolean): void => {
    if (data === undefined) return;
    update.mutate(
      { triggers: { ...data.triggers, [key]: value } },
      { onError: (error) => setMessage(failed(error)) },
    );
  };

  return (
    <section className={styles.card}>
      <h2 className={styles.name}>{t.title}</h2>

      {/* Stated once, unconditionally, and before anything actionable. */}
      <p className={styles.email}>{t.intro}</p>
      <p className={styles.email}>
        <strong>{t.oneWayWarning}</strong>
      </p>

      {data?.status === 'INVALID_CREDENTIALS' && (
        <p role="alert" className={styles.email}>
          <strong>{t.invalidCredentials}</strong>
        </p>
      )}

      {!connected && (
        <>
          <p className={styles.email}>{t.tokenScopeWarning}</p>
          <label className={styles.household} htmlFor="todoist-token">
            {t.tokenLabel}
          </label>
          <input
            id="todoist-token"
            // `password`, so the value is not shoulder-surfable and browsers
            // do not offer to autofill it into some other field later.
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="••••••••"
          />
          <p className={styles.email}>{t.tokenHelp}</p>
          <div className={styles.actions}>
            <Button onClick={handleConnect} disabled={token.trim().length < 8 || connect.isPending} fullWidth>
              {connect.isPending ? t.connecting : t.connect}
            </Button>
          </div>
        </>
      )}

      {connected && data !== undefined && (
        <>
          <p className={styles.household}>
            {t.connected} · …{data.tokenHint}
          </p>

          <label className={styles.household} htmlFor="todoist-project">
            {t.project}
          </label>
          <select
            id="todoist-project"
            value={data.projectId ?? ''}
            onChange={(event) =>
              update.mutate(
                { projectId: event.target.value === '' ? null : event.target.value },
                { onError: (error) => setMessage(failed(error)) },
              )
            }
          >
            <option value="">{t.projectInbox}</option>
            {(projects.data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className={styles.email}>{t.projectHint}</p>

          <fieldset>
            <legend className={styles.household}>{t.triggers}</legend>
            <label>
              <input
                type="checkbox"
                checked={data.triggers.RANDOM}
                onChange={(event) => setTrigger('RANDOM', event.target.checked)}
              />
              {t.triggerRandom}
            </label>
            <label>
              <input
                type="checkbox"
                checked={data.triggers.VOLUNTARY}
                onChange={(event) => setTrigger('VOLUNTARY', event.target.checked)}
              />
              {t.triggerVoluntary}
            </label>
          </fieldset>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={handleTest} disabled={test.isPending} fullWidth>
              {test.isPending ? t.testing : t.test}
            </Button>
            <Button variant="secondary" onClick={handleDisconnect} disabled={disconnect.isPending} fullWidth>
              {t.disconnect}
            </Button>
          </div>
        </>
      )}

      {message !== null && (
        <p role="status" className={styles.email}>
          {message}
        </p>
      )}
    </section>
  );
}
