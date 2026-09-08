import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { AdminAuditLogPage } from './AdminAuditLogPage';
import { Layout } from '../../components/Layout/Layout';
import { mockMembers } from '../../mocks/data';

/**
 * Full-page story for the audit log route, rendered inside Layout so the admin tab bar
 * and header are visible. Route path matches the real `/verwaltung/audit-log` in router.tsx.
 */
const meta = {
  title: 'Pages/Admin/AdminAuditLogPage',
  component: AdminAuditLogPage,
  parameters: { layout: 'fullscreen', reactRouter: { initialEntries: ['/verwaltung/audit-log'] } },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/audit-log" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminAuditLogPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Full audit log with representative mix of event types.
 */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/audit-events', () =>
          HttpResponse.json({
            items: [
              {
                id: 'audit-1',
                seq: '1',
                actorType: 'ADMIN',
                actorMemberId: 'member-elke',
                actor: { id: 'member-elke', displayName: 'Elke' },
                action: 'POINTS_ADJUSTED',
                entityType: 'HouseholdMember',
                entityId: 'member-arthur',
                payload: { amount: 10, reason: 'Vorab erledigt', balanceAfter: 27 },
                createdAt: '2026-09-08T14:32:00.000Z',
              },
              {
                id: 'audit-2',
                seq: '2',
                actorType: 'SYSTEM',
                actorMemberId: null,
                actor: null,
                action: 'ASSIGNMENT_SWEEP_RUN',
                entityType: 'TaskInstance',
                entityId: null,
                payload: { assigned: 3, expired: 1 },
                createdAt: '2026-09-08T12:00:00.000Z',
              },
              {
                id: 'audit-3',
                seq: '3',
                actorType: 'MEMBER',
                actorMemberId: 'member-hannes',
                actor: { id: 'member-hannes', displayName: 'Hannes' },
                action: 'BUYOUT_EXECUTED',
                entityType: 'TaskInstance',
                entityId: 'instance-bathroom',
                payload: { amount: -6, balanceAfter: 17, taskValue: 6 },
                createdAt: '2026-09-08T11:45:00.000Z',
              },
            ],
          }),
        ),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};

/**
 * Empty log — no events yet.
 */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/audit-events', () =>
          HttpResponse.json({ items: [] }),
        ),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};

/**
 * Mobile (iPhone 13) — full page on small viewport.
 */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/audit-events', () =>
          HttpResponse.json({
            items: [
              {
                id: 'audit-1',
                seq: '1',
                actorType: 'ADMIN',
                actorMemberId: 'member-elke',
                actor: { id: 'member-elke', displayName: 'Elke' },
                action: 'ROLE_CHANGED',
                entityType: 'HouseholdMember',
                entityId: 'member-luise',
                payload: { before: 'MEMBER', after: 'ADMIN' },
                createdAt: '2026-09-08T14:32:00.000Z',
              },
              {
                id: 'audit-2',
                seq: '2',
                actorType: 'ADMIN',
                actorMemberId: 'member-elke',
                actor: { id: 'member-elke', displayName: 'Elke' },
                action: 'CONFIG_UPDATED',
                entityType: 'HouseholdConfig',
                entityId: 'household-demo',
                payload: { field: 'buyoutCostMultiplier', before: 1.0, after: 1.5 },
                createdAt: '2026-09-08T13:00:00.000Z',
              },
            ],
          }),
        ),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};
