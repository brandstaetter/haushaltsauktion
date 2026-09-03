import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useOperatorLogin, useOperatorSession } from '../../api/operatorHooks';
import { Button } from '../../components/Button/Button';
import styles from './OperatorDashboardPage.module.css';

/**
 * Standalone login, deliberately outside the member-facing app shell
 * (Architektur `.planning/architecture-operator-dashboard.md`) — posts to
 * `/api/operator/login`, not `/api/auth/login`.
 */
export function OperatorLoginPage() {
  const navigate = useNavigate();
  const { operator } = useOperatorSession();
  const login = useOperatorLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (operator) {
      navigate('/betrieb', { replace: true });
    }
  }, [operator, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      navigate('/betrieb', { replace: true });
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 429 ? 'Zu viele Versuche. Bitte kurz warten.' : 'E-Mail oder Passwort ist falsch.');
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Betriebsdashboard</h1>
      <h2 className={styles.subtitle}>Operator-Anmeldung</h2>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>E-Mail</span>
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" loading={login.isPending} fullWidth>
          {login.isPending ? 'Anmeldung läuft…' : 'Anmelden'}
        </Button>
      </form>
    </div>
  );
}
