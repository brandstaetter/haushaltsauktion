/**
 * §35 „Parallelzugriff“ auf UI-Ebene — das Gegenstück zu
 * `apps/api/test/integration/concurrency.test.ts`, das die drei Wächter aus
 * `volunteerForTask.ts` bereits auf Transaktionsebene beweist. Hier geht es
 * nicht darum, dieselbe Millisekunden-Überlappung zu erzwingen, sondern zu
 * zeigen, dass zwei echte Browser-Sitzungen, die denselben Knopf drücken, in
 * einem konsistenten Zustand landen: genau eine Person gewinnt, die andere
 * bekommt eine verständliche Absage statt eines stillen Fehlers.
 *
 * Läuft vor `flow-3-random-assignment-buyout.spec.ts` (alphabetisch "2" vor
 * "3"), damit garantiert noch eine unangetastete Aufgabe verfügbar ist, bevor
 * der dortige Sweep alles Übrige zufällig verteilt.
 */

import { expect, test } from '@playwright/test';

import { openFirstAvailableTask, storageStatePath } from './helpers';

test('zwei Personen übernehmen gleichzeitig — genau eine gewinnt', async ({ browser }) => {
  const arthur = await browser.newContext({ storageState: storageStatePath('arthur') });
  const luise = await browser.newContext({ storageState: storageStatePath('luise') });

  try {
    const pageA = await arthur.newPage();
    const pageB = await luise.newPage();

    const { url } = await openFirstAvailableTask(pageA);
    await pageB.goto(url);

    const volunteerA = pageA.getByRole('button', { name: 'Freiwillig übernehmen' });
    const volunteerB = pageB.getByRole('button', { name: 'Freiwillig übernehmen' });
    await expect(volunteerA).toBeVisible();
    await expect(volunteerB).toBeVisible();

    // Beide Klicks ohne await dazwischen — die Anfragen laufen so nah beieinander,
    // wie es zwei echte Browser-Tabs eben zulassen.
    await Promise.all([volunteerA.click(), volunteerB.click()]);

    const statusA = pageA.getByRole('status');
    const statusB = pageB.getByRole('status');
    await expect(statusA).toBeVisible();
    await expect(statusB).toBeVisible();

    const textA = (await statusA.textContent())?.trim() ?? '';
    const textB = (await statusB.textContent())?.trim() ?? '';

    const outcomes = [textA, textB];
    const wins = outcomes.filter((t) => t === 'OK');
    const losses = outcomes.filter((t) => t.includes('nicht mehr verfügbar'));

    expect(wins, `Rückmeldungen waren: [${outcomes.join(' | ')}]`).toHaveLength(1);
    expect(losses, `Rückmeldungen waren: [${outcomes.join(' | ')}]`).toHaveLength(1);

    const [winnerPage, loserPage] = textA === 'OK' ? [pageA, pageB] : [pageB, pageA];

    // Der Gewinner sieht jetzt "erledigt", nicht mehr "übernehmen".
    const completeButton = winnerPage.getByRole('button', { name: 'Als erledigt markieren' });
    await expect(completeButton).toBeVisible();
    await expect(winnerPage.getByRole('button', { name: 'Freiwillig übernehmen' })).toHaveCount(0);

    // Die verlierende Sitzung hatte noch den alten Stand geladen; ein frischer
    // Blick auf dieselbe Aufgabe zeigt jetzt ebenfalls, dass sie vergeben ist.
    await loserPage.reload();
    await expect(loserPage.getByRole('button', { name: 'Freiwillig übernehmen' })).toHaveCount(0);

    // Aufräumen: die Aufgabe abschließen, statt sie ASSIGNED liegen zu lassen
    // (sonst zieht der nächste Seed-Lauf für diese Aufgabendefinition keine
    // neue verfügbare Instanz nach, §5.3).
    await completeButton.click();
    await expect(winnerPage.getByRole('status')).toHaveText('OK');
  } finally {
    await arthur.close();
    await luise.close();
  }
});
