/**
 * `virtual:pwa-register/react` only exists once vite-plugin-pwa's Vite
 * plugin runs (apps/web/vite.config.ts) — vitest.config.ts deliberately
 * omits that plugin (see its own comment), so Vite's import analysis has
 * nothing to resolve the bare specifier to. This stub stands in via the
 * `resolve.alias` entry in vitest.config.ts; individual tests still
 * `vi.mock('virtual:pwa-register/react', ...)` to control `needRefresh`.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: async () => {},
  };
}
