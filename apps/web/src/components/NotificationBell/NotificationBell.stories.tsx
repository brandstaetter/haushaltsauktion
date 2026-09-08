import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { NotificationBell } from './NotificationBell';
import type { NotificationRow } from '../../api/types';

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Notification bell in the header: shows an unread badge when notifications exist,
 * and opens a Sheet panel with the notification list on click. Panel shows a "Mark all as read"
 * button for unread items, and displays individual notification messages formatted via `renderMessage`.
 */
const meta = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
} satisfies Meta<typeof NotificationBell>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default: 1 unread notification. Bell shows a badge with "1", and the list displays the assignment message. */
export const WithUnreadNotification: Story = {};

/** No notifications: bell shows no badge, sheet displays "Keine Benachrichtigungen." */
export const NoNotifications: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () =>
          HttpResponse.json({
            items: [],
            unreadCount: 0,
            nextCursor: null,
          }),
        ),
      ],
    },
  },
};

/** Multiple unread notifications (5 items) — badge shows "5", sheet displays all with scrolling if needed. */
export const MultipleUnreadNotifications: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () => {
          const items: NotificationRow[] = [
            {
              id: 'notif-1',
              type: 'TASK_ASSIGNED',
              payload: { value: 6 },
              taskInstanceId: 'instance-1',
              taskTitle: 'Bad putzen',
              readAt: null,
              createdAt: new Date(Date.now() - 600_000).toISOString(),
            },
            {
              id: 'notif-2',
              type: 'TASK_TAKEN',
              payload: { value: 4 },
              taskInstanceId: 'instance-2',
              taskTitle: 'Staubsaugen',
              readAt: null,
              createdAt: new Date(Date.now() - 300_000).toISOString(),
            },
            {
              id: 'notif-3',
              type: 'TASK_COMPLETED',
              payload: { by: 'Arthur' },
              taskInstanceId: 'instance-3',
              taskTitle: 'Müll hinausbringen',
              readAt: null,
              createdAt: new Date(Date.now() - 150_000).toISOString(),
            },
            {
              id: 'notif-4',
              type: 'TASK_VALUE_INCREASED',
              payload: { from: 4, to: 6 },
              taskInstanceId: 'instance-4',
              taskTitle: 'Küche reinigen',
              readAt: null,
              createdAt: new Date(Date.now() - 60_000).toISOString(),
            },
            {
              id: 'notif-5',
              type: 'TASK_AVAILABLE',
              payload: { value: 3 },
              taskInstanceId: 'instance-5',
              taskTitle: 'Geschirrspüler ausräumen',
              readAt: null,
              createdAt: new Date(Date.now() - 30_000).toISOString(),
            },
          ];
          return HttpResponse.json({
            items,
            unreadCount: 5,
            nextCursor: null,
          });
        }),
      ],
    },
  },
};

/** Badge overflow: 15 unread notifications (badge shows "9+" per line 66 of NotificationBell.tsx). */
export const ManyUnreadNotifications: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () => {
          const items: NotificationRow[] = Array.from({ length: 15 }, (_, i) => ({
            id: `notif-${i + 1}`,
            type: ['TASK_ASSIGNED', 'TASK_TAKEN', 'TASK_COMPLETED', 'TASK_VALUE_INCREASED', 'TASK_AVAILABLE'][
              i % 5
            ] as NotificationRow['type'],
            payload: { value: 2 + i, by: 'Person', from: 2, to: 3 },
            taskInstanceId: `instance-${i + 1}`,
            taskTitle: `Aufgabe ${i + 1}`,
            readAt: null,
            createdAt: new Date(Date.now() - (1000 - i * 50)).toISOString(),
          }));
          return HttpResponse.json({
            items,
            unreadCount: 15,
            nextCursor: null,
          });
        }),
      ],
    },
  },
};

/** Mix of read and unread: some items have `readAt` set, badge shows only unread count (2). */
export const MixedReadUnread: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () => {
          const items: NotificationRow[] = [
            {
              id: 'notif-read-1',
              type: 'TASK_ASSIGNED',
              payload: { value: 6 },
              taskInstanceId: 'instance-1',
              taskTitle: 'Bad putzen',
              readAt: new Date(Date.now() - 3600_000).toISOString(),
              createdAt: new Date(Date.now() - 7200_000).toISOString(),
            },
            {
              id: 'notif-unread-1',
              type: 'TASK_TAKEN',
              payload: { value: 4 },
              taskInstanceId: 'instance-2',
              taskTitle: 'Staubsaugen',
              readAt: null,
              createdAt: new Date(Date.now() - 300_000).toISOString(),
            },
            {
              id: 'notif-read-2',
              type: 'TASK_COMPLETED',
              payload: { by: 'Luise' },
              taskInstanceId: 'instance-3',
              taskTitle: 'Wäsche aufhängen',
              readAt: new Date(Date.now() - 1800_000).toISOString(),
              createdAt: new Date(Date.now() - 3600_000).toISOString(),
            },
            {
              id: 'notif-unread-2',
              type: 'TASK_VALUE_INCREASED',
              payload: { from: 2, to: 3 },
              taskInstanceId: 'instance-4',
              taskTitle: 'Geschirrspüler ausräumen',
              readAt: null,
              createdAt: new Date(Date.now() - 60_000).toISOString(),
            },
          ];
          return HttpResponse.json({
            items,
            unreadCount: 2,
            nextCursor: null,
          });
        }),
      ],
    },
  },
};

/** Fetch error: `/api/notifications` returns 500 (not mocked, falls through to an error). The bell may show a fallback state. */
export const FetchError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () => HttpResponse.json({ error: 'Server error' }, { status: 500 })),
      ],
    },
  },
};

/** iPhone 13 viewport, 1 unread notification — mobile layout. */
export const MobileWithUnread: Story = {
  globals: { viewport: iphone13Viewport },
};

/** iPhone 13 viewport, no notifications. */
export const MobileNoNotifications: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/notifications', () =>
          HttpResponse.json({
            items: [],
            unreadCount: 0,
            nextCursor: null,
          }),
        ),
      ],
    },
  },
};
