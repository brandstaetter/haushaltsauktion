import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import type { AssignmentSummaryDto } from '@haushaltsauktion/shared';
import {
  useTaskDetail,
  useVolunteer,
  useCompleteTask,
  useReleaseAssignment,
  useBuyout,
  useAcceptAssignment,
  useAssignmentQuote,
  useMemberMe,
  useMembers,
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
  assignmentId,
  taskTitle,
  assigneeLabel,
  onClose,
}: {
  instanceId: string;
  /**
   * Multi-worker-tasks: the specific co-assignee's slot to release. Always
   * sent — the backend requires it once an instance has more than one
   * active slot, and accepts (but doesn't need) it for `EXACTLY(1)` too.
   */
  assignmentId: string;
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
      { instanceId, assignmentId, reason: reason.trim() === '' ? null : reason.trim() },
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
  // Multi-worker-tasks (Phase 4): `activeAssignments` only carries
  // `memberId`, not a display name — resolved here from the household
  // member list (already small, 1-20 members) so co-assignees can be shown
  // by name.
  const { data: membersData } = useMembers();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<AssignmentSummaryDto | null>(null);

  const activeAssignments = task?.activeAssignments ?? [];
  const multiSlot = activeAssignments.length > 1;
  // A member can hold at most one active slot per instance, so `find` (not
  // `filter`) is correct here.
  const myAssignment = activeAssignments.find((a) => a.memberId === me?.id) ?? null;
  const { data: quote } = useAssignmentQuote(myAssignment?.id);

  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;
  if (isError || !task || !id) {
    return (
      <div className={styles.center}>
        <p>{de.error.loadFailed}</p>
        <Button onClick={() => refetch()}>{de.action.retry}</Button>
      </div>
    );
  }

  const isAssignedToMe = myAssignment !== null;
  const isPendingDecision = myAssignment?.response === 'PENDING' && task.status === 'ASSIGNED';

  const memberName = (memberId: string): string | null =>
    (membersData?.items ?? []).find((m) => m.id === memberId)?.displayName ?? null;

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
          {task.workerCount > 1 && (
            <p>
              {interpolate(de.task.slotsOccupied, {
                occupied: task.activeSlotCount,
                total: task.workerCount,
              })}
            </p>
          )}
        </div>
      </div>

      {activeAssignments.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Zugewiesen</h2>
          {activeAssignments.map((a) => {
            const mine = a.memberId === me?.id;
            const rowPending = a.response === 'PENDING';
            // §21/§32 parity: for a single-slot task, the "someone else"
            // case never showed a name before this feature — only a
            // multi-slot task (where distinguishing co-assignees actually
            // matters) resolves and shows one.
            const resolvedName = multiSlot ? memberName(a.memberId) : null;
            const label = mine
              ? de.task.assignedYou
              : resolvedName !== null
                ? interpolate(de.task.assignedNamed, { name: resolvedName })
                : de.task.assignedOther;
            return (
              <div key={a.id} className={styles.assigneeRow}>
                <p className={styles.assignee}>{label}</p>
                {a.kind === 'RANDOM' && !rowPending && (
                  <AssignmentExplanation assignmentId={a.id} />
                )}
                {me?.role === 'ADMIN' && (
                  <button className={styles.adminAction} onClick={() => setUnassignTarget(a)}>
                    {de.task.adminUnassign.trigger}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {feedback && (
        <div className={styles.feedback} role="status">
          {feedback}
        </div>
      )}

      <div className={styles.actions}>
        {/* Bugfix (multi-worker vanish-from-list): `canVolunteer` already
            encodes "has an open slot and is eligible" (see toAvailableDto) —
            an extra `status === 'AVAILABLE'` here would hide the CTA for an
            ASSIGNED multi-worker instance that still has room. */}
        {task.canVolunteer && (
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
                    body: { assignmentId: myAssignment!.id, expectedVersion: task.version },
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
                      assignmentId: myAssignment!.id,
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
                    assignmentId: myAssignment!.id,
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
            {myAssignment!.kind === 'RANDOM' && (
              <AssignmentExplanation assignmentId={myAssignment!.id} />
            )}
            <Button
              variant="secondary"
              onClick={() => run(accept.mutateAsync(myAssignment!.id))}
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
                      assignmentId: myAssignment!.id,
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

      {activeAssignments.length > 0 && (
        <Sheet
          open={unassignTarget !== null}
          onOpenChange={(open) => !open && setUnassignTarget(null)}
          title={de.task.adminUnassign.title}
        >
          {unassignTarget && (
            <UnassignForm
              instanceId={id}
              assignmentId={unassignTarget.id}
              taskTitle={task.title}
              assigneeLabel={
                unassignTarget.memberId === me?.id
                  ? 'dir'
                  : multiSlot
                    ? memberName(unassignTarget.memberId) ?? 'einer anderen Person'
                    : 'einer anderen Person'
              }
              onClose={() => setUnassignTarget(null)}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}
