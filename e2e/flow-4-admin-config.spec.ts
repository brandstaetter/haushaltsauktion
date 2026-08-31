/**
 * §17 „Admins benötigen eine GUI, über die Regeln ohne Deployment geändert
 * werden können“ — geprüft wird, dass eine Änderung tatsächlich den Server
 * erreicht, nicht nur den React-State: nach einem harten `reload()` muss der
 * neue Wert aus einem frischen `GET /admin/config` kommen (§36 — serverseitig
 * verbindlich).
 *
 * Verändert `assignment.offerDurationMinutes` — ein Feld ohne Seiteneffekt auf
 * die anderen `flow-*`-Tests (die die Zufallszuweisung ohnehin per Sweep-Knopf
 * statt über den Timer auslösen) — und setzt ihn am Ende zurück, damit die
 * Konfiguration für künftige Testläufe unverändert bleibt.
 *
 * Läuft zuletzt unter den `flow-*`-Dateien (alphabetisch "4"), rein zur
 * Übersicht — inhaltlich unabhängig von den anderen drei.
 */

import { expect, test } from '@playwright/test';

import { storageStatePath } from './helpers';

test.use({ storageState: storageStatePath('elke') });

test('Admin ändert einen Regelwert, er bleibt nach Neuladen bestehen', async ({ page }) => {
  await page.goto('/verwaltung/einstellungen');

  const input = page.getByLabel('Angebotsdauer (Minuten)');
  await expect(input).toBeVisible();

  const originalValue = await input.inputValue();
  const original = Number.parseInt(originalValue, 10);
  const changed = original === 90 ? 45 : 90;

  await input.fill(String(changed));
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Konfiguration gespeichert.');

  // Nicht der optimistischen UI trauen — neu laden erzwingt ein frisches
  // GET /admin/config vom Server.
  await page.reload();
  await expect(page.getByLabel('Angebotsdauer (Minuten)')).toHaveValue(String(changed));

  // Zurücksetzen, damit der Testlauf die Konfiguration nicht dauerhaft verändert.
  await page.getByLabel('Angebotsdauer (Minuten)').fill(String(original));
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Konfiguration gespeichert.');

  await page.reload();
  await expect(page.getByLabel('Angebotsdauer (Minuten)')).toHaveValue(String(original));
});
