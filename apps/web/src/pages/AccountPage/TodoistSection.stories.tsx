import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { TodoistSection } from './TodoistSection';
import type { TodoistIntegrationDto } from '../../api/hooks';

/**
 * Todoist integration section fixtures.
 * Shows states: disabled, loading, not connected, connected, error states.
 */

/** Connection response when not yet connected — empty token field. */
const notConnected: TodoistIntegrationDto = {
  connected: false,
  status: null,
  tokenHint: null,
  projectId: null,
  projectName: null,
  triggers: { VOLUNTARY: true, RANDOM: true },
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
};

/** Connection response when connected and working. */
const connected: TodoistIntegrationDto = {
  connected: true,
  status: 'ACTIVE',
  tokenHint: 'a3f9',
  projectId: null,
  projectName: null,
  triggers: { VOLUNTARY: true, RANDOM: true },
  lastSuccessAt: new Date(Date.now() - 600_000).toISOString(),
  lastErrorAt: null,
  lastErrorCode: null,
};

/** Connected but token is invalid or expired. */
const invalidCredentials: TodoistIntegrationDto = {
  connected: true,
  status: 'INVALID_CREDENTIALS',
  tokenHint: 'x7y2',
  projectId: null,
  projectName: null,
  triggers: { VOLUNTARY: true, RANDOM: true },
  lastSuccessAt: null,
  lastErrorAt: new Date().toISOString(),
  lastErrorCode: 'UNAUTHORIZED',
};

/** Connected with a specific Todoist project selected. */
const connectedWithProject: TodoistIntegrationDto = {
  ...connected,
  projectId: 'todoist-proj-123',
  projectName: 'Hausaufgaben',
};

/** Helper to enter a token and click the connect button. */
async function enterTokenAndConnect(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  const tokenInput = await canvas.findByLabelText('Persönliches API-Token');
  await userEvent.type(tokenInput, 'test-token-12345');
  await userEvent.click(await canvas.findByRole('button', { name: 'Verbinden' }));
}

/** Helper to click the test button. */
async function clickTestButton(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Verbindung testen' }));
}

/** Helper to click the disconnect button (after confirming in the confirmation dialog). */
async function clickDisconnectButton(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Trennen' }));
}

const meta = {
  title: 'Pages/AccountPage/TodoistSection',
  component: TodoistSection,
} satisfies Meta<typeof TodoistSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Feature is disabled at the household level — the component renders nothing.
 * No API call is made to /integrations/todoist.
 */
export const Disabled: Story = {
  args: { enabled: false },
};

/**
 * Feature is enabled but integration status is still loading from the server.
 * Shows a spinner.
 */
export const Loading: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () => new Promise(() => {})),
      ],
    },
  },
};

/**
 * Feature is enabled, but the member has not yet connected their Todoist account.
 * Shows the token input field with warnings about scope and one-way nature (§31).
 * The intro text and warnings must appear before the input so members know
 * the consequences before entering credentials.
 */
export const NotConnected: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(notConnected),
        ),
      ],
    },
  },
};

/**
 * Member is connected to Todoist. Shows the token hint (last 4 chars, …a3f9),
 * project selector (currently set to Inbox), trigger checkboxes for
 * VOLUNTARY and RANDOM task syncing, and Test + Disconnect buttons.
 * The token field is gone — no credentials are displayed or stored client-side.
 */
export const Connected: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [
              { id: 'proj-1', name: 'Hausaufgaben' },
              { id: 'proj-2', name: 'Einkaufen' },
              { id: 'proj-3', name: 'Persönlich' },
            ],
          }),
        ),
      ],
    },
  },
};

/**
 * Connected with a specific project already selected (not Inbox).
 * Shows the selected project name in the dropdown.
 */
export const ConnectedWithProject: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connectedWithProject),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [
              { id: 'todoist-proj-123', name: 'Hausaufgaben' },
              { id: 'proj-2', name: 'Einkaufen' },
              { id: 'proj-3', name: 'Persönlich' },
            ],
          }),
        ),
      ],
    },
  },
};

/**
 * Connected but the stored token has become invalid or expired.
 * Shows an alert with "Todoist-Anmeldedaten ungültig" message.
 * The member must disconnect and reconnect with a fresh token.
 */
export const InvalidCredentials: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(invalidCredentials),
        ),
      ],
    },
  },
};

/**
 * Integration is disabled at the server level (e.g., admin turned it off globally).
 * The status field shows 'DISABLED'.
 */
export const ServerDisabled: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json({ ...connected, status: 'DISABLED' }),
        ),
      ],
    },
  },
};

/**
 * Member attempts to connect with a token. The connection fails
 * (e.g., invalid token, network error). Error message is displayed.
 * The `play` function enters a token and clicks connect to trigger the error.
 */
export const ConnectError: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(notConnected),
        ),
        http.put('/api/integrations/todoist', () =>
          HttpResponse.json(
            { error: { message: 'Ungültiges Todoist-Token' } },
            { status: 400 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await enterTokenAndConnect(canvasElement);
  },
};

/**
 * Test connection succeeds. Shows a success message with project count.
 * The `play` function clicks the test button to trigger the successful response.
 */
export const TestSuccess: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [
              { id: 'proj-1', name: 'Hausaufgaben' },
              { id: 'proj-2', name: 'Einkaufen' },
            ],
          }),
        ),
        http.post('/api/integrations/todoist/test', () =>
          HttpResponse.json({ ok: true, projectCount: 2 }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickTestButton(canvasElement);
  },
};

/**
 * Test connection fails (token became invalid, network error, etc.).
 * Error message is displayed beneath the Test button. The `play` function
 * clicks the test button to trigger the error response.
 */
export const TestError: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [{ id: 'proj-1', name: 'Hausaufgaben' }],
          }),
        ),
        http.post('/api/integrations/todoist/test', () =>
          HttpResponse.json(
            { error: { message: 'Verbindung zu Todoist fehlgeschlagen' } },
            { status: 500 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickTestButton(canvasElement);
  },
};

/**
 * Disconnect is in progress (button shows loading state).
 * The server never responds, so the loading UI persists. The `play` function
 * clicks the disconnect button (confirming in the confirmation dialog) to
 * trigger the pending mutation.
 */
export const DisconnectLoading: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [{ id: 'proj-1', name: 'Hausaufgaben' }],
          }),
        ),
        http.delete('/api/integrations/todoist', () => new Promise(() => {})),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickDisconnectButton(canvasElement);
  },
};

/**
 * Project selector shows loading state while projects are being fetched.
 */
export const ProjectsLoading: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          new Promise(() => {}),
        ),
      ],
    },
  },
};

/**
 * Triggers with different settings: only VOLUNTARY enabled, RANDOM disabled.
 * Checkboxes reflect this state and can be toggled.
 */
export const SelectiveTriggersEnabled: Story = {
  args: { enabled: true },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json({
            ...connected,
            triggers: { VOLUNTARY: true, RANDOM: false },
          }),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [{ id: 'proj-1', name: 'Hausaufgaben' }],
          }),
        ),
      ],
    },
  },
};

/**
 * iPhone 13 viewport — section is readable and usable on mobile.
 * Token input, project selector, and checkboxes are all mobile-friendly.
 */
export const Mobile: Story = {
  args: { enabled: true },
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/integrations/todoist', () =>
          HttpResponse.json(connected),
        ),
        http.get('/api/integrations/todoist/projects', () =>
          HttpResponse.json({
            projects: [
              { id: 'proj-1', name: 'Hausaufgaben' },
              { id: 'proj-2', name: 'Einkaufen' },
            ],
          }),
        ),
      ],
    },
  },
};
