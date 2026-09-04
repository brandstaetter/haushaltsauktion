import { useNavigate } from 'react-router';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { AuditLogSection } from './AuditLogSection';
import styles from './AdminPage.module.css';

export function AdminAuditLogPage() {
  const { de } = useStrings();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminAuditLog}</h1>

      <AuditLogSection />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate('/ich')}>
          {de.action.back}
        </Button>
      </div>
    </div>
  );
}
