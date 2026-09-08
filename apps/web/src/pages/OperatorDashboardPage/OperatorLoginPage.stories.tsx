import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { OperatorLoginPage } from './OperatorLoginPage';
import type { OperatorSessionDto } from '../../api/operatorTypes';

/**
 * `useOperatorSession` never fetches over the network — the operator's
 * logged-out state is the default cache value. This decorator seeds
 * the cache entry directly so the component's useEffect re-runs with
 * the intended session state before first render.
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
  title: 'Pages/OperatorLoginPage',
  component: OperatorLoginPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OperatorLoginPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Fills email and password fields and submits the form.
 * OperatorLoginPage uses hardcoded German labels, not the i18n strings.
 * Retries internal async queries to account for component render timing.
 */
async function submitOperatorLoginForm({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByLabelText('E-Mail'), 'operator@example.com');
  await userEvent.type(await canvas.findByLabelText('Passwort'), 'password123');
  await userEvent.click(await canvas.findByRole('button', { name: 'Anmelden' }));
}

/** Empty operator login form, ready for input. */
export const LoggedOut: Story = {
  decorators: [withOperatorSession(loggedOutSession)],
};

/** Invalid credentials error displayed (401). */
export const InvalidCredentials: Story = {
  decorators: [withOperatorSession(loggedOutSession)],
  parameters: {
    msw: {
      handlers: [
        http.post('/api/operator/login', () =>
          HttpResponse.json({ error: { message: 'E-Mail oder Passwort ist falsch' } }, { status: 401 }),
        ),
      ],
    },
  },
  play: submitOperatorLoginForm,
};

/** Rate limit error displayed (429). */
export const RateLimited: Story = {
  decorators: [withOperatorSession(loggedOutSession)],
  parameters: {
    msw: {
      handlers: [
        http.post('/api/operator/login', () =>
          HttpResponse.json(
            { error: { message: 'Zu viele Versuche. Bitte kurz warten.' } },
            { status: 429 },
          ),
        ),
      ],
    },
  },
  play: submitOperatorLoginForm,
};

/** Submit button in loading state — POST handler delays indefinitely. */
export const Loading: Story = {
  decorators: [withOperatorSession(loggedOutSession)],
  parameters: {
    msw: {
      handlers: [http.post('/api/operator/login', () => new Promise(() => {}))],
    },
  },
  play: submitOperatorLoginForm,
};

/** iPhone 13 viewport (390×844), logged out. */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  decorators: [withOperatorSession(loggedOutSession)],
};
