import { useEffect, useMemo, useState } from 'react';
import { AuditAction } from '@haushaltsauktion/shared';
import { useAdminAuditEvents, useMembers } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { formatDate, formatTime, interpolate, signedNumber } from '../../utils/format';
import { Button } from '../../components/Button/Button';
import styles from './AdminPage.module.css';

/**
 * §23 admin-only audit log (intake
 * "manual-point-adjustment-missing-from-shared-history"): the first UI
 * surface for `AuditEvent`, which `adjustPoints.ts` and every other admin
 * mutation already write correctly, but which no page ever rendered — a
 * manual points correction (or a role change, a category edit, ...) was
 * previously invisible to everyone but the affected member's own ledger.
 *
 * Deliberately generic rather than one bespoke renderer per `AuditAction`:
 * `reason`/`amount` are read straight off `payload` when present (the same
 * idiom `HistoryPage.tsx`'s `renderEvent` uses), which covers
 * `POINTS_ADJUSTED` — this ticket's actual complaint — without a 38-way
 * switch over every action's payload shape.
 *
 * Filtering (intake "admin-audit-log-checkbox-grid-filters") is multi-select
 * over both action and actor, applied server-side via `useAdminAuditEvents`'s
 * `actions`/`actors` params — not by re-filtering an already-fetched page:
 * a chatty action like `ASSIGNMENT_SWEEP_RUN` can fill the route's 100-row
 * cap on its own, so a client-side filter over that one fetch could still
 * miss older events of an action the admin actually wants to see. An empty
 * selection means "no filter", matching the old dropdown's "Alle Aktionen"
 * default.
 */

const FILTERS_STORAGE_KEY = 'hh-audit-log-filters';
const SYSTEM_ACTOR_KEY = 'SYSTEM';

interface StoredFilters {
  actions: string[];
  actors: string[];
}

function readStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return { actions: [], actors: [] };
    const parsed = JSON.parse(raw) as Partial<StoredFilters>;
    return {
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      actors: Array.isArray(parsed.actors) ? parsed.actors : [],
    };
  } catch {
    // Private mode / storage disabled / corrupt value — just start unfiltered.
    return { actions: [], actors: [] };
  }
}

function writeStoredFilters(filters: StoredFilters): void {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Worst case: filters don't survive a reload. Not worth failing over.
  }
}

export function AuditLogSection() {
  const { de } = useStrings();
  const { data: membersData } = useMembers();
  const members = membersData?.items ?? [];
  const allActions = useMemo(() => Object.values(AuditAction), []);

  const initialFilters = useMemo(readStoredFilters, []);
  const [selectedActions, setSelectedActions] = useState<Set<AuditAction>>(
    () => new Set(initialFilters.actions as AuditAction[]),
  );
  const [selectedActors, setSelectedActors] = useState<Set<string>>(
    () => new Set(initialFilters.actors),
  );

  useEffect(() => {
    writeStoredFilters({ actions: [...selectedActions], actors: [...selectedActors] });
  }, [selectedActions, selectedActors]);

  // Sorted so the query key (and thus the cache/refetch) is stable regardless
  // of the Set's insertion order — toggling the same selection off and back
  // on shouldn't look like a different filter to useQuery.
  const actionsParam = useMemo(() => [...selectedActions].sort(), [selectedActions]);
  const actorsParam = useMemo(() => [...selectedActors].sort(), [selectedActors]);
  const { data, isLoading } = useAdminAuditEvents(actionsParam, actorsParam);
  const events = data?.items ?? [];

  const toggleAction = (action: AuditAction) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  };

  const toggleActor = (key: string) => {
    setSelectedActors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.auditLog}</h2>

      <div className={styles.filterGroup}>
        <div className={styles.filterHeader}>
          <span>{de.admin.auditLog.filterActionsLabel}</span>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedActions(new Set(allActions))}
            >
              {de.admin.auditLog.selectAll}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedActions(new Set())}
            >
              {de.admin.auditLog.selectNone}
            </Button>
          </div>
        </div>
        <div className={styles.checkboxGrid}>
          {allActions.map((a) => (
            <label key={a} className={styles.checkbox}>
              <input type="checkbox" checked={selectedActions.has(a)} onChange={() => toggleAction(a)} />
              <span>{de.admin.auditLog.actions[a]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.filterGroup}>
        <span>{de.admin.auditLog.filterActorsLabel}</span>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={selectedActors.has(SYSTEM_ACTOR_KEY)}
              onChange={() => toggleActor(SYSTEM_ACTOR_KEY)}
            />
            <span>{de.admin.auditLog.actorSystem}</span>
          </label>
          {members.map((member) => (
            <label key={member.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selectedActors.has(member.id)}
                onChange={() => toggleActor(member.id)}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : events.length === 0 ? (
        <p className={styles.hint}>{de.admin.auditLog.empty}</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => {
            const reason = typeof event.payload['reason'] === 'string' ? event.payload['reason'] : null;
            const amount = typeof event.payload['amount'] === 'number' ? event.payload['amount'] : null;
            return (
              <li key={event.id} className={styles.memberRow}>
                <div className={styles.memberHeader}>
                  <span className={styles.memberName}>{de.admin.auditLog.actions[event.action]}</span>
                  <time dateTime={event.createdAt} className={styles.hint}>
                    {formatDate(event.createdAt)}, {formatTime(event.createdAt)}
                  </time>
                </div>
                <div className={styles.memberFields}>
                  <div className={styles.field}>
                    <span>
                      {event.actorType === 'SYSTEM'
                        ? de.admin.auditLog.actorSystem
                        : (event.actor?.displayName ?? '—')}
                    </span>
                  </div>
                  {amount !== null && (
                    <div className={styles.field}>
                      <span>{interpolate(de.admin.auditLog.amount, { value: signedNumber(amount) })}</span>
                    </div>
                  )}
                  {reason && (
                    <div className={styles.field}>
                      <span>{interpolate(de.admin.auditLog.reason, { reason })}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
