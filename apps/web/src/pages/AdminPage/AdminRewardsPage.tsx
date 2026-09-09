import { useStrings } from '../../context/StringsContext';
import { RewardsSection } from './RewardsSection';
import { RewardRedemptionsSection } from './RewardRedemptionsSection';
import styles from './AdminPage.module.css';

export function AdminRewardsPage() {
  const { de } = useStrings();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminRewards}</h1>

      <RewardRedemptionsSection />
      <RewardsSection />
    </div>
  );
}
