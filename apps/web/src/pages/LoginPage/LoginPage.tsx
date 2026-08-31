import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLogin, useSession } from '../../api/hooks';
import { Button } from '../../components/Button/Button';
import { useStrings } from '../../context/StringsContext';
import styles from './LoginPage.module.css';

const DEMO_USERS = [
  { email: 'elke@demo.local', name: 'Elke' },
  { email: 'arthur@demo.local', name: 'Arthur' },
  { email: 'luise@demo.local', name: 'Luise' },
  { email: 'hannes@demo.local', name: 'Hannes' },
];

export function LoginPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = useSession();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.member) {
      navigate(params.get('next') || '/', { replace: true });
    }
  }, [session, navigate, params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      navigate(params.get('next') || '/', { replace: true });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429) {
        setError(de.login.rateLimited);
      } else {
        setError(de.login.error);
      }
    }
  };

  const showDemo = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === 'true';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.appName}</h1>
      <h2 className={styles.subtitle}>{de.login.subtitle}</h2>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{de.login.email}</span>
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
          <span className={styles.label}>{de.login.password}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" loading={login.isPending} fullWidth>
          {login.isPending ? de.login.submitting : de.login.submit}
        </Button>
      </form>
      <p className={styles.forgot}>{de.login.forgotPassword}</p>
      <p className={styles.forgot}>
        <Link to="/registrieren">{de.login.registerPrompt}</Link>
      </p>

      {showDemo && (
        <div className={styles.demo}>
          <p className={styles.demoLabel}>nur in der Demo</p>
          <div className={styles.demoRow}>
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                className={styles.demoButton}
                onClick={() => {
                  setEmail(u.email);
                  setPassword('demo1234');
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
