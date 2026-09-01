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
import { formatDate, interpolate } from '../../utils/format';
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
                    <time dateTime={n.createdAt} className={styles.time}>
                      {formatDate(n.createdAt)}
                    </time>
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
