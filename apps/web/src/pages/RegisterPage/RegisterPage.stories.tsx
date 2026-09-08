import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { RegisterPage } from './RegisterPage';
import { de } from '../../strings/de';

/** Logged-out: the default fixture returns an authenticated ADMIN, which this screen redirects away from. */
const loggedOutHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ error: { message: 'Nicht angemeldet' } }, { status: 401 }),
);

const meta = {
  title: 'Pages/RegisterPage',
  component: RegisterPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RegisterPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Fills all registration fields and submits the form.
 * Retries internal async queries to account for component render timing.
 */
async function submitRegistrationForm({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByLabelText(de.register.setupToken), 'test-token');
  await userEvent.type(await canvas.findByLabelText(de.register.householdName), 'Test Household');
  await userEvent.type(await canvas.findByLabelText(de.register.adminDisplayName), 'Test Admin');
  await userEvent.type(await canvas.findByLabelText(de.register.adminEmail), 'admin@example.com');
  await userEvent.type(await canvas.findByLabelText(de.register.adminPassword), 'password123456');
  await userEvent.click(await canvas.findByRole('button', { name: de.register.submit }));
}

/** Empty registration form, ready for input. */
export const LoggedOut: Story = {
  parameters: {
    msw: { handlers: [loggedOutHandler] },
  },
};

/** Invalid setup token error displayed (403). */
export const SetupTokenError: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/register', () =>
          HttpResponse.json(
            { error: { message: 'Setup-Token ist ungültig', code: 'FORBIDDEN' } },
            { status: 403 },
          ),
        ),
      ],
    },
  },
  play: submitRegistrationForm,
};

/** Email already registered error displayed (409). */
export const EmailTakenError: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/register', () =>
          HttpResponse.json(
            { error: { message: 'E-Mail ist bereits registriert', code: 'EMAIL_ALREADY_REGISTERED' } },
            { status: 409 },
          ),
        ),
      ],
    },
  },
  play: submitRegistrationForm,
};

/** Setup token not found error displayed (404). */
export const TokenUnavailable: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/register', () =>
          HttpResponse.json(
            { error: { message: 'Setup-Token nicht gefunden', code: 'NOT_FOUND' } },
            { status: 404 },
          ),
        ),
      ],
    },
  },
  play: submitRegistrationForm,
};

/** Rate limit error displayed (429). */
export const RateLimited: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/register', () =>
          HttpResponse.json(
            { error: { message: 'Zu viele Versuche', code: 'RATE_LIMITED' } },
            { status: 429 },
          ),
        ),
      ],
    },
  },
  play: submitRegistrationForm,
};

/** Submit button in loading state — POST handler delays indefinitely. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        loggedOutHandler,
        http.post('/api/register', () => new Promise(() => {})),
      ],
    },
  },
  play: submitRegistrationForm,
};

/** iPhone 13 viewport (390×844), logged out. */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: { handlers: [loggedOutHandler] },
  },
};
