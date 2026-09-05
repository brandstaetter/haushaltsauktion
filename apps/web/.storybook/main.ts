import type { StorybookConfig } from '@storybook/react-vite';
import type { PluginOption, Plugin } from 'vite';

/**
 * Standalone dev tool for `apps/web` — component prototyping in isolation
 * from the router and the API. Deliberately not wired into `npm run build`,
 * `npm run dev`, `npm run test`, or CI: `npm run storybook -w apps/web`
 * (or `npm run build-storybook -w apps/web` for a static export) starts it
 * explicitly.
 *
 * `@storybook/react-vite` auto-detects and merges `apps/web/vite.config.ts`
 * (same directory as this file), so the `react()` plugin, the `@` alias,
 * and CSS Modules handling behave exactly as they do in the real app.
 */
async function flattenPlugins(plugins: PluginOption[] | undefined): Promise<Plugin[]> {
  const result: Plugin[] = [];
  for (const entry of plugins ?? []) {
    const resolved = await entry;
    if (Array.isArray(resolved)) {
      result.push(...(await flattenPlugins(resolved)));
    } else if (resolved) {
      result.push(resolved);
    }
  }
  return result;
}

const config: StorybookConfig = {
  stories: [
    '../src/components/**/*.stories.@(ts|tsx)',
    '../src/pages/**/*.stories.@(ts|tsx)',
  ],
  addons: ['msw-storybook-addon'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Serves `mockServiceWorker.js` (see `package.json`'s `msw.workerDirectory`)
  // — kept out of `../public` deliberately, since that directory is also
  // Vite's static-asset source for the real app's production build and has
  // no business shipping a mock worker.
  staticDirs: ['./public'],
  async viteFinal(viteConfig) {
    // `vite-plugin-pwa` is merged in along with the rest of `vite.config.ts`
    // (see above), but it has no business running inside Storybook: it
    // precaches `dist/`'s built assets for the real app's service worker,
    // and applying it to Storybook's own (much larger, dev-tool-only) JS
    // bundle blows past its 2 MiB default precache limit and fails the
    // build. Strip it here rather than touching `vite.config.ts`, which
    // should stay ignorant of Storybook entirely.
    const plugins = await flattenPlugins(viteConfig.plugins);
    return {
      ...viteConfig,
      plugins: plugins.filter((plugin) => !plugin.name?.startsWith('vite-plugin-pwa')),
    };
  },
};

export default config;
