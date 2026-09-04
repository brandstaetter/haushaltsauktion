import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const API_PORT = process.env.API_PORT ?? '3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a silently self-activating service
      // worker still shouldn't swap a long-open tab's JS out from under it
      // between requests. That said, the actual "new version" detection and
      // reload no longer come from this plugin's own update lifecycle —
      // `VersionMismatchOverlay` (apps/web/src/components/VersionMismatchOverlay)
      // reacts to an `X-App-Version` mismatch on every backend response
      // instead (intake "reliable-update-check-forced-reload-overlay"),
      // because this plugin only checks for a new worker on navigation,
      // which made the previous `UpdatePrompt` banner unreliable — it could
      // take several manual reloads before the browser even noticed an
      // update existed. `registerType: 'prompt'` still matters here: it's
      // what lets `VersionMismatchOverlay` explicitly send the skip-waiting
      // message itself (`updateServiceWorker(true)`) right before its own
      // forced reload, rather than the service worker activating on its own
      // schedule.
      registerType: 'prompt',
      // App-shell only (CLAUDE.md §30 "PWA-fähig") — the household's task
      // list, point balances, and assignments are live shared state that
      // changes underneath the current viewer (values escalate, offers
      // expire, another member volunteers first). Caching /api/* responses
      // would let someone act on stale data. Precaching covers only the
      // built JS/CSS/HTML shell (Workbox's default `generateSW` globPatterns
      // scoped to `dist/`), so the app can *launch* offline or on a flaky
      // connection, but every API call still goes to the network — there is
      // no `runtimeCaching` entry for `/api/*` here, deliberately.
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Haushaltsauktion',
        short_name: 'Haushalt',
        description: 'Haushaltsauktion — faire Verteilung von Haushaltsaufgaben',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#EEF1F4',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  root: '.',
  publicDir: 'public',
  server: {
    port: Number(process.env.WEB_PORT ?? 8080),
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Explicit, not just relying on Vite's "inside root" default: `dist/`
    // was observed accumulating every previous build's hashed chunks
    // instead of being cleared (dozens of stale index-*.js/.css files going
    // back to the start of this session) — harmless for a plain SPA build,
    // but vite-plugin-pwa's service worker precaches whatever it finds in
    // `dist/` at build time, so a dirty output directory means genuinely
    // dead chunks being shipped into the precache manifest.
    emptyOutDir: true,
  },
});
