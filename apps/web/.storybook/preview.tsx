import type { Preview } from '@storybook/react-vite';
import type { ReactElement } from 'react';

// The same global stylesheet `src/main.tsx` imports — it pulls in
// `styles/tokens.css` via `@import`, so components render with the app's
// real colors, typography, and spacing rather than Storybook's defaults.
import '../src/styles/global.css';
import { StringsProvider } from '../src/context/StringsContext';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    // Most components read German UI copy via `useStrings()`
    // (`src/context/StringsContext.tsx`); without this provider they throw.
    (Story): ReactElement => (
      <StringsProvider>
        <Story />
      </StringsProvider>
    ),
  ],
};

export default preview;
