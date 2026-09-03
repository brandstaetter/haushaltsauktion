import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { TodoistSection } from './TodoistSection';

vi.mock('../../api/client', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, body?: { error?: { code?: string; message?: string } }) {
      super(body?.error?.message ?? `HTTP ${status}`);
      this.status = status;
      this.code = body?.error?.code ?? 'UNKNOWN';
      this.name = 'ApiError';
    }
  },
}));

import { api } from '../../api/client';

const mockedApi = vi.mocked(api);

function renderSection(enabled: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodoistSection enabled={enabled} />
    </QueryClientProvider>,
  );
}

const connected = {
  connected: true,
  status: 'ACTIVE' as const,
  tokenHint: 'a3f9',
  projectId: null,
  projectName: null,
  triggers: { VOLUNTARY: true, RANDOM: true },
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
};

afterEach(() => {
  vi.resetAllMocks();
});

describe('TodoistSection', () => {
  it('renders nothing — and asks the server nothing — when the household has it off', () => {
    const { container } = renderSection(false);
    expect(container).toBeEmptyDOMElement();
    // The stronger half: a disabled household must not even probe the endpoint.
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('states both consequences before showing the token field (§31)', async () => {
    mockedApi.mockResolvedValue({ ...connected, connected: false, status: null, tokenHint: null });
    renderSection(true);

    // The one-way warning and the token's blast radius are the two things a
    // member cannot work out for themselves, so both must be on screen before
    // they can type a credential.
    await waitFor(() => expect(screen.getByText(de.todoist.oneWayWarning)).toBeInTheDocument());
    expect(screen.getByText(de.todoist.tokenScopeWarning)).toBeInTheDocument();

    const field = screen.getByLabelText(de.todoist.tokenLabel);
    // Never a plain text input: not shoulder-surfable, and not autofillable
    // into some unrelated field later.
    expect(field).toHaveAttribute('type', 'password');
  });

  it('shows only the four-character hint once connected, never a token', async () => {
    mockedApi.mockResolvedValue(connected);
    const { container } = renderSection(true);

    await waitFor(() => expect(screen.getByText(/a3f9/)).toBeInTheDocument());
    // The token entry field is gone entirely once connected — there is nothing
    // on screen that could render or re-expose a credential.
    expect(screen.queryByLabelText(de.todoist.tokenLabel)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/tdst-|[A-Za-z0-9]{32,}/);
  });

  it('explains that project selection is per-account, not a shared household project', async () => {
    mockedApi.mockResolvedValue(connected);
    renderSection(true);

    // Each member's Todoist account is separate (CLAUDE.md §36) — there is no
    // literal shared project. The hint must say so next to the selector,
    // since nothing else on screen would tell a member their choice is
    // account-local (intake "todoist-household-default-project").
    await waitFor(() => expect(screen.getByText(de.todoist.projectHint)).toBeInTheDocument());
  });

  it('surfaces a rejected token instead of failing silently', async () => {
    mockedApi.mockResolvedValue({ ...connected, status: 'INVALID_CREDENTIALS' });
    renderSection(true);

    // Silent permanent failure is the worst outcome: the member would believe
    // their chores were in Todoist when nothing is being delivered.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(de.todoist.invalidCredentials),
    );
  });
});
