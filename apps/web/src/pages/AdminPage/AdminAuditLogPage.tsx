import { useStrings } from '../../context/StringsContext';
import { AuditLogSection } from './AuditLogSection';
import styles from './AdminPage.module.css';

export function AdminAuditLogPage() {
  const { de } = useStrings();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminAuditLog}</h1>

      <AuditLogSection />
    </div>
  );
}
