import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRegisterHousehold, useSession } from '../../api/hooks';
import { Button } from '../../components/Button/Button';
import { useStrings } from '../../context/StringsContext';
import styles from './RegisterPage.module.css';

export function RegisterPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const registerHousehold = useRegisterHousehold();

  const [setupToken, setSetupToken] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.member) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await registerHousehold.mutateAsync({
        setupToken,
        householdName,
        adminEmail,
        adminDisplayName,
        adminPassword,
      });
      navigate('/', { replace: true });
    } catch (err) {
      const apiErr = err as { status?: number; code?: string };
      if (apiErr.status === 404) {
        setError(de.register.errors.unavailable);
      } else if (apiErr.status === 403) {
        setError(de.register.errors.forbidden);
      } else if (apiErr.status === 409 && apiErr.code === 'EMAIL_ALREADY_REGISTERED') {
        setError(de.register.errors.emailTaken);
      } else if (apiErr.status === 429) {
        setError(de.register.errors.rateLimited);
      } else {
        setError(de.register.errors.generic);
      }
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.appName}</h1>
      <h2 className={styles.subtitle}>{de.register.title}</h2>
      <p className={styles.description}>{de.register.subtitle}</p>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{de.register.setupToken}</span>
          <input
            type="password"
            autoComplete="off"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{de.register.householdName}</span>
          <input
            type="text"
            autoComplete="off"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{de.register.adminDisplayName}</span>
          <input
            type="text"
            autoComplete="name"
            value={adminDisplayName}
            onChange={(e) => setAdminDisplayName(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{de.register.adminEmail}</span>
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{de.register.adminPassword}</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
          />
        </label>
        <Button type="submit" loading={registerHousehold.isPending} fullWidth>
          {registerHousehold.isPending ? de.register.submitting : de.register.submit}
        </Button>
      </form>
      <p className={styles.backLink}>
        <Link to="/login">{de.register.backToLogin}</Link>
      </p>
    </div>
  );
}
