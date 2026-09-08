import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { Layout } from './Layout';
import { mockSession } from '../../mocks/data';

/** Shared with `AsMember` and `MobileMember` — a plain MEMBER instead of the default fixture's ADMIN. */
const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Full-page app shell layout: header with logo/household name/notification bell,
 * main content area rendering via <Outlet />, and bottom navigation (member or admin tabs).
 * Since Layout renders its child via `<Outlet />` (not `children`), it needs a real route match
 * — a placeholder page is rendered at `/` matching the global MemoryRouter's default `initialEntries`.
 */
const meta = {
  title: 'Components/Layout',
  component: Layout,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (StoryComponent) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<StoryComponent />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof Layout>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Placeholder story content — Layout doesn't render anything itself,
 * so we provide a simple page to show in the Outlet.
 */
const PlaceholderPage = () => (
  <div style={{ padding: '1rem', fontFamily: 'system-ui' }}>
    <h1>Seite Inhalt</h1>
    <p>Das Layout-Chrome (Header mit Logo/Haushalt/Glocke, Navigation unten) ist die interessante Komponente.</p>
  </div>
);

/** Default: logged in as admin, standard desktop viewport. Layout shows header with notification bell and admin nav tabs. */
export const Default: Story = {
  render: () => <PlaceholderPage />,
};

/** Logged in as a plain member (not admin) — nav renders the member tab set without "Verwaltung". */
export const AsMember: Story = {
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};

/** iPhone 13 viewport, admin — mobile layout with compact nav and full app shell. */
export const MobileAdmin: Story = {
  globals: { viewport: iphone13Viewport },
};

/** iPhone 13 viewport, plain member — mobile layout without admin navigation. */
export const MobileMember: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: {
    msw: { handlers: [memberSessionHandler] },
  },
};

/** Loading state before session is resolved — shows a spinner. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/auth/me', async () => {
          // Simulate slow load
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return HttpResponse.json(mockSession);
        }),
      ],
    },
  },
};
