/**
 * End-to-End-Tests gegen den echten Stack (§35, §42).
 *
 * Nichts ist hier gemockt: Playwright startet die Fastify-API gegen die
 * Postgres-Instanz aus `docker-compose.yml` und den Vite-Dev-Server davor.
 * Ein Test, der gegen ein Mock grün wird, sagt über „Login funktioniert“
 * nichts aus — deshalb der volle Weg Browser → SPA → `/api` → Datenbank.
 *
 * Voraussetzung: `npm run db:up` (die Datenbank ist der einzige Dienst, den
 * diese Konfiguration nicht selbst hochfährt) und einmalig `npm run db:migrate`.
 * Die Seed-Daten legt `e2e/global-setup.ts` bei jedem Lauf neu an.
 *
 * Chromium genügt: die Anwendung ist eine private Haushalts-App, kein
 * Massenprodukt mit Browser-Matrix (§43 — kein Overengineering).
 */

import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.API_PORT ?? '3000';
const WEB_PORT = process.env.WEB_PORT ?? '8080';
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Die Tests teilen sich einen Haushalt in einer Datenbank; parallele Worker
  // würden sich gegenseitig den Zustand unter den Füßen wegziehen.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: WEB_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      // `apps/api` hat bewusst kein `dev`-Skript; der Prozess liest seine
      // Umgebung sonst aus der Shell, hier aus der `.env` des Repos.
      command: 'npx tsx --env-file=.env apps/api/src/main.ts',
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      // Bewusst *kein* Wiederverwenden: die Anmeldebegrenzung (§36, fünf
      // Versuche je fünf Minuten) lebt im Prozessspeicher. Ein frischer
      // Prozess je Lauf macht die Suite wiederholbar, statt beim zweiten
      // Durchgang an ihrem eigenen Schutzmechanismus zu scheitern.
      // Läuft bereits eine API auf diesem Port, bricht der Start hier
      // erkennbar ab — das ist gewollt.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      // Der Hintergrund-Sweep (§4.8-Kommentar in config.ts: "0 disables the
      // worker; the endpoint still works") läuft sonst parallel zum
      // manuellen, testgesteuerten Sweep aus flow-3 mit — er materialisiert
      // dann fällige Instanzen selbst und vergibt ihnen nach der echten
      // `assignment.offerDurationMinutes`-Wartezeit ein `offerExpiresAt` in
      // der Zukunft statt dem `now` der Seed-/Fixture-Skripte. Über eine
      // ganze Testsitzung (mehrere volle Läufe) hinweg füllt der Timer so
      // die AVAILABLE-Instanzen wieder auf, aber keine davon ist reif für
      // den Zufallszug — flow-3s Sweep findet dann niemanden. `--env-file`
      // liest nur, was `process.env` noch nicht gesetzt hat, daher gewinnt
      // dieser Wert gegenüber der `.env`.
      env: { SWEEP_INTERVAL_SECONDS: '0' },
    },
    {
      // Der Dev-Server, weil nur dort die Demo-Anmeldung sichtbar ist
      // (`import.meta.env.DEV` in `LoginPage`).
      command: 'npm run dev -w apps/web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
