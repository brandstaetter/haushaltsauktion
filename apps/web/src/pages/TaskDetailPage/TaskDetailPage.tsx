import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  useTaskDetail,
  useVolunteer,
  useCompleteTask,
  useReleaseAssignment,
  useBuyout,
  useAcceptAssignment,
  useAssignmentQuote,
  useMemberMe,
} from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { BuyoutDisclosure } from '../../components/BuyoutDisclosure/BuyoutDisclosure';
import { AssignmentExplanation } from '../../components/AssignmentExplanation/AssignmentExplanation';
import { ValueChip } from '../../components/ValueChip/ValueChip';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { formatDate } from '../../utils/format';
import styles from './TaskDetailPage.module.css';

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { de } = useStrings();
  const { data: task, isLoading, isError, refetch } = useTaskDetail(id);
  const volunteer = useVolunteer();
  const complete = useCompleteTask();
  const release = useReleaseAssignment();
  const buyout = useBuyout();
  const accept = useAcceptAssignment();
  const { data: me } = useMemberMe();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const assignmentId = task?.activeAssignment?.id;
  const { data: quote } = useAssignmentQuote(assignmentId);

  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;
  if (isError || !task || !id) {
    return (
      <div className={styles.center}>
        <p>{de.error.loadFailed}</p>
        <Button onClick={() => refetch()}>{de.action.retry}</Button>
      </div>
    );
  }

  const isAssignedToMe = task.activeAssignment?.memberId === me?.id;
  const isPendingDecision =
    task.activeAssignment?.response === 'PENDING' &&
    task.status === 'ASSIGNED';

  async function run<T>(promise: Promise<T>, onSuccess?: () => void) {
    setBusy(true);
    setFeedback(null);
    try {
      await promise;
      setFeedback('OK');
      onSuccess?.();
    } catch (err) {
      setFeedback((err as { message?: string }).message ?? de.error.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        {de.action.back}
      </button>
      <h1 className={styles.title}>{task.title}</h1>
      <StatusBadge status={task.status} />
      {task.description && <p className={styles.description}>{task.description}</p>}

      <div className={styles.row}>
        <ValueChip
          value={task.currentValue}
          baseValue={task.baseValue}
          buyoutCount={task.buyoutCount}
          size="lg"
        />
        <div className={styles.meta}>
          {task.dueAt && (
            <p>
              Fällig: <strong>{formatDate(task.dueAt)}</strong>
            </p>
          )}
          {task.estimatedMinutes && <p>ca. {task.estimatedMinutes} Min</p>}
        </div>
      </div>

      {task.activeAssignment && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Zugewiesen</h2>
          <p className={styles.assignee}>
            {task.activeAssignment.memberId === me?.id
              ? 'Dir'
              : 'Jemandem sonst'}
            {' '}
            zugewiesen
          </p>
          {task.activeAssignment.kind === 'RANDOM' && (
            <AssignmentExplanation assignmentId={task.activeAssignment.id} />
          )}
        </section>
      )}

      {feedback && (
        <div className={styles.feedback} role="status">
          {feedback}
        </div>
      )}

      <div className={styles.actions}>
        {task.status === 'AVAILABLE' && task.canVolunteer && (
          <Button
            onClick={() =>
              run(volunteer.mutateAsync({ id, body: { expectedVersion: task.version } }))
            }
            loading={busy}
          >
            {de.action.volunteer}
          </Button>
        )}

        {isAssignedToMe && task.status === 'ASSIGNED' && !isPendingDecision && (
          <>
            <Button
              onClick={() =>
                run(
                  complete.mutateAsync({
                    id,
                    body: { assignmentId: task.activeAssignment!.id, expectedVersion: task.version },
                  }),
                )
              }
              loading={busy}
            >
              {de.action.complete}
            </Button>
            {quote?.allowed && (
              <Button
                variant="secondary"
                onClick={() =>
                  run(
                    buyout.mutateAsync({
                      assignmentId: task.activeAssignment!.id,
                      body: {
                        acceptedCost: quote.cost,
                        acceptedNewValue: quote.taskValueAfter,
                      },
                    }),
                  )
                }
                loading={busy}
              >
                {de.action.buyout.replace('{cost}', String(quote.cost))}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() =>
                run(
                  release.mutateAsync({
                    instanceId: id,
                    assignmentId: task.activeAssignment!.id,
                  }),
                )
              }
              loading={busy}
            >
              {de.action.release}
            </Button>
          </>
        )}

        {isPendingDecision && isAssignedToMe && (
          <>
            {/* §31/§32: this is the "Du wurdest ausgewählt" decision screen —
                the one place §31 explicitly forbids nudging one option over
                the other. Both branches share `variant="secondary"` so
                neither reads as the recommended default. */}
            <Button
              variant="secondary"
              onClick={() => run(accept.mutateAsync(task.activeAssignment!.id))}
              loading={busy}
            >
              {de.action.accept}
            </Button>
            {quote?.allowed && (
              <Button
                variant="secondary"
                onClick={() =>
                  run(
                    buyout.mutateAsync({
                      assignmentId: task.activeAssignment!.id,
                      body: {
                        acceptedCost: quote.cost,
                        acceptedNewValue: quote.taskValueAfter,
                      },
                    }),
                  )
                }
                loading={busy}
              >
                {de.action.buyout.replace('{cost}', String(quote.cost))}
              </Button>
            )}
          </>
        )}
      </div>

      {quote && <BuyoutDisclosure quote={quote} />}
    </div>
  );
}
