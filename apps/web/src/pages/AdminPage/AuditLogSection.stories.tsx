import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { AuditLogSection } from './AuditLogSection';
import { mockMembers } from '../../mocks/data';

const meta = {
  title: 'Pages/Admin/AuditLogSection',
  component: AuditLogSection,
} satisfies Meta<typeof AuditLogSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Multiple audit event types (points adjustment, member change, random selection, buyout, config) —
 * representative mix showing how the generic renderer handles diverse payloads (amount, reason, diff, etc).
 */
export const Populated: Story = {
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
                actorType: 'ADMIN',
                actorMemberId: 'member-elke',
                actor: { id: 'member-elke', displayName: 'Elke' },
                action: 'ROLE_CHANGED',
                entityType: 'HouseholdMember',
                entityId: 'member-luise',
                payload: { before: 'MEMBER', after: 'ADMIN', diff: 'role_upgraded' },
                createdAt: '2026-09-08T13:15:00.000Z',
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
                createdAt: '2026-09-08T12:45:00.000Z',
              },
              {
                id: 'audit-4',
                seq: '4',
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
                id: 'audit-5',
                seq: '5',
                actorType: 'SYSTEM',
                actorMemberId: null,
                actor: null,
                action: 'RANDOM_SELECTION',
                entityType: 'TaskInstance',
                entityId: 'instance-trash',
                payload: { selectedMemberId: 'member-arthur', candidateCount: 3 },
                createdAt: '2026-09-08T11:30:00.000Z',
              },
              {
                id: 'audit-6',
                seq: '6',
                actorType: 'ADMIN',
                actorMemberId: 'member-elke',
                actor: { id: 'member-elke', displayName: 'Elke' },
                action: 'CONFIG_UPDATED',
                entityType: 'HouseholdConfig',
                entityId: 'household-demo',
                payload: { field: 'buyoutCostMultiplier', before: 1.0, after: 1.5 },
                createdAt: '2026-09-08T10:00:00.000Z',
              },
              {
                id: 'audit-7',
                seq: '7',
                actorType: 'MEMBER',
                actorMemberId: 'member-luise',
                actor: { id: 'member-luise', displayName: 'Luise' },
                action: 'TASK_COMPLETED',
                entityType: 'TaskInstance',
                entityId: 'instance-dishwasher',
                payload: { value: 2, pointsAwarded: 2 },
                createdAt: '2026-09-08T09:15:00.000Z',
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
 * No audit events exist — shows the empty state message.
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
 * Fetch indefinitely delayed — shows the loading spinner.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/audit-events', () => new Promise(() => {})),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};

/**
 * Server error (500) — shows error feedback and retry affordance.
 */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/audit-events', () =>
          HttpResponse.json({ error: { message: 'Internal server error' } }, { status: 500 }),
        ),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};

/**
 * Mobile (iPhone 13) — verifies responsive layout and touch interactions.
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
                payload: { assigned: 2, expired: 0 },
                createdAt: '2026-09-08T12:00:00.000Z',
              },
            ],
          }),
        ),
        http.get('/api/members', () => HttpResponse.json({ items: mockMembers })),
      ],
    },
  },
};
