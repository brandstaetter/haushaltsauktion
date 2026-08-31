import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDashboard, useRejectCompletion, useSession } from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { DashboardDto, RejectCompletionOutcome } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { TaskCard } from '../../components/TaskCard/TaskCard';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './DashboardPage.module.css';

function rejectErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'ASSIGNMENT_CLOSED') return de.dashboard.reject.errors.alreadyHandled;
  if (err instanceof ApiError && err.message) return err.message;
  return de.dashboard.reject.errors.generic;
}

function RejectCompletionSheet({
  item,
  onClose,
}: {
  item: DashboardDto['family']['recentlyCompleted'][number];
  onClose: () => void;
}) {
  const { de } = useStrings();
  const rejectCompletion = useRejectCompletion();
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<RejectCompletionOutcome>('REOFFER_MARKET');
  const [error, setError] = useState<string | null>(null);
  const member = item.completedBy ?? '';

  const handleSubmit = () => {
    setError(null);
    rejectCompletion.mutate(
      { instanceId: item.id, reason: reason.trim() === '' ? null : reason.trim(), outcome },
      {
        onSuccess: onClose,
        onError: (err) => setError(rejectErrorMessage(err, de)),
      },
    );
  };

  return (
    <div className={styles.rejectForm}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <p>{interpolate(de.dashboard.reject.intro, { task: item.title, member })}</p>
      <p className={styles.hint}>
        {item.pointsAwarded > 0
          ? interpolate(de.dashboard.reject.consequenceWithPoints, {
              points: item.pointsAwarded,
              member,
            })
          : de.dashboard.reject.consequenceNoPoints}
      </p>
      <fieldset className={styles.outcomeGroup}>
        <legend>{de.dashboard.reject.outcomeHeading}</legend>
        <label className={styles.outcomeOption}>
          <input
            type="radio"
            name="reject-outcome"
            checked={outcome === 'REASSIGN_TO_MEMBER'}
            onChange={() => setOutcome('REASSIGN_TO_MEMBER')}
          />
          <span>
            <strong>{interpolate(de.dashboard.reject.outcomeReassign, { member })}</strong>
            <span className={styles.hint}>
              {interpolate(de.dashboard.reject.outcomeReassignHint, { member })}
            </span>
          </span>
        </label>
        <label className={styles.outcomeOption}>
          <input
            type="radio"
            name="reject-outcome"
            checked={outcome === 'REOFFER_MARKET'}
            onChange={() => setOutcome('REOFFER_MARKET')}
          />
          <span>
            <strong>{de.dashboard.reject.outcomeMarket}</strong>
            <span className={styles.hint}>{de.dashboard.reject.outcomeMarketHint}</span>
          </span>
        </label>
      </fieldset>
      <label className={styles.field}>
        <span>{de.dashboard.reject.reason}</span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
      <div className={styles.actions}>
        <Button
          variant="danger"
          onClick={handleSubmit}
          loading={rejectCompletion.isPending}
        >
          {de.dashboard.reject.confirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {de.action.cancel}
        </Button>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDashboard();
  const { data: session } = useSession();
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  if (isLoading) return <div className={styles.spinner} aria-label="Wird geladen" />;
  if (isError || !data) {
    return (
      <div className={styles.center}>
        <p>{de.error.loadFailed}</p>
        <Button onClick={() => refetch()}>{de.action.retry}</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.greeting}>{de.dashboard.greeting.replace('{name}', data.me.displayName)}</h1>
        <div className={styles.balanceCard}>
          <span className={styles.balanceLabel}>{de.dashboard.balance}</span>
          <span className={styles.balanceValue}>{formatNumber(data.me.balance)}</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{de.dashboard.myTasks}</h2>
          <button className={styles.link} onClick={() => navigate('/aufgaben')}>
            {de.dashboard.allTasks}
          </button>
        </div>
        <div className={styles.stack}>
          {data.me.assigned.length === 0 ? (
            <p className={styles.empty}>{de.task.noAssigned}</p>
          ) : (
            data.me.assigned.slice(0, 3).map((task) => (
              <TaskCard key={task.id} task={task} onAction={() => navigate(`/aufgaben/${task.id}`)} />
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.dashboard.available}</h2>
        <div className={styles.stack}>
          {data.me.available.length === 0 ? (
            <p className={styles.empty}>{de.task.noTasks}</p>
          ) : (
            data.me.available.slice(0, 3).map((task) => (
              <TaskCard key={task.id} task={task} onAction={() => navigate(`/aufgaben/${task.id}`)} />
            ))
          )}
        </div>
      </section>

      <section className={styles.household}>
        <h2 className={styles.sectionTitle}>{de.dashboard.household}</h2>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{data.family.openTasks.length}</span>
            <span className={styles.summaryLabel}>{de.dashboard.openTasks}</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{data.family.members.length}</span>
            <span className={styles.summaryLabel}>{de.dashboard.members}</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{formatNumber(data.family.openTasks.reduce((sum, t) => sum + t.currentValue, 0))}</span>
            <span className={styles.summaryLabel}>{de.dashboard.currentValue}</span>
          </div>
        </div>
      </section>

      {data.family.recentlyCompleted.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{de.dashboard.recent}</h2>
          <ul className={styles.stack}>
            {data.family.recentlyCompleted.slice(0, 5).map((item) => {
              const canReject =
                session?.role === 'ADMIN' &&
                !item.rejected &&
                item.completedByMemberId !== session.member?.id;
              return (
                <li key={item.id} className={styles.row}>
                  <span>{item.title}</span>
                  <span>{item.completedBy ?? '—'} · {formatNumber(item.value)}</span>
                  {item.rejected && (
                    <span className={styles.rejectedBadge}>{de.dashboard.reject.rejectedBadge}</span>
                  )}
                  {canReject && (
                    <button
                      className={styles.link}
                      onClick={() => setRejectTargetId(item.id)}
                    >
                      {de.dashboard.reject.trigger}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(() => {
        const rejectTarget = data.family.recentlyCompleted.find((i) => i.id === rejectTargetId);
        return (
          <Sheet
            open={rejectTarget !== undefined}
            onOpenChange={(open) => !open && setRejectTargetId(null)}
            title={de.dashboard.reject.title}
          >
            {rejectTarget && (
              <RejectCompletionSheet item={rejectTarget} onClose={() => setRejectTargetId(null)} />
            )}
          </Sheet>
        );
      })()}
    </div>
  );
}
