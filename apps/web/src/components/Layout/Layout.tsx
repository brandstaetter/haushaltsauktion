import { useSession } from '../../api/hooks';
import { Nav } from '../Nav/Nav';
import { NotificationBell } from '../NotificationBell/NotificationBell';
import { InstallPrompt } from '../InstallPrompt/InstallPrompt';
import { Outlet } from 'react-router';
import styles from './Layout.module.css';

export function Layout() {
  const { data: session, isLoading } = useSession();

  if (isLoading) {
    return <div className={styles.spinner} aria-label="Wird geladen" />;
  }

  const isAuthenticated = !!session?.member;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <span className={styles.logo}>Haushaltsauktion</span>
        <div className={styles.headerRight}>
          {session?.household && (
            <span className={styles.household}>{session.household.name}</span>
          )}
          {isAuthenticated && <NotificationBell />}
        </div>
      </header>
      {isAuthenticated && <InstallPrompt />}
      <main className={styles.main}>
        <Outlet />
      </main>
      {isAuthenticated && (
        <div className={styles.nav}>
          <Nav role={session.role} />
        </div>
      )}
    </div>
  );
}
