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

import { expectNoLineWrap, expectNoHorizontalScroll, expectNoMidWordWrap, NO_SESSION, storageStatePath } from './helpers';

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

    test('Aktions-Button auf der Aufgaben-Card bricht nicht mitten im Wort um', async ({ page }) => {
      // Die Aufgabenliste hat keinen eigenen Navigationspunkt mehr — erreichbar
      // über den "Alle"-Link im Dashboard-Abschnitt "Meine Aufgaben".
      await page.getByRole('button', { name: 'Alle' }).click();
      await expect(page).toHaveURL(/\/aufgaben$/);
      await expect(page.getByRole('tablist')).toBeVisible();

      const buttons = page
        .getByRole('article')
        .getByRole('button', { name: /Freiwillig übernehmen|Als erledigt markieren/ });
      // `count()` reads the DOM at this exact instant and does not wait —
      // the list is still loading right after navigation, so the first
      // button becoming visible is what actually waits out that race.
      await expect(buttons.first()).toBeVisible();
      const count = await buttons.count();

      for (let i = 0; i < count; i += 1) {
        await expectNoMidWordWrap(buttons.nth(i));
      }
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
      // Kategorien, Punkte-Shop für Elke (ADMIN).
      await expect(nav.getByRole('link')).toHaveCount(8);
    });

    test('Admin-Hauptnavigation: kein Label bricht um, alle Einträge bleiben gleich hoch', async ({ page }) => {
      // 8 Spalten auf 390px sind zu schmal für sichtbaren Text (siehe
      // Nav.tsx `compact` / Nav.module.css `.compact`) — die Leiste zeigt
      // dann nur Icons. Die eigentliche Prüfung ist deshalb nicht "bricht
      // der sichtbare Text um" (er ist gar nicht sichtbar), sondern dass
      // dadurch kein Eintrag höher wird als seine Nachbarn, UND dass jeder
      // Link trotzdem weiterhin für Screenreader benannt bleibt.
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(8);

      // Der zugängliche Name bleibt erhalten, obwohl der Text visuell
      // ausgeblendet ist (nur `clip`/`position`, kein `display: none`).
      for (const label of [
        'Start',
        'Verlauf',
        'Ich',
        'Einstellungen',
        'Benutzer',
        'Aufgaben',
        'Kategorien',
        'Punkte-Shop',
      ]) {
        await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
      }

      const heights = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      const distinctHeights = new Set(heights);
      expect(
        distinctHeights.size,
        `Nav-Einträge sind unterschiedlich hoch, die Leiste ist nicht mehr ausgerichtet: ${heights.join(', ')}`,
      ).toBe(1);
    });
  });

  test.describe('angemeldet als Mitglied ohne Admin-Rechte', () => {
    test.use({ storageState: storageStatePath('arthur') });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Hallo Arthur' })).toBeVisible();
    });

    test('Mitglieder-Hauptnavigation: kein Label bricht um', async ({ page }) => {
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      const links = nav.getByRole('link');

      // Nur Start/Verlauf/Ich — keine Admin-Einträge. Bei 3 Spalten ist
      // genug Platz, der Text bleibt hier sichtbar (kein Icon-only-
      // Fallback), muss also weiterhin einzeilig bleiben.
      await expect(links).toHaveCount(3);

      for (const label of ['Start', 'Verlauf', 'Ich']) {
        await expectNoLineWrap(nav.getByRole('link', { name: label, exact: true }));
      }

      const heights = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      const distinctHeights = new Set(heights);
      expect(
        distinctHeights.size,
        `Nav-Einträge sind unterschiedlich hoch, die Leiste ist nicht mehr ausgerichtet: ${heights.join(', ')}`,
      ).toBe(1);
    });
  });
});
