import { describe, expect, it } from 'vitest';

import { de } from '../../strings/de';
import type { NotificationRow } from '../../api/types';
import { renderMessage } from './NotificationBell';

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
