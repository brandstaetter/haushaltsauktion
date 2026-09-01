/**
 * §19/§31 — die Anwendung ist zuerst für das Telefon gedacht.
 *
 * 390×844 ist ein iPhone 14/15 im Hochformat, das kleinste Gerät, das in
 * dieser Familie realistisch vorkommt. Gemessen wird das eine, was sich
 * objektiv prüfen lässt: Es darf nichts seitlich hinausragen. Genau daran
 * scheitern responsive Layouts in der Praxis — an einer Knopfleiste, einer
 * Wertetabelle oder einem langen Aufgabentitel, der die Seite breiter macht
 * als den Bildschirm.
 */

import { expect, test } from '@playwright/test';

import { expectNoHorizontalScroll, NO_SESSION, storageStatePath } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Mobile Darstellung (390×844)', () => {
  test.describe('ohne Anmeldung', () => {
    test.use({ storageState: NO_SESSION });

    test('Anmeldeseite scrollt nicht seitlich', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();

      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('angemeldet', () => {
    test.use({ storageState: storageStatePath('elke') });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Hallo Elke' })).toBeVisible();
    });

    test('Dashboard scrollt nicht seitlich', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Familie' })).toBeVisible();

      await expectNoHorizontalScroll(page);
    });

    test('Dashboard bleibt schmal genug, auch nachdem alles nachgeladen ist', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      await expectNoHorizontalScroll(page);
    });

    test('Aufgabenliste scrollt nicht seitlich', async ({ page }) => {
      // Die Aufgabenliste hat keinen eigenen Navigationspunkt mehr — erreichbar
      // über den "Alle"-Link im Dashboard-Abschnitt "Meine Aufgaben".
      await page.getByRole('button', { name: 'Alle' }).click();
      await expect(page).toHaveURL(/\/aufgaben$/);
      await expect(page.getByRole('tablist')).toBeVisible();

      await expectNoHorizontalScroll(page);
    });

    test('Verlauf scrollt nicht seitlich', async ({ page }) => {
      await page.getByRole('link', { name: 'Verlauf' }).click();
      await expect(page).toHaveURL(/\/verlauf$/);

      await expectNoHorizontalScroll(page);
    });

    test('Punktekonto scrollt nicht seitlich', async ({ page }) => {
      await page.goto('/punktekonto');

      await expectNoHorizontalScroll(page);
    });

    test('die Hauptnavigation ist auf dem Telefon erreichbar', async ({ page }) => {
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

      await expect(nav).toBeVisible();
      // Start, Verlauf, Ich — plus Einstellungen, Benutzer, Aufgaben,
      // Kategorien für Elke (ADMIN).
      await expect(nav.getByRole('link')).toHaveCount(7);
    });
  });
});
