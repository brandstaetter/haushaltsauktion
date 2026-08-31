/**
 * §35 „Freiwillige Übernahme“ — der wichtigste einzelne Testfall der ganzen
 * Anwendung, bisher ohne jede E2E-Abdeckung:
 *
 *   Task Wert 6
 *   User übernimmt freiwillig
 *   Task wird erledigt
 *   User erhält +6
 *
 * Läuft bewusst als erste eigene Spec-Datei (alphabetisch vor den anderen
 * `flow-*`-Dateien), damit sie sich eine der sechs frisch geseedeten,
 * unangetasteten Aufgaben aussuchen kann, bevor ein späterer Test per Sweep
 * den Rest zufällig verteilt.
 */

import { expect, test } from '@playwright/test';

import { openFirstAvailableTask, readCurrentTaskValue, readDashboardBalance, storageStatePath } from './helpers';

test.use({ storageState: storageStatePath('hannes') });

test('freiwillige Übernahme + Erledigung schreibt den Aufgabenwert als Punkte gut', async ({ page }) => {
  const balanceBefore = await readDashboardBalance(page);

  const { title } = await openFirstAvailableTask(page);
  const taskValue = await readCurrentTaskValue(page);

  await page.getByRole('button', { name: 'Freiwillig übernehmen' }).click();
  await expect(page.getByRole('status')).toHaveText('OK');

  // Nach der Übernahme steht Hannes' Name nicht mehr zur Debatte — es ist
  // seine Aufgabe, und der einzig sinnvolle nächste Schritt ist "erledigt".
  const completeButton = page.getByRole('button', { name: 'Als erledigt markieren' });
  await expect(completeButton).toBeVisible();
  await completeButton.click();
  await expect(page.getByRole('status')).toHaveText('OK');

  const balanceAfter = await readDashboardBalance(page);

  expect(
    balanceAfter,
    `"${title}" hatte Wert ${taskValue}; erwartet ${balanceBefore} + ${taskValue} = ${balanceBefore + taskValue}, tatsächlich ${balanceAfter}.`,
  ).toBe(balanceBefore + taskValue);
});
