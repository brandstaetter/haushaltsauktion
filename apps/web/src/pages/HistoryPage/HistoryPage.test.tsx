import { describe, expect, it } from 'vitest';

import { de } from '../../strings/de';
import { renderEvent } from './HistoryPage';

function event(
  type: string,
  overrides: Partial<{
    taskTitle: string;
    member: { displayName: string } | null;
    payload: Record<string, unknown>;
  }> = {},
) {
  return {
    type,
    taskTitle: 'Bad putzen',
    member: null,
    payload: {},
    ...overrides,
  };
}

describe('renderEvent', () => {
  it('names the task for a random assignment with no volunteer', () => {
    expect(renderEvent(de, event('NO_VOLUNTEER'))).toBe('Keine freiwillige Übernahme für Bad putzen');
  });

  it('names both the task and the member for a random draw', () => {
    expect(
      renderEvent(de, event('RANDOMLY_ASSIGNED', { member: { displayName: 'Elke' } })),
    ).toBe('Zufallszuweisung von Bad putzen an Elke');
  });

  it('renders the actual new value after a buyout-driven reset, not an empty placeholder', () => {
    expect(
      renderEvent(de, event('VALUE_RESET', { payload: { from: 6, to: 9, strategy: 'MULTIPLIER' } })),
    ).toBe('Aufgabenwert von Bad putzen auf 9 zurückgesetzt');
  });

  it('still renders the task for events that already carried it', () => {
    expect(
      renderEvent(de, event('OFFERED', { payload: { value: 4 } })),
    ).toBe('Bad putzen wurde angeboten — Wert 4');
  });

  it('falls back to "type: task" for an unknown event type', () => {
    expect(renderEvent(de, event('SOMETHING_NEW'))).toBe('SOMETHING_NEW: Bad putzen');
  });
});
