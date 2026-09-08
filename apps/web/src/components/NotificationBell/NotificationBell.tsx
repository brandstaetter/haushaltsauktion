/**
 * In-app notifications (§24 — "Initial muss mindestens In-App unterstützt
 * werden"). The backend has written these since Phase 1 (random assignment,
 * completion, buyout — `apps/api/src/app/{assignment,tasks,buyout}/*.ts`),
 * but nothing on the frontend ever read them until this component: a
 * fully-built, silently unused feature is exactly the kind of gap the
 * Phase 8 review agent flagged.
 */

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { formatDate, formatTime, interpolate } from '../../utils/format';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import type { NotificationRow } from '../../api/types';
import styles from './NotificationBell.module.css';

export function renderMessage(
  de: typeof import('../../strings/de').de,
  n: NotificationRow,
): string {
  const template = de.notifications.types[n.type as keyof typeof de.notifications.types];
  if (!template) return n.type;
  return interpolate(template, {
    task: n.taskTitle ?? '',
    value: String(n.payload.value ?? ''),
    from: String(n.payload.from ?? ''),
    to: String(n.payload.to ?? ''),
    by: String(n.payload.by ?? ''),
  });
}

export function NotificationBell() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={
          unreadCount > 0
            ? interpolate(de.notifications.unreadBadge, { n: unreadCount })
            : de.notifications.title
        }
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={de.notifications.title}>
        {items.length === 0 ? (
          <p className={styles.empty}>{de.notifications.empty}</p>
        ) : (
          <>
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => markAllRead.mutate()}
                loading={markAllRead.isPending}
              >
                {de.notifications.markAllRead}
              </Button>
            )}
            <ul className={styles.list}>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={n.readAt ? styles.item : styles.itemUnread}
                >
                  <button
                    type="button"
                    className={styles.itemButton}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      if (n.taskInstanceId) {
                        setOpen(false);
                        navigate(`/aufgaben/${n.taskInstanceId}`);
                      }
                    }}
                  >
                    <span className={styles.message}>{renderMessage(de, n)}</span>
                    <span className={styles.meta}>
                      <time dateTime={n.createdAt} className={styles.time}>
                        {formatDate(n.createdAt)}, {formatTime(n.createdAt)}
                      </time>
                      {n.pushNotified && (
                        <span
                          className={styles.pushIcon}
                          role="img"
                          aria-label={de.notifications.pushSentLabel}
                          title={de.notifications.pushSentLabel}
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M2 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Zm1.4.2 6.1 4.9a1 1 0 0 0 1 0l6.1-4.9-.5-.9H3.9l-.5.9ZM3 6.3V15h14V6.3l-6.1 4.9a2 2 0 0 1-2.6 0L3 6.3Z"
                            />
                          </svg>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </>
  );
}
