import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useRunSweep } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { MembersSection } from './MembersSection';
import { TaskDefinitionsSection } from './TaskDefinitionsSection';
import { CategoriesSection } from './CategoriesSection';
import styles from './AdminPage.module.css';

export function AdminPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const sweep = useRunSweep();
  const [message, setMessage] = useState<string | null>(null);

  const handleSweep = (dryRun: boolean) => {
    setMessage(null);
    sweep.mutate(
      { dryRun },
      {
        onSuccess: (report) =>
          setMessage(
            de.admin.sweepResult
              .replace('{materialized}', String(report.materialized))
              .replace('{published}', String(report.published))
              .replace('{assigned}', String(report.assigned))
              .replace('{expired}', String(report.expired))
              .replace('{skipped}', String(report.skipped)),
          ),
        onError: (err) => setMessage((err as { message?: string }).message ?? de.error.title),
      },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.admin.title}</h1>

      {message && (
        <div className={styles.message} role="status">
          {message}
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.account.settings}</h2>
        <p className={styles.hint}>{de.admin.settingsEntryHint}</p>
        <Button variant="secondary" onClick={() => navigate('/verwaltung/einstellungen')}>
          {de.admin.settingsEntryButton}
        </Button>
      </section>

      <MembersSection />

      <TaskDefinitionsSection />

      <CategoriesSection />

      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => handleSweep(false)} loading={sweep.isPending}>
          {de.admin.runSweep}
        </Button>
        <Button variant="secondary" onClick={() => handleSweep(true)} loading={sweep.isPending}>
          {de.admin.dryRun}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/ich')}>
          {de.action.back}
        </Button>
      </div>
    </div>
  );
}
