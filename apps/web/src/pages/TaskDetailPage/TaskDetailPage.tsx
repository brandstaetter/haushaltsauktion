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
  useRevokeAssignment,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { BuyoutDisclosure } from '../../components/BuyoutDisclosure/BuyoutDisclosure';
import { AssignmentExplanation } from '../../components/AssignmentExplanation/AssignmentExplanation';
import { ValueChip } from '../../components/ValueChip/ValueChip';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { formatDate, interpolate } from '../../utils/format';
import styles from './TaskDetailPage.module.css';

function unassignErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'ASSIGNMENT_CLOSED') return de.task.adminUnassign.errors.alreadyHandled;
  if (err instanceof ApiError && err.message) return err.message;
  return de.task.adminUnassign.errors.generic;
}

function UnassignForm({
  instanceId,
  taskTitle,
  assigneeLabel,
  onClose,
}: {
  instanceId: string;
  taskTitle: string;
  assigneeLabel: string;
  onClose: () => void;
}) {
  const { de } = useStrings();
  const revoke = useRevokeAssignment();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    revoke.mutate(
      { instanceId, reason: reason.trim() === '' ? null : reason.trim() },
      {
        onSuccess: onClose,
        onError: (err) => setError(unassignErrorMessage(err, de)),
      },
    );
  };

  return (
    <div className={styles.unassignForm}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <p>{interpolate(de.task.adminUnassign.intro, { task: taskTitle, member: assigneeLabel })}</p>
      <label className={styles.field}>
        <span>{de.task.adminUnassign.reason}</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      <div className={styles.actions}>
        <Button variant="danger" onClick={handleSubmit} loading={revoke.isPending}>
          {de.task.adminUnassign.confirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {de.action.cancel}
        </Button>
      </div>
    </div>
  );
}

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
  const [unassignOpen, setUnassignOpen] = useState(false);

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
          {me?.role === 'ADMIN' && (
            <button className={styles.adminAction} onClick={() => setUnassignOpen(true)}>
              {de.task.adminUnassign.trigger}
            </button>
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

      {task.activeAssignment && (
        <Sheet
          open={unassignOpen}
          onOpenChange={setUnassignOpen}
          title={de.task.adminUnassign.title}
        >
          <UnassignForm
            instanceId={id}
            taskTitle={task.title}
            assigneeLabel={isAssignedToMe ? 'dir' : 'einer anderen Person'}
            onClose={() => setUnassignOpen(false)}
          />
        </Sheet>
      )}
    </div>
  );
}
