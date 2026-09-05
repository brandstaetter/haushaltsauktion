/**
 * Default MSW handlers, baked into the worker itself in
 * `.storybook/preview.tsx` (not passed via `parameters.msw` — see that
 * file's doc comment for why). Cover the endpoints the shared app chrome
 * (`Layout`, `Nav`, `NotificationBell`) and the currently story'd pages
 * call, via `../api/client`'s `/api` prefix. A story overrides one for
 * itself via its own `parameters.msw.handlers` (CSF3 —
 * `msw-storybook-addon/csf3`'s `mswLoader`) — only list what that story
 * changes; every other default here still applies underneath it.
 */
import { http, HttpResponse } from 'msw';
import { mockDashboard, mockMembers, mockNotifications, mockOperatorMetrics, mockSession } from './data';

export const handlers = [
  http.get('/api/auth/me', () => HttpResponse.json(mockSession)),
  http.get('/api/dashboard', () => HttpResponse.json(mockDashboard)),
  http.get('/api/notifications', () => HttpResponse.json(mockNotifications)),
  http.get('/api/config/public', () =>
    HttpResponse.json({ version: 1, values: {} }),
  ),
  // `TaskDetailPage` (and any future page resolving co-assignee names) reads
  // these two — generic enough to live here rather than per-story.
  http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
  http.get('/api/members/me', () => HttpResponse.json(mockMembers[0])),
  // Operator area (`operatorClient.ts`) is a structurally separate identity
  // from the household session above — see that file's module doc. Its own
  // login state lives only in the QueryClient cache (`useOperatorSession`),
  // never fetched, so there's no `/api/operator/me` to mock here; a story
  // seeds that cache directly instead (see `OperatorDashboardPage.stories.tsx`).
  http.get('/api/operator/metrics', () => HttpResponse.json(mockOperatorMetrics)),
];
