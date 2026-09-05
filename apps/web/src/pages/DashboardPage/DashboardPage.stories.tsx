import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { DashboardPage } from './DashboardPage';
import { Layout } from '../../components/Layout/Layout';
import { mockDashboard, mockSession } from '../../mocks/data';

/** Shared with `AsMember` and `MobileMember` — a plain MEMBER instead of the default fixture's ADMIN. */
const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Proof-of-concept for full-page stories: renders the real page against MSW
 * (`.storybook/preview.tsx`'s default handlers, `src/mocks/handlers.ts`)
 * instead of props, wrapped in the real `Layout` so header/nav/notification
 * chrome show up exactly as the app renders it — not just the page's own
 * markup. `Layout` renders its child via `<Outlet />`, not `children`, so it
 * needs an actual route match rather than being wrapped directly around
 * `Story` — matching `/` here against the global `MemoryRouter` decorator's
 * `initialEntries={['/']}` default (`.storybook/preview.tsx`).
 */
const meta = {
  title: 'Pages/DashboardPage',
  component: DashboardPage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof DashboardPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default household state from the shared MSW fixtures — no per-story override needed. */
export const Default: Story = {};

/** Household member with no assigned or available tasks — every section's empty state at once. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/dashboard', () =>
          HttpResponse.json({
            ...mockDashboard,
            me: { ...mockDashboard.me, assigned: [], available: [] },
            family: { ...mockDashboard.family, openTasks: [], recentlyCompleted: [] },
          }),
        ),
      ],
    },
  },
};

/** Dashboard fetch fails — the page's retry affordance. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/dashboard', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
      ],
    },
  },
};

/** Logged in as a plain member — `Layout`'s nav renders the member (not admin) tab set. */
export const AsMember: Story = {
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};

/** iPhone 13 viewport, logged in as ADMIN (the default fixture) — the primary mobile-first layout target (§19). */
export const MobileAdmin: Story = {
  globals: { viewport: iphone13Viewport },
};

/** iPhone 13 viewport, logged in as a plain MEMBER — same layout without the admin-only nav tab. */
export const MobileMember: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};
