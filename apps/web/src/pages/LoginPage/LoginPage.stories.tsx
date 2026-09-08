import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { LoginPage } from './LoginPage';
import { de } from '../../strings/de';

/** Logged-out: the default fixture returns an authenticated ADMIN, which this screen redirects away from. */
const loggedOutHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ error: { message: 'Nicht angemeldet' } }, { status: 401 }),
);

const meta = {
  title: 'Pages/LoginPage',
  component: LoginPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LoginPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Fills email and password fields and submits the form.
 * Retries internal async queries to account for component render timing.
 */
async function submitLoginForm({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByLabelText(de.login.email), 'test@example.com');
  await userEvent.type(await canvas.findByLabelText(de.login.password), 'password123');
  await userEvent.click(await canvas.findByRole('button', { name: de.login.submit }));
}

/** Empty login form, ready for input. */
export const LoggedOut: Story = {
  parameters: {
    msw: { handlers: [loggedOutHandler] },
  },
};

/** Invalid credentials error displayed (401). */
export const InvalidCredentials: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/auth/login', () =>
          HttpResponse.json({ error: { message: 'Ungültige Anmeldedaten' } }, { status: 401 }),
        ),
      ],
    },
  },
  play: submitLoginForm,
};

/** Rate limit error displayed (429). */
export const RateLimited: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/auth/login', () =>
          HttpResponse.json({ error: { message: 'Zu viele Versuche' } }, { status: 429 }),
        ),
      ],
    },
  },
  play: submitLoginForm,
};

/** Submit button in loading state — POST handler delays indefinitely. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/auth/login', () => new Promise(() => {})),
      ],
    },
  },
  play: submitLoginForm,
};

/** iPhone 13 viewport (390×844), logged out. */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: { handlers: [loggedOutHandler] },
  },
};
