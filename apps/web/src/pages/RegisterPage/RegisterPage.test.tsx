import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { RegisterPage } from './RegisterPage';

vi.mock('../../api/client', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

import { api } from '../../api/client';

const mockedApi = vi.mocked(api);

/** Session, wie `GET /auth/me` sie liefert, wenn niemand angemeldet ist. */
const loggedOutSession = {
  user: null,
  member: null,
  household: null,
  role: null,
  csrfToken: null,
};

/** Session-Antwort, wie `POST /register` sie bei Erfolg liefert (§ SessionDto-Form). */
function registeredSession() {
  return {
    user: { id: 'user-1', email: 'neu@demo.local', displayName: 'Neu' },
    member: { id: 'member-1', displayName: 'Neu', role: 'ADMIN' },
    household: { id: 'household-1', name: 'Neue Familie', timezone: 'Europe/Vienna' },
    csrfToken: 'csrf-token-1',
  };
}

function renderRegisterPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/registrieren']}>
        <Routes>
          <Route path="/registrieren" element={<RegisterPage />} />
          <Route path="/" element={<div>DASHBOARD</div>} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(de.register.setupToken), 'correct-token');
  await user.type(screen.getByLabelText(de.register.householdName), 'Neue Familie');
  await user.type(screen.getByLabelText(de.register.adminDisplayName), 'Neu');
  await user.type(screen.getByLabelText(de.register.adminEmail), 'neu@demo.local');
  await user.type(screen.getByLabelText(de.register.adminPassword), 'sicheres-passwort');
  await user.click(screen.getByRole('button', { name: de.register.submit }));
}

describe('RegisterPage', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('navigiert nach erfolgreicher Registrierung wie nach einem erfolgreichen Login', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return loggedOutSession;
      if (path === '/register') return registeredSession();
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderRegisterPage();
    await fillForm();

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
  });

  it('zeigt die richtige Meldung bei falschem Setup-Token', async () => {
    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/auth/me') return loggedOutSession;
      if (path === '/register' && options?.method === 'POST') {
        throw Object.assign(new Error('Setup-Token ist ungültig.'), {
          status: 403,
          code: 'FORBIDDEN',
        });
      }
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderRegisterPage();
    await fillForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(de.register.errors.forbidden);
    expect(screen.queryByText('DASHBOARD')).toBeNull();
  });
});
