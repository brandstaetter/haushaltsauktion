import { useNavigate } from 'react-router';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { CategoriesSection } from './CategoriesSection';
import styles from './AdminPage.module.css';

export function AdminCategoriesPage() {
  const { de } = useStrings();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminCategories}</h1>

      <CategoriesSection />

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate('/ich')}>
          {de.action.back}
        </Button>
      </div>
    </div>
  );
}
