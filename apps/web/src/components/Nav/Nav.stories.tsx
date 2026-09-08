import type { Meta, StoryObj } from '@storybook/react-vite';
import { Nav } from './Nav';

/** iPhone 13 (390×844) — see `INITIAL_VIEWPORTS` in `storybook/viewport`, built into Storybook's core toolbar. */
const iphone13Viewport = { value: 'iphone13', isRotated: false };

/**
 * The bottom navigation bar. It has exactly three distinct renders, and the
 * stories below are one per render rather than one per route:
 *
 * - `role !== 'ADMIN'` → the three main tabs (Start, Verlauf, Ich).
 * - `role === 'ADMIN'` outside `/verwaltung` → the same plus "Verwaltung" (4 tabs).
 * - `role === 'ADMIN'` inside `/verwaltung` → the 7-entry admin submenu, which
 *   crosses `Nav.tsx`'s `visibleItems.length > 4` threshold and switches the
 *   list to the wrapped 3-column grid.
 *
 * `role: null` is deliberately not its own story: `Nav.tsx` only ever branches
 * on `role === 'ADMIN'`, so a logged-out nav renders byte-identically to the
 * MEMBER one below.
 *
 * The frame decorator anchors the bar to the bottom of a page-shaped container
 * without pinning a width, so the viewport toolbar still governs how much room
 * the labels get — which is the whole point of the grid-wrap branch.
 */
const meta = {
  title: 'Components/Nav',
  component: Nav,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1, padding: '1rem' }}>
          <p>Seiteninhalt stünde hier.</p>
        </div>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Nav>;

export default meta;

type Story = StoryObj<typeof meta>;

/** MEMBER: the three main tabs, no "Verwaltung". Identical to a logged-out (`role: null`) nav. */
export const MemberTabs: Story = {
  args: { role: 'MEMBER' },
  parameters: { reactRouter: { initialEntries: ['/'] } },
};

/** ADMIN outside the admin area: the fourth "Verwaltung" tab appears, still a single row. */
export const AdminTabs: Story = {
  args: { role: 'ADMIN' },
  parameters: { reactRouter: { initialEntries: ['/'] } },
};

/**
 * ADMIN inside `/verwaltung`: the bar swaps to the 7-entry submenu and, being
 * over the 4-item threshold, wraps into the 3-column grid instead of squeezing
 * long labels like "Einstellungen" and "Punkte-Shop" into ellipsis.
 */
export const AdminSubmenu: Story = {
  args: { role: 'ADMIN' },
  parameters: { reactRouter: { initialEntries: ['/verwaltung/einstellungen'] } },
};

/** Active-tab highlighting on a non-index route — `NavLink`'s active state on "Verlauf". */
export const ActiveTabHighlight: Story = {
  args: { role: 'MEMBER' },
  parameters: { reactRouter: { initialEntries: ['/verlauf'] } },
};

/** The tightest real layout: the 7-entry admin grid at 390px, the mobile-first target (§19). */
export const MobileAdminSubmenu: Story = {
  args: { role: 'ADMIN' },
  globals: { viewport: iphone13Viewport },
  parameters: { reactRouter: { initialEntries: ['/verwaltung/einstellungen'] } },
};
