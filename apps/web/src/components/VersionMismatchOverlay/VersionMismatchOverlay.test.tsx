import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkVersionHeader } from '../../api/versionCheck';
import { de } from '../../strings/de';

// vi.mock factories are hoisted above all other module code, so any
// variable they reference must come from vi.hoisted() — a plain top-level
// const would hit the TDZ at hoist time.
const { updateServiceWorker } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}));

// `virtual:pwa-register/react` only exists once vite-plugin-pwa's Vite
// plugin runs (vite.config.ts) — vitest.config.ts deliberately omits that
// plugin (see its own comment), so the module must be mocked here.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

const { VersionMismatchOverlay } = await import('./VersionMismatchOverlay');

function mismatchedResponse(): Response {
  return new Response(null, { headers: { 'x-app-version': 'deadbeef1234' } });
}

describe('VersionMismatchOverlay', () => {
  const reload = vi.fn();

  beforeEach(() => {
    updateServiceWorker.mockClear();
    reload.mockClear();
    // jsdom's `window.location` is non-configurable, so `vi.spyOn` can't
    // redefine `reload` on it directly — replace the whole object instead.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    });
  });

  it('zeigt nichts, solange keine Versions-Abweichung erkannt wurde', () => {
    render(<VersionMismatchOverlay />);
    expect(screen.queryByText(de.update.overlayTitle)).toBeNull();
  });

  it('zeigt das blockierende Overlay ohne Dismiss-Möglichkeit, sobald eine Versions-Abweichung erkannt wird', async () => {
    render(<VersionMismatchOverlay />);

    act(() => {
      checkVersionHeader(mismatchedResponse());
    });

    expect(await screen.findByText(de.update.overlayTitle)).toBeInTheDocument();
    expect(screen.getByText(de.update.overlayMessage)).toBeInTheDocument();
    // No close/dismiss control anywhere — this overlay offers no choice.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('versucht updateServiceWorker(true) und erzwingt danach einen Reload', async () => {
    render(<VersionMismatchOverlay />);

    act(() => {
      checkVersionHeader(mismatchedResponse());
    });
    await screen.findByText(de.update.overlayTitle);

    await waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
