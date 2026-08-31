import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAvailableTasks, useAssignedTasks } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { TaskCard } from '../../components/TaskCard/TaskCard';
import { Button } from '../../components/Button/Button';
import styles from './TaskListPage.module.css';

type Tab = 'all' | 'mine';

export function TaskListPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const available = useAvailableTasks();
  const assigned = useAssignedTasks();

  const isLoading = tab === 'all' ? available.isLoading : assigned.isLoading;
  const isError = tab === 'all' ? available.isError : assigned.isError;
  const items = tab === 'all' ? available.data?.items : assigned.data?.items;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.tasks}</h1>
      <div className={styles.tabs} role="tablist" aria-label="Aufgaben filtern">
        <button
          className={styles.tab}
          role="tab"
          aria-selected={tab === 'all'}
          onClick={() => setTab('all')}
        >
          {de.dashboard.available}
        </button>
        <button
          className={styles.tab}
          role="tab"
          aria-selected={tab === 'mine'}
          onClick={() => setTab('mine')}
        >
          {de.dashboard.myTasks}
        </button>
      </div>

      {isLoading && <div className={styles.spinner} aria-label="Wird geladen" />}
      {isError && (
        <div className={styles.center}>
          <p>{de.error.loadFailed}</p>
          <Button onClick={() => (tab === 'all' ? available.refetch() : assigned.refetch())}>
            {de.action.retry}
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className={styles.stack} role="tabpanel">
          {items?.length === 0 ? (
            <p className={styles.empty}>
              {tab === 'all' ? de.task.noTasks : de.task.noAssigned}
            </p>
          ) : (
            items?.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onAction={() => navigate(`/aufgaben/${task.id}`)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
