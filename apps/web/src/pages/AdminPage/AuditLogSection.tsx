import { useState } from 'react';
import { AuditAction } from '@haushaltsauktion/shared';
import { useAdminAuditEvents } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { formatDate, interpolate, signedNumber } from '../../utils/format';
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
 */
export function AuditLogSection() {
  const { de } = useStrings();
  const [action, setAction] = useState<AuditAction | ''>('');
  const { data, isLoading } = useAdminAuditEvents(action || undefined);
  const events = data?.items ?? [];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.auditLog}</h2>

      <label className={styles.field}>
        <span className="visually-hidden">{de.admin.auditLog.filterLabel}</span>
        <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">{de.admin.auditLog.filterAll}</option>
          {Object.values(AuditAction).map((a) => (
            <option key={a} value={a}>
              {de.admin.auditLog.actions[a]}
            </option>
          ))}
        </select>
      </label>

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
                    {formatDate(event.createdAt)}
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
