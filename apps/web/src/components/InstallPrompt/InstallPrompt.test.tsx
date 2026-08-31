import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';
import { InstallPrompt } from './InstallPrompt';

const DISMISS_KEY = 'hh-install-prompt-dismissed';

function fireBeforeInstallPrompt(promptImpl: () => Promise<void> = vi.fn()) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  };
  event.prompt = promptImpl;
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  window.dispatchEvent(event);
  return event;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('zeigt nichts, solange kein beforeinstallprompt gefeuert wurde', () => {
    render(<InstallPrompt />);
    expect(screen.queryByText(de.install.prompt)).toBeNull();
  });

  it('zeigt das Banner nach beforeinstallprompt und ruft prompt() beim Installieren auf', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.fn().mockResolvedValue(undefined);
    render(<InstallPrompt />);

    fireBeforeInstallPrompt(promptSpy);

    expect(await screen.findByText(de.install.prompt)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.install.action }));
    expect(promptSpy).toHaveBeenCalledTimes(1);
  });

  it('verschwindet dauerhaft nach "Nicht jetzt" und erscheint bei einem Remount nicht erneut', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstallPrompt />);

    fireBeforeInstallPrompt();
    expect(await screen.findByText(de.install.prompt)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: de.install.dismiss }));
    expect(screen.queryByText(de.install.prompt)).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('true');

    unmount();
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    // Dismissal is read once on mount (before any listener is attached), so a
    // fresh mount after a dismissal never re-subscribes and the event has no effect.
    expect(screen.queryByText(de.install.prompt)).toBeNull();
  });
});
