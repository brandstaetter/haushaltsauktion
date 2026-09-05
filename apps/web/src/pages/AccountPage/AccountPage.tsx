import { useNavigate } from 'react-router';
import { useLogout, useMemberMe, usePublicConfig, useSession } from '../../api/hooks';
import { PushSection } from './PushSection';
import { TodoistSection } from './TodoistSection';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { formatNumber } from '../../utils/format';
import styles from './AccountPage.module.css';

export function AccountPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: me, isLoading } = useMemberMe();
  const { data: publicConfig } = usePublicConfig();
  const logout = useLogout();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.account.title}</h1>
      {isLoading && <div className={styles.spinner} aria-label="Wird geladen" />}
      {!isLoading && me && (
        <section className={styles.card}>
          <h2 className={styles.name}>{me.displayName}</h2>
          <p className={styles.email}>{session?.user?.email}</p>
          <div className={styles.balance}>
            <span className={styles.balanceLabel}>{de.account.balance}</span>
            <span className={styles.balanceValue}>{formatNumber(me.balance)}</span>
          </div>
          {session?.household && (
            <p className={styles.household}>
              {de.account.household}: {session.household.name}
            </p>
          )}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => navigate('/punktekonto')}
              fullWidth
            >
              {de.account.ledger}
            </Button>
            {publicConfig?.values.rewards.enabled === true && (
              <Button
                variant="secondary"
                onClick={() => navigate('/punkte-shop')}
                fullWidth
              >
                {de.account.rewardsShop}
              </Button>
            )}
            {session?.role === 'ADMIN' && (
              <Button
                variant="secondary"
                onClick={() => navigate('/verwaltung/einstellungen')}
                fullWidth
              >
                {de.account.adminEntry}
              </Button>
            )}
          </div>
        </section>
      )}
      {/* Rendered only when the household has the integration switched on —
          the flag comes from the public config projection, so a household that
          never enabled it sees nothing at all. */}
      <TodoistSection enabled={publicConfig?.values.integrations.todoist.enabled === true} />
      {/* Same gating pattern — rendered only when the household has Web Push
          switched on (`notifications.pushEnabled`). */}
      <PushSection enabled={publicConfig?.values.notifications.pushEnabled === true} />
      <Button
        variant="ghost"
        onClick={() => logout.mutate()}
        loading={logout.isPending}
        fullWidth
      >
        {de.account.logout}
      </Button>
    </div>
  );
}
