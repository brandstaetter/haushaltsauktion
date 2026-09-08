import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { cloneDefaultConfig, toPublicConfig } from '@haushaltsauktion/shared';
import { AccountPage } from './AccountPage';
import { Layout } from '../../components/Layout/Layout';
import { mockSession } from '../../mocks/data';

/**
 * Builds the real `{ version, values }` envelope GET /config/public returns.
 * Allows toggling integrations and notifications for different story states.
 */
function publicConfigFixture(overrides?: {
  todoistEnabled?: boolean;
  pushEnabled?: boolean;
}) {
  const config = cloneDefaultConfig();
  config.integrations.todoist.enabled = overrides?.todoistEnabled === true;
  config.notifications.pushEnabled = overrides?.pushEnabled === true;
  const values = toPublicConfig(config);
  return { version: 1, values };
}

/** Member role variant: MEMBER (not ADMIN) — hides admin entry button. */
const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

const meta = {
  title: 'Pages/AccountPage',
  component: AccountPage,
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
} satisfies Meta<typeof AccountPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default state: ADMIN logged in, all sections loaded, both integrations
 * enabled (Todoist + Push). Shows full account info, balance, household,
 * and navigation to ledger, rewards shop, and admin settings.
 */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: true, pushEnabled: true })),
        ),
      ],
    },
  },
};

/**
 * Page data is still loading — spinner visible while member and config queries
 * resolve. All sections wait for their respective data.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/members/me', () => new Promise(() => {})),
        http.get('/api/config/public', () => new Promise(() => {})),
      ],
    },
  },
};

/**
 * Logged in as MEMBER (not ADMIN) — admin settings button is hidden.
 * Rewards shop remains visible (not admin-only).
 */
export const AsMember: Story = {
  parameters: {
    msw: {
      handlers: [
        memberSessionHandler,
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: true, pushEnabled: true })),
        ),
      ],
    },
  },
};

/**
 * Both Todoist and Push integrations are disabled by the household admin.
 * No PushSection or TodoistSection rendered — only core account card and logout.
 */
export const IntegrationsDisabled: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: false, pushEnabled: false })),
        ),
      ],
    },
  },
};

/**
 * Only Todoist is enabled; Push is disabled.
 * PushSection should not render; TodoistSection should.
 */
export const TodoistEnabledPushDisabled: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: true, pushEnabled: false })),
        ),
      ],
    },
  },
};

/**
 * Only Push is enabled; Todoist is disabled.
 * TodoistSection should not render; PushSection should.
 */
export const PushEnabledTodoistDisabled: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: false, pushEnabled: true })),
        ),
      ],
    },
  },
};

/**
 * iPhone 13 viewport — account page optimized for mobile.
 * Card layout vertical, buttons full-width, readable on small screen.
 */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/config/public', () =>
          HttpResponse.json(publicConfigFixture({ todoistEnabled: true, pushEnabled: true })),
        ),
      ],
    },
  },
};
