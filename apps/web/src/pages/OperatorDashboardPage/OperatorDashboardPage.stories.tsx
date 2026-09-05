import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { OperatorDashboardPage } from './OperatorDashboardPage';
import { mockOperatorSession } from '../../mocks/data';
import type { OperatorSessionDto } from '../../api/operatorTypes';

/**
 * `useOperatorSession` (`api/operatorHooks.ts`) never issues a request — the
 * operator's logged-in state exists only in whatever a successful login
 * wrote into the shared `QueryClient` cache (query key `['operator',
 * 'session']`, `enabled: false`). There's no endpoint to mock for the
 * "logged in" branch, so this decorator seeds that cache entry directly
 * instead, synchronously during render (before `OperatorDashboardPage`'s own
 * `useQuery` call reads it) so there's no logged-out flash on first paint.
 */
function withOperatorSession(session: OperatorSessionDto) {
  return function OperatorSessionDecorator(Story: () => ReactElement): ReactElement {
    const qc = useQueryClient();
    qc.setQueryData(['operator', 'session'], session);
    return <Story />;
  };
}

const loggedOutSession: OperatorSessionDto = { operator: null, csrfToken: null };

const meta = {
  title: 'Pages/OperatorDashboardPage',
  component: OperatorDashboardPage,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OperatorDashboardPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Not logged in (also what a page reload leaves you with — no session-restore check, see the hook's doc). */
export const LoggedOut: Story = {
  decorators: [withOperatorSession(loggedOutSession)],
};

/** Logged in, metrics loaded from the shared MSW fixtures. */
export const Default: Story = {
  decorators: [withOperatorSession(mockOperatorSession)],
};

/** Logged in, but `GET /api/operator/metrics` fails. */
export const LoadFailed: Story = {
  decorators: [withOperatorSession(mockOperatorSession)],
  parameters: {
    msw: {
      handlers: [
        http.get('/api/operator/metrics', () =>
          HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
        ),
      ],
    },
  },
};
