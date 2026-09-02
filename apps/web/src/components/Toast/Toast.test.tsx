import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rendert nichts ohne Nachricht', () => {
    const { container } = render(<Toast message={null} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt die Nachricht als role="status" an und schließt sich selbst nach Ablauf der Dauer', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Gespeichert." onDismiss={onDismiss} duration={1000} />);

    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert.');
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('verwendet role="alert" für die error-Variante', () => {
    render(<Toast message="Das hat nicht funktioniert." variant="error" onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Das hat nicht funktioniert.');
  });

  it('schließt sich sofort per Klick auf den Schließen-Button', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Toast message="Gespeichert." onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('startet den Auto-Dismiss-Timer nicht bei jedem Re-Render mit neuer onDismiss-Closure neu', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Toast message="Gespeichert." onDismiss={() => onDismiss('first')} duration={1000} />,
    );

    vi.advanceTimersByTime(600);
    // A caller re-rendering with a fresh inline closure (e.g. typing into an
    // unrelated filter input in the same component) must not push the
    // dismissal out further.
    rerender(<Toast message="Gespeichert." onDismiss={() => onDismiss('second')} duration={1000} />);
    vi.advanceTimersByTime(400);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('second');
  });
});
