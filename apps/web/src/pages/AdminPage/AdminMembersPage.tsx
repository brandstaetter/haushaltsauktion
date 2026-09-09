import { useStrings } from '../../context/StringsContext';
import { MembersSection } from './MembersSection';
import styles from './AdminPage.module.css';

export function AdminMembersPage() {
  const { de } = useStrings();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminMembers}</h1>

      <MembersSection />
    </div>
  );
}
