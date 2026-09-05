import type { Preview } from '@storybook/react-vite';
import { useState, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { INITIAL_VIEWPORTS } from 'storybook/viewport';

// The same global stylesheet `src/main.tsx` imports — it pulls in
// `styles/tokens.css` via `@import`, so components render with the app's
// real colors, typography, and spacing rather than Storybook's defaults.
import '../src/styles/global.css';
import { StringsProvider } from '../src/context/StringsContext';
import { handlers } from '../src/mocks/handlers';

/**
 * `defaultHandlers` are baked into the worker itself (not passed via
 * `parameters.msw`) so a story's own `parameters.msw.handlers` — resolved by
 * `mswLoader` via `worker.use(...)` — only has to list what it overrides.
 * `worker.use()` prepends, and `mswLoader`'s per-story `worker.resetHandlers()`
 * (no arguments) reverts to exactly these, not to nothing — so an
 * unmatched-by-override endpoint (e.g. `/api/auth/me` while only
 * `/api/dashboard` is overridden) still falls through to its default instead
 * of a raw 404. Passing the defaults via `parameters.msw` globally instead
 * would NOT work: a story-level `parameters.msw` replaces that parameter
 * wholesale rather than merging with it, silently dropping every default
 * the story didn't re-list.
 */
function setup() {
  const worker = setupWorker(...handlers);
  void worker.start({ onUnhandledRequest: 'bypass' });
  return worker;
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Storybook 10's toolbar defaults to a generic Small/Large mobile + Tablet
    // set, not the named-device list — a story that pins `globals.viewport`
    // to a device key like `iphone13` needs that key registered here or the
    // addon silently falls back to whatever the toolbar's default already was.
    viewport: { options: INITIAL_VIEWPORTS },
  },
  loaders: [mswLoader(setup)],
  decorators: [
    // Most components read German UI copy via `useStrings()`
    // (`src/context/StringsContext.tsx`); without this provider they throw.
    (Story): ReactElement => (
      <StringsProvider>
        <Story />
      </StringsProvider>
    ),
    // A fresh `QueryClient` per story (lazy `useState` init, so it survives
    // re-renders but not a story switch) — `retry: false` so a handler a
    // story forgot to mock fails fast instead of retrying for seconds before
    // the page's error state shows up.
    (Story): ReactElement => {
      const [client] = useState(
        () =>
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          }),
      );
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
    // Pages read route params/navigation (`useNavigate`, `useParams`, `<Link>`)
    // via `react-router` — a story sets its own starting URL with
    // `parameters.reactRouter.initialEntries` if `/` isn't right for it.
    (Story, { parameters }): ReactElement => (
      <MemoryRouter
        initialEntries={
          (parameters.reactRouter?.initialEntries as string[] | undefined) ?? ['/']
        }
      >
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default preview;
