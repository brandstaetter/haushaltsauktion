import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import type { NotificationRow } from '../../api/types';
import { NotificationBell, renderMessage } from './NotificationBell';

vi.mock('../../api/client', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

import { api } from '../../api/client';

const mockedApi = vi.mocked(api);

/** Eine Benachrichtigung, wie `listNotifications` sie liefert. */
function notificationFixture(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'notif-1',
    type: 'TASK_ASSIGNED',
    payload: {},
    taskInstanceId: 'instance-1',
    taskTitle: 'Bad putzen',
    readAt: null,
    createdAt: '2026-08-30T12:00:00.000Z',
    ...overrides,
  };
}

describe('renderMessage', () => {
  it('interpoliert den Aufgabentitel für eine Zufallszuweisung', () => {
    const message = renderMessage(
      de,
      notificationFixture({ type: 'TASK_ASSIGNED', payload: { value: 6 } }),
    );
    expect(message).toBe('Dir wurde „Bad putzen“ zufällig zugewiesen — aktueller Wert 6');
  });

  it('interpoliert den Aufgabentitel für eine freiwillige Übernahme', () => {
    const message = renderMessage(
      de,
      notificationFixture({ type: 'TASK_TAKEN', taskTitle: 'Bad putzen', payload: { value: 6 } }),
    );
    expect(message).toBe('Du hast „Bad putzen“ übernommen — aktueller Wert 6');
  });

  it('interpoliert Titel und Namen für eine Erledigung', () => {
    const message = renderMessage(
      de,
      notificationFixture({
        type: 'TASK_COMPLETED',
        taskTitle: 'Müll hinausbringen',
        payload: { by: 'Arthur' },
      }),
    );
    expect(message).toBe('„Müll hinausbringen“ wurde von Arthur erledigt');
  });

  it('interpoliert alten und neuen Wert für eine Wertsteigerung', () => {
    const message = renderMessage(
      de,
      notificationFixture({
        type: 'TASK_VALUE_INCREASED',
        taskTitle: 'Staubsaugen',
        payload: { from: 4, to: 6 },
      }),
    );
    expect(message).toBe('„Staubsaugen“: Wert ist von 4 auf 6 gestiegen');
  });

  it('deckt jeden von de.notifications.types definierten Typ ab', () => {
    for (const type of Object.keys(de.notifications.types)) {
      const message = renderMessage(de, notificationFixture({ type }));
      // Ein nicht gefundenes Template fällt auf den rohen Typ-String zurück
      // (siehe renderMessage) — das darf für einen bekannten Typ nie passieren.
      expect(message).not.toBe(type);
    }
  });

  it('fällt bei unbekanntem Typ auf den rohen Typ-String zurück statt zu crashen', () => {
    const message = renderMessage(de, notificationFixture({ type: 'SOME_FUTURE_TYPE' }));
    expect(message).toBe('SOME_FUTURE_TYPE');
  });
});

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotificationBell />} />
          <Route path="/aufgaben/:id" element={<p>Aufgabendetail geöffnet</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('navigiert zur Aufgabe, wenn eine Benachrichtigung mit taskInstanceId angeklickt wird', async () => {
    const user = userEvent.setup();
    mockedApi.mockImplementation(async (path: string) => {
      if (path === '/notifications?limit=30') {
        return { items: [notificationFixture()], unreadCount: 1, nextCursor: null };
      }
      if (path === '/notifications/notif-1/read') return {};
      throw new Error(`unerwarteter Aufruf: ${path}`);
    });

    renderBell();

    // One unread item swaps the trigger's accessible name from the plain
    // title to the "N ungelesen" badge (NotificationBell.tsx's aria-label) —
    // `findByRole` waits for the notifications query to resolve first.
    await user.click(await screen.findByRole('button', { name: '1 ungelesen' }));
    await user.click(await screen.findByText('Bad putzen', { exact: false }));

    expect(await screen.findByText('Aufgabendetail geöffnet')).toBeInTheDocument();
  });
});
