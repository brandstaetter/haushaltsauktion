import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Unit-Tests der Weboberfläche.
 *
 * Bewusst getrennt von `vite.config.ts`: der Dev-Server dort öffnet einen Port
 * und einen `/api`-Proxy, den ein Testlauf weder braucht noch haben soll.
 * `*.module.css` liefert Vitest ohne CSS-Verarbeitung als Proxy aus, deshalb
 * bleibt `css` aus — Klassennamen sind hier nie Testgegenstand.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // See src/test/mocks/pwaRegister.ts for why this needs an alias here.
      'virtual:pwa-register/react': path.resolve(__dirname, 'src/test/mocks/pwaRegister.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
