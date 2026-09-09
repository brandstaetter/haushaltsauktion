import { useStrings } from '../../context/StringsContext';
import { CategoriesSection } from './CategoriesSection';
import styles from './AdminPage.module.css';

export function AdminCategoriesPage() {
  const { de } = useStrings();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.adminCategories}</h1>

      <CategoriesSection />
    </div>
  );
}
