import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { de } from '../../strings/de';

// vi.mock factories are hoisted above all other module code, so any
// variable they reference must come from vi.hoisted() — a plain top-level
// const would hit the TDZ at hoist time.
const { updateServiceWorker, state } = vi.hoisted(() => ({
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
  state: { initialNeedRefresh: false },
}));

// `virtual:pwa-register/react` only exists once vite-plugin-pwa's Vite
// plugin runs (vite.config.ts) — vitest.config.ts deliberately omits that
// plugin (see its own comment), so the module must be mocked here.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => {
    const [needRefresh, setNeedRefresh] = useState(state.initialNeedRefresh);
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    };
  },
}));

const { UpdatePrompt } = await import('./UpdatePrompt');

describe('UpdatePrompt', () => {
  beforeEach(() => {
    updateServiceWorker.mockClear();
  });

  it('zeigt nichts, solange kein Update ansteht', () => {
    state.initialNeedRefresh = false;
    render(<UpdatePrompt />);
    expect(screen.queryByText(de.update.prompt)).toBeNull();
  });

  it('zeigt das Banner bei needRefresh und lädt bei Klick per updateServiceWorker(true) neu', async () => {
    state.initialNeedRefresh = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    expect(screen.getByText(de.update.prompt)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: de.update.action }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('verschwindet nach "Später", ohne updateServiceWorker aufzurufen', async () => {
    state.initialNeedRefresh = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: de.update.dismiss }));
    expect(screen.queryByText(de.update.prompt)).toBeNull();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });
});
