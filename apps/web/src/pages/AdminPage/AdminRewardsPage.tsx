import { useNavigate } from 'react-router';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { RewardsSection } from './RewardsSection';
import { RewardRedemptionsSection } from './RewardRedemptionsSection';
import styles from './AdminPage.module.css';

export function AdminRewardsPage() {
  const { de } = useStrings();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminRewards}</h1>

      <RewardRedemptionsSection />
      <RewardsSection />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate('/ich')}>
          {de.action.back}
        </Button>
      </div>
    </div>
  );
}
