import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { AssignmentSummaryDto, TaskInstanceDetailDto } from '@haushaltsauktion/shared';
import { TaskDetailPage } from './TaskDetailPage';
import { Layout } from '../../components/Layout/Layout';
import {
  mockAssignmentAccepted,
  mockAvailableTasks,
  mockMembers,
  mockSelectionExplanation,
  mockSession,
  mockTaskDetailAssigned,
  mockTaskDetailAvailable,
  mockTaskDetailPending,
  mockTaskDetailVoluntaryAssigned,
} from '../../mocks/data';

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * `AssignedAsMember` only — a plain MEMBER instead of the default fixture's
 * ADMIN (mirrors `DashboardPage.stories.tsx`'s `memberSessionHandler`).
 * `Layout`'s nav reads `/api/auth/me`; `TaskDetailPage`'s own
 * `me?.role === 'ADMIN'` gate (the "Zuweisung aufheben" action) reads
 * `/api/members/me` via `useMemberMe` — both need overriding to stay
 * consistent, and both keep the same member id so `myAssignment` still
 * resolves to "mine".
 */
const memberSessionHandlers = [
  http.get('/api/auth/me', () =>
    HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
  ),
  http.get('/api/members/me', () => HttpResponse.json({ ...mockMembers[0], role: 'MEMBER' })),
];

/**
 * Multi-worker-tasks (Phase 3) fixtures — the same three slot-fill states as
 * `DashboardPage.stories.tsx`'s `MultiWorkerTasks` (0/2, 1/2, 2/2), but here
 * as the detail page's own `activeAssignments` list rather than a `TaskCard`
 * badge. Arthur's row has no `buyoutQuote` — the server only computes one
 * for the viewer's own `RANDOM` assignment (`apps/api/.../taskDto.ts`), never
 * for a co-assignee's.
 */
const arthurAssignment: AssignmentSummaryDto = {
  id: 'assignment-multiworker-arthur',
  memberId: mockMembers[1].id,
  kind: 'VOLUNTARY',
  response: 'ACCEPTED',
  assignedAt: new Date().toISOString(),
  valueAtAssignment: 6,
  rewardOnCompletion: 6,
  buyoutQuote: null,
};

const multiWorkerBase: TaskInstanceDetailDto = {
  ...mockAvailableTasks[1],
  taskDefinitionId: 'def-bathroom',
  scheduledFor: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  completedAt: null,
  completedBy: null,
  workerCountMode: 'EXACTLY',
  workerCount: 2,
  activeAssignment: null,
  activeAssignments: [],
};

/** 1 of 2 filled, viewer hasn't joined — only Arthur's slot shows, without a resolved name (`multiSlot` needs 2+ concurrent assignees). */
const multiWorkerOpenSlotDetail: TaskInstanceDetailDto = {
  ...multiWorkerBase,
  id: 'instance-multiworker-1of2',
  title: 'Garten pflegen',
  status: 'ASSIGNED',
  activeSlotCount: 1,
  canVolunteer: true,
  viewerHasActiveSlot: false,
  activeAssignment: null,
  activeAssignments: [arthurAssignment],
};

/** 2 of 2 filled — the viewer holds one slot (RANDOM, so buyout + fairness sheet apply) and Arthur's name resolves for the other. */
const multiWorkerFullyStaffedDetail: TaskInstanceDetailDto = {
  ...multiWorkerBase,
  id: 'instance-multiworker-2of2',
  title: 'Keller aufräumen',
  status: 'ASSIGNED',
  activeSlotCount: 2,
  canVolunteer: false,
  viewerHasActiveSlot: true,
  potentialReward: 0,
  activeAssignment: mockAssignmentAccepted,
  activeAssignments: [mockAssignmentAccepted, arthurAssignment],
};

/** 0 of 2 filled — plain "Freiwillig übernehmen", no "Zugewiesen" card at all. */
const multiWorkerNoAssignmentsDetail: TaskInstanceDetailDto = {
  ...multiWorkerBase,
  id: 'instance-multiworker-0of2',
  title: 'Fenster putzen',
  status: 'AVAILABLE',
  activeSlotCount: 0,
  canVolunteer: true,
  viewerHasActiveSlot: false,
  activeAssignment: null,
  activeAssignments: [],
};

/**
 * Same pattern as `DashboardPage.stories.tsx`: renders the real page against
 * MSW rather than props, wrapped in `Layout` for header/nav chrome. `Layout`
 * routes via `<Outlet />`, so the route needs an actual `/aufgaben/:id`
 * match — each story points `parameters.reactRouter.initialEntries` at the
 * instance id its own `/api/tasks/:id` override returns (the handler ignores
 * the id param and always serves that story's fixture).
 */
const meta = {
  title: 'Pages/TaskDetailPage',
  component: TaskDetailPage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/aufgaben/:id" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof TaskDetailPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Freshly offered, not yet taken by anyone — §20's "Freiwillig übernehmen" CTA. */
export const Available: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailAvailable.id}`] },
    msw: {
      handlers: [http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailAvailable))],
    },
  },
};

/**
 * Randomly assigned to the viewer, decision still pending — §21/§31's
 * "Du wurdest ausgewählt" screen. Both "Aufgabe übernehmen" and the buyout
 * CTA render `variant="secondary"` here on purpose (§31 forbids nudging one
 * over the other); the fairness sheet (§32, "Warum wurde ich ausgewählt?")
 * is wired to a real `/explain` response too.
 */
export const PendingDecision: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailPending.id}`] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailPending)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(mockTaskDetailPending.activeAssignment!.buyoutQuote),
        ),
        http.get('/api/assignments/:id/explain', () => HttpResponse.json(mockSelectionExplanation)),
      ],
    },
  },
};

/** Decision accepted — the "erledigen / freikaufen / zurückgeben" screen (§21). */
export const Assigned: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailAssigned.id}`] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailAssigned)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(mockTaskDetailAssigned.activeAssignment!.buyoutQuote),
        ),
      ],
    },
  },
};

/** Same as `Assigned`, but as a plain household MEMBER — no "Zuweisung aufheben" admin action on the card. */
export const AssignedAsMember: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailAssigned.id}`] },
    msw: {
      handlers: [
        ...memberSessionHandlers,
        http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailAssigned)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(mockTaskDetailAssigned.activeAssignment!.buyoutQuote),
        ),
      ],
    },
  },
};

/**
 * Multi-worker-tasks (Phase 3), 1 of 2 slots filled — the viewer hasn't
 * joined (the vanish-from-list bugfix: `status === 'ASSIGNED'` no longer
 * implies "the viewer holds this"), and since Arthur is already on it the
 * CTA reads "Mithelfen" rather than "Freiwillig übernehmen" (that stays for
 * a fresh, untouched task — see `MultiWorkerNoAssignments`). The "Zugewiesen"
 * card shows Arthur's row, generically ("jemand anderem") since a single
 * concurrent assignee doesn't trigger name resolution.
 */
export const MultiWorkerOpenSlot: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${multiWorkerOpenSlotDetail.id}`] },
    msw: {
      handlers: [http.get('/api/tasks/:id', () => HttpResponse.json(multiWorkerOpenSlotDetail))],
    },
  },
};

/**
 * Multi-worker-tasks (Phase 3), fully staffed (2 of 2) — the viewer holds
 * one of the two slots, so the usual complete/buyout/fairness-sheet actions
 * apply exactly as in `Assigned`. The "Zugewiesen" card now resolves
 * Arthur's name too (2+ concurrent assignees).
 */
export const MultiWorkerFullyStaffed: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${multiWorkerFullyStaffedDetail.id}`] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json(multiWorkerFullyStaffedDetail)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(multiWorkerFullyStaffedDetail.activeAssignment!.buyoutQuote),
        ),
        http.get('/api/assignments/:id/explain', () => HttpResponse.json(mockSelectionExplanation)),
      ],
    },
  },
};

/** Multi-worker-tasks (Phase 3), no assignments yet (0 of 2) — plain "Freiwillig übernehmen", no "Zugewiesen" card at all. */
export const MultiWorkerNoAssignments: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${multiWorkerNoAssignmentsDetail.id}`] },
    msw: {
      handlers: [http.get('/api/tasks/:id', () => HttpResponse.json(multiWorkerNoAssignmentsDetail))],
    },
  },
};

/**
 * Voluntarily taken, not randomly assigned — PRD §3B: a voluntary takeover
 * is released, never bought out. No buyout CTA (the mocked `/buyout-quote`
 * returns `allowed: false` / `NOT_RANDOM_ASSIGNMENT`, exactly like the real
 * `evaluateBuyoutRules` for a `VOLUNTARY` kind) and no fairness sheet (only a
 * `RANDOM` assignment has a `selectionTrace` to explain) — just "erledigen"
 * and, as a secondary action, "zurückgeben".
 */
export const VoluntaryAssigned: Story = {
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailVoluntaryAssigned.id}`] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailVoluntaryAssigned)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(mockTaskDetailVoluntaryAssigned.activeAssignment!.buyoutQuote),
        ),
      ],
    },
  },
};

/** Task fetch fails — the page's retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    reactRouter: { initialEntries: ['/aufgaben/instance-broken'] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
      ],
    },
  },
};

/** iPhone 13 viewport — the primary mobile-first layout target (§19), pending-decision screen. */
export const Mobile: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    reactRouter: { initialEntries: [`/aufgaben/${mockTaskDetailPending.id}`] },
    msw: {
      handlers: [
        http.get('/api/tasks/:id', () => HttpResponse.json(mockTaskDetailPending)),
        http.get('/api/assignments/:id/buyout-quote', () =>
          HttpResponse.json(mockTaskDetailPending.activeAssignment!.buyoutQuote),
        ),
        http.get('/api/assignments/:id/explain', () => HttpResponse.json(mockSelectionExplanation)),
      ],
    },
  },
};
