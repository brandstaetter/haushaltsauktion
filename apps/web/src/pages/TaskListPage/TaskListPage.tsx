import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { AvailableTaskDto, HouseholdTaskDto } from '@haushaltsauktion/shared';
import { useAvailableTasks, useAssignedTasks, useAllHouseholdTasks } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { TaskCard } from '../../components/TaskCard/TaskCard';
import { Button } from '../../components/Button/Button';
import styles from './TaskListPage.module.css';

/**
 * `'available'` is what this tab used to be internally called `'all'` even
 * though it only ever showed `AVAILABLE` tasks — renamed here for clarity.
 * Its visible label/behavior (`de.dashboard.available`) is unchanged.
 * `'household'` is the new tab: every open task in the household, not just
 * the viewer's own (§20 extended, `GET /tasks/all`).
 */
type Tab = 'available' | 'mine' | 'household';

export function TaskListPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('available');
  const available = useAvailableTasks();
  const assigned = useAssignedTasks();
  const household = useAllHouseholdTasks();

  const active = tab === 'available' ? available : tab === 'mine' ? assigned : household;
  const emptyMessage =
    tab === 'available' ? de.task.noTasks : tab === 'mine' ? de.task.noAssigned : de.task.noHouseholdTasks;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.nav.tasks}</h1>
      <div className={styles.tabs} role="tablist" aria-label="Aufgaben filtern">
        <button
          className={styles.tab}
          role="tab"
          aria-selected={tab === 'available'}
          onClick={() => setTab('available')}
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
        <button
          className={styles.tab}
          role="tab"
          aria-selected={tab === 'household'}
          onClick={() => setTab('household')}
        >
          {de.task.allHouseholdTasksTab}
        </button>
      </div>

      {active.isLoading && <div className={styles.spinner} aria-label="Wird geladen" />}
      {active.isError && (
        <div className={styles.center}>
          <p>{de.error.loadFailed}</p>
          <Button onClick={() => active.refetch()}>{de.action.retry}</Button>
        </div>
      )}

      {!active.isLoading && !active.isError && (
        <div className={styles.stack} role="tabpanel">
          {tab === 'household'
            ? renderHouseholdItems(household.data?.items, emptyMessage, styles.empty)
            : renderOwnItems(
                tab === 'available' ? available.data?.items : assigned.data?.items,
                emptyMessage,
                styles.empty,
                (task) => navigate(`/aufgaben/${task.id}`),
              )}
        </div>
      )}
    </div>
  );
}

/** The two viewer-scoped tabs: an actionable card that routes to the detail page. */
function renderOwnItems(
  items: AvailableTaskDto[] | undefined,
  emptyMessage: string,
  emptyClassName: string,
  goToDetail: (task: AvailableTaskDto) => void,
) {
  if (!items || items.length === 0) return <p className={emptyClassName}>{emptyMessage}</p>;
  return items.map((task) => (
    <TaskCard key={task.id} task={task} onAction={() => goToDetail(task)} />
  ));
}

/**
 * The household-wide roster: read-only (no CTA — an `ASSIGNED` card here may
 * belong to someone else, so "Erledigen"/"Freiwillig übernehmen" would be
 * misleading), but names the assignee for `ASSIGNED` rows.
 */
function renderHouseholdItems(
  items: HouseholdTaskDto[] | undefined,
  emptyMessage: string,
  emptyClassName: string,
) {
  if (!items || items.length === 0) return <p className={emptyClassName}>{emptyMessage}</p>;
  return items.map((task) => <TaskCard key={task.id} task={task} assignee={task.assignee} />);
}
