/**
 * `virtual:pwa-register/react` only exists once vite-plugin-pwa's Vite
 * plugin runs (apps/web/vite.config.ts) — vitest.config.ts deliberately
 * omits that plugin (see its own comment), so Vite's import analysis has
 * nothing to resolve the bare specifier to. This stub stands in via the
 * `resolve.alias` entry in vitest.config.ts; individual tests still
 * `vi.mock('virtual:pwa-register/react', ...)` to control `needRefresh`.
 *
 * `.storybook/main.ts` aliases the same specifier here for the same reason:
 * its `viteFinal` strips `vite-plugin-pwa` (that file explains why), and
 * `VersionMismatchOverlay` imports the virtual module directly, so any story
 * rendering that component — or `Layout`, which mounts it — would otherwise
 * fail the preview build. A no-op `updateServiceWorker` is also the correct
 * behaviour for a story: Storybook has no business registering one.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: async () => {},
  };
}
