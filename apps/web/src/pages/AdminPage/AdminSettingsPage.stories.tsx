import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { cloneDefaultConfig } from '@haushaltsauktion/shared';
import { AdminSettingsPage } from './AdminSettingsPage';
import { Layout } from '../../components/Layout/Layout';
import { mockSession } from '../../mocks/data';
import type { AdminConfigDto } from '../../api/types';

/** Shared with `AsMember` — a plain MEMBER instead of the default fixture's ADMIN. */
const memberSessionHandler = http.get('/api/auth/me', () =>
  HttpResponse.json({ ...mockSession, role: 'MEMBER', member: { ...mockSession.member!, role: 'MEMBER' } }),
);

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * Built per call, never shared. `AdminConfigDto.values` is a deep object, so a
 * module-level fixture that stories mutate in place (`config.values.buyout.enabled = false`)
 * would leak that change into every later story in the same session — the
 * config is fetched once per story but the fixture object would not be rebuilt.
 * A factory keeps each story's response independent, which the "deterministic
 * and self-contained" requirement depends on.
 */
function adminConfigFixture(overrides: Partial<AdminConfigDto> = {}): AdminConfigDto {
  return {
    version: 1,
    values: cloneDefaultConfig(),
    defaults: cloneDefaultConfig(),
    updatedAt: new Date('2026-09-07T10:00:00Z').toISOString(),
    updatedBy: { id: 'member-elke', displayName: 'Elke' },
    integrationsAvailable: { todoist: true },
    notificationsAvailable: { push: true },
    ...overrides,
  };
}

/** Every story needs the config to load before anything else is visible. */
const configLoads = http.get('/api/admin/config', () => HttpResponse.json(adminConfigFixture()));

/** `de.admin.save` — the label the save button actually renders (`src/strings/de.ts`). */
const SAVE_LABEL = 'Speichern';

/** Clicks save, so the stories below actually reach the state their name claims. */
async function clickSave(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: SAVE_LABEL }));
}

/**
 * The household rulebook form (§17): every configurable parameter in one page,
 * rendered against MSW inside the real `Layout` chrome at its real route so the
 * admin tab bar highlights "Einstellungen".
 */
const meta = {
  title: 'Pages/Admin/AdminSettingsPage',
  component: AdminSettingsPage,
  parameters: {
    layout: 'fullscreen',
    reactRouter: { initialEntries: ['/verwaltung/einstellungen'] },
  },
  decorators: [
    (Story) => (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/verwaltung/einstellungen" element={<Story />} />
        </Route>
      </Routes>
    ),
  ],
} satisfies Meta<typeof AdminSettingsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Stock configuration — the §39 defaults, every section collapsed to its default value. */
export const Default: Story = {
  parameters: { msw: { handlers: [configLoads] } },
};

/** Config fetch never resolves — the loading affordance. */
export const Loading: Story = {
  parameters: {
    msw: { handlers: [http.get('/api/admin/config', () => new Promise(() => {}))] },
  },
};

/** Config fetch fails — the retry affordance rather than an empty form. */
export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/config', () =>
          HttpResponse.json({ error: { message: 'Konfiguration konnte nicht geladen werden' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/**
 * A household that has moved off the defaults: buyout switched off, point decay
 * on, pure-random assignment. One story rather than one per key, because the
 * point is the form's conditional sub-fields appearing and disappearing
 * together — a disabled buyout hides its cost-strategy controls, an enabled
 * decay reveals its interval and floor.
 */
export const NonDefaultConfig: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/config', () => {
          const config = adminConfigFixture({ version: 5, updatedAt: new Date('2026-09-08T06:30:00Z').toISOString() });
          config.values.buyout.enabled = false;
          config.values.assignment.strategy = 'PURE_RANDOM';
          config.values.points.decay.enabled = true;
          return HttpResponse.json(config);
        }),
      ],
    },
  },
};

/** Save is in flight — `play` clicks "Speichern" against a PUT that never resolves, so the button holds its loading state. */
export const SaveInFlight: Story = {
  parameters: {
    msw: {
      handlers: [configLoads, http.put('/api/admin/config', () => new Promise(() => {}))],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSave(canvasElement);
  },
};

/** Save rejected on a version conflict — `play` clicks "Speichern" so the error message is genuinely rendered, not just mocked. */
export const SaveFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        configLoads,
        http.put('/api/admin/config', () =>
          HttpResponse.json({ error: { message: 'Konfigurationsversion stimmt nicht überein' } }, { status: 409 }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSave(canvasElement);
  },
};

/** Save accepted — `play` clicks "Speichern" and the confirmation ("Konfiguration gespeichert.") appears. */
export const SaveSucceeded: Story = {
  parameters: {
    msw: {
      handlers: [
        configLoads,
        http.put('/api/admin/config', () =>
          HttpResponse.json({ version: 2, values: cloneDefaultConfig(), changeSummary: [] }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await clickSave(canvasElement);
  },
};

/** A plain MEMBER on an admin route — the permission gate, not the form. */
export const AsMember: Story = {
  parameters: { msw: { handlers: [memberSessionHandler, configLoads] } },
};

/** The full rulebook form at 390px — the densest responsive case in the app (§19). */
export const Mobile: Story = {
  globals: { viewport: iphone13Viewport },
  parameters: { msw: { handlers: [configLoads] } },
};
