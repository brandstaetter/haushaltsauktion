/**
 * §42 — „Login funktioniert“ und die Startseite zeigt echte Daten.
 *
 * Der Test läuft gegen die echte API und die echte Datenbank. Er behauptet
 * daher nur, was der Seed garantiert: die vier Mitglieder aus §38, den Namen
 * der angemeldeten Person und die sechs Aufgaben. Wem der Zufallsvergabe-Sweep
 * gerade welche Aufgabe zugelost hat, ist absichtlich nirgends Gegenstand
 * einer Zusicherung — das wäre eine Wette auf einen Würfel.
 */

import { expect, test } from '@playwright/test';

import {
  loginAsDemoUser,
  NO_SESSION,
  SEEDED_TASK_TITLE_PATTERN,
  storageStatePath,
} from './helpers';

test.describe('Anmeldung', () => {
  test.use({ storageState: NO_SESSION });

  test('leitet nicht angemeldete Besucher zur Anmeldung', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Haushaltsauktion' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
  });

  test('meldet eine Demo-Person an und zeigt ihr Dashboard', async ({ page }) => {
    await loginAsDemoUser(page, 'elke');

    // Nach der Anmeldung steht die Startseite, nicht mehr das Formular.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toHaveCount(0);

    // Der Name kommt aus dem Seed, nicht aus dem Formular.
    await expect(page.getByRole('heading', { name: 'Hallo Elke' })).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test.use({ storageState: storageStatePath('elke') });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hallo Elke' })).toBeVisible();
  });

  test('zeigt den Punktestand als Zahl vom Server', async ({ page }) => {
    const balanceCard = page.getByText('Dein Punktestand', { exact: true }).locator('..');

    await expect(balanceCard).toHaveText(/Dein Punktestand\s*[−-]?\d/);
  });

  test('zeigt die vier Mitglieder des Demo-Haushalts', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Familie' })).toBeVisible();

    const memberCell = page.getByText('Mitglieder', { exact: true }).locator('..');
    await expect(memberCell).toHaveText(/4\s*Mitglieder/);
  });

  test('zeigt Aufgaben aus dem Seed im Verlauf des Haushalts', async ({ page }) => {
    await page.getByRole('link', { name: 'Verlauf' }).click();
    await expect(page).toHaveURL(/\/verlauf$/);

    // Der Verlauf ist fortschreibend: die Anlage-Ereignisse der sechs
    // Seed-Aufgaben stehen dort ab dem ersten Seed und verschwinden nie.
    await expect(page.getByText(SEEDED_TASK_TITLE_PATTERN).first()).toBeVisible();
  });

  test('führt Elke als Administratorin in die Verwaltung', async ({ page }) => {
    // Der Seed macht Elke zur ADMIN (§25) — der Umschalter "Verwaltung" im
    // Hauptmenü und die Verwaltungs-Navigationspunkte im Untermenü, das er
    // öffnet, sind der sichtbare Beweis, dass die Rolle aus der Sitzung stammt.
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    await nav.getByRole('link', { name: 'Verwaltung', exact: true }).click();
    await expect(page).toHaveURL(/\/verwaltung\/einstellungen$/);

    await expect(nav.getByRole('link', { name: 'Einstellungen' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Benutzer' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Kategorien' })).toBeVisible();
  });
});

test.describe('Mitglied ohne Adminrechte', () => {
  test.use({ storageState: storageStatePath('arthur') });

  test('sieht keine Verwaltung', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hallo Arthur' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    await expect(nav.getByRole('link', { name: 'Einstellungen' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Benutzer' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Kategorien' })).toHaveCount(0);
  });

  test('wird von der Verwaltungsseite zurück auf die Startseite geschickt', async ({ page }) => {
    await page.goto('/verwaltung');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Hallo Arthur' })).toBeVisible();
  });
});
