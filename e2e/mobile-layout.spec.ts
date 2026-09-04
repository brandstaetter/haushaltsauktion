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

import {
  expectNoLineWrap,
  expectNoTextTruncation,
  expectNoHorizontalScroll,
  expectNoMidWordWrap,
  NO_SESSION,
  storageStatePath,
} from './helpers';

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
      // Start, Verlauf, Ich — plus der Umschalter "Verwaltung" für Elke
      // (ADMIN). Die eigentlichen Verwaltungseinträge stecken im Untermenü,
      // das erst unter /verwaltung/* angezeigt wird (siehe Tests unten).
      await expect(nav.getByRole('link')).toHaveCount(4);
    });

    test('Admin-Hauptmenü: kein Label bricht um, alle Einträge bleiben gleich hoch', async ({ page }) => {
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(4);

      for (const label of ['Start', 'Verlauf', 'Ich', 'Verwaltung']) {
        const link = nav.getByRole('link', { name: label, exact: true });
        await expectNoLineWrap(link);
        await expectNoTextTruncation(link.locator('span'));
      }

      const heights = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      const distinctHeights = new Set(heights);
      expect(
        distinctHeights.size,
        `Nav-Einträge sind unterschiedlich hoch, die Leiste ist nicht mehr ausgerichtet: ${heights.join(', ')}`,
      ).toBe(1);
    });

    test('Verwaltungs-Untermenü: kein Label bricht um oder wird abgeschnitten, bricht kontrolliert auf zwei Zeilen um', async ({ page }) => {
      await page.getByRole('link', { name: 'Verwaltung', exact: true }).click();
      await expect(page).toHaveURL(/\/verwaltung\/einstellungen$/);

      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      const links = nav.getByRole('link');
      // Die 6 Verwaltungseinträge plus "Zurück" zum Hauptmenü.
      await expect(links).toHaveCount(7);

      for (const label of [
        'Einstellungen',
        'Benutzer',
        'Aufgaben',
        'Kategorien',
        'Punkte-Shop',
        'Audit-Log',
        'Zurück',
      ]) {
        const link = nav.getByRole('link', { name: label, exact: true });
        await expectNoLineWrap(link);
        // Die eigentliche Regression: ein Label kann einzeilig bleiben und
        // trotzdem per `text-overflow: ellipsis` unlesbar abgeschnitten
        // sein, ohne dass `expectNoLineWrap` das bemerkt.
        await expectNoTextTruncation(link.locator('span'));
      }

      const heights = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      const distinctHeights = new Set(heights);
      expect(
        distinctHeights.size,
        `Nav-Einträge sind unterschiedlich hoch, die Leiste ist nicht mehr ausgerichtet: ${heights.join(', ')}`,
      ).toBe(1);

      // 6 Einträge auf 390px brauchen zwei Zeilen zu je 3 Spalten (`.grid`
      // in Nav.module.css) — sonst wären die Spalten wieder so schmal wie
      // im ursprünglichen Bug. Bestätigt, dass tatsächlich umgebrochen
      // wurde, statt sich auf eine einzelne, versehentlich passende Breite
      // zu verlassen.
      const tops = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(tops).size, `Erwartet zwei Zeilen, gemessen: ${tops.join(', ')}`).toBe(2);

      await nav.getByRole('link', { name: 'Zurück', exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(nav.getByRole('link')).toHaveCount(4);
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
        const link = nav.getByRole('link', { name: label, exact: true });
        await expectNoLineWrap(link);
        await expectNoTextTruncation(link.locator('span'));
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
