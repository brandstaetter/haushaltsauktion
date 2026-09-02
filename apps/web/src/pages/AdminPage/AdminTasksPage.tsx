import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useRunSweep } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { Toast } from '../../components/Toast/Toast';
import { TaskDefinitionsSection } from './TaskDefinitionsSection';
import styles from './AdminPage.module.css';

export function AdminTasksPage() {
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
      <h1 className={styles.title}>{de.nav.adminTasks}</h1>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <TaskDefinitionsSection />

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
