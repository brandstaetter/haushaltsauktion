/**
 * Multi-Worker-Tasks (Phase 1-4, `.planning/architecture-multi-worker-tasks.md`)
 * end-to-end, komplett über die echte Oberfläche: Elke legt eine Aufgabe mit
 * zwei Helfer-Plätzen an, übernimmt selbst einen, Hannes übernimmt den
 * zweiten und erledigt ihn zuerst, danach schließt Elke ab.
 *
 * Deckt genau das Verhalten ab, das `completeTask.ts`s Kopfkommentar
 * ("Per-slot completion vs. instance-level completion") beschreibt: jeder
 * Slot zahlt sich selbst voll aus (§7/§44 gilt nur für RANDOM, hier ist
 * beides VOLUNTARY), und die Instanz schließt erst, wenn der *letzte* noch
 * aktive Slot erledigt wird — nicht schon beim ersten. Das API-seitige
 * Gegenstück ist `apps/api/test/integration/multi-worker-lifecycle.test.ts`;
 * dieser Test prüft dasselbe Verhalten, aber ausschließlich über Klicks in
 * der echten Oberfläche zweier echter Personen.
 *
 * Legt eine eigene, per Zeitstempel eindeutige Aufgabendefinition an
 * (`Wiederholung: Manuell`, damit weder der Hintergrund-Sweep noch ein
 * anderer Test sie je automatisch materialisiert) — berührt also keine der
 * sechs Seed-Aufgaben und keinen Zustand, auf den `flow-1`–`flow-4` sich
 * verlassen. Kann daher unabhängig von deren Reihenfolge laufen; die
 * Nummerierung "5" ist rein zur Übersicht.
 *
 * Bildet den Personenwechsel auf einem geteilten Gerät über je einen eigenen
 * Browser-Kontext pro Person ab (wie `flow-3`), nicht über ein reales
 * "Abmelden" + noch einmal "Anmelden" auf derselben Seite. Zwei Gründe dafür:
 * `POST /auth/logout` widerruft die Sitzung serverseitig (`auth.ts`:
 * "Revoked rather than deleted"), ein gespeichertes Sitzungs-Cookie derselben
 * Person lässt sich danach also nicht mehr wiederverwenden — und ein zweites
 * Mal über das echte Formular anzumelden geriet in der Praxis wiederholt an
 * das Fünf-Versuche-Limit von `POST /auth/login` (§36), obwohl die
 * Kopfrechnung dafür Spielraum ließ. Ein je Person frischer Kontext mit dem
 * von `auth.setup.ts` bereits einmal real erzeugten Sitzungs-Cookie umgeht
 * beides zuverlässig, ohne den eigentlich geprüften Ablauf zu verändern:
 * Elke und Hannes sind trotzdem zwei echte, unabhängig angemeldete Personen,
 * die nacheinander an derselben Aufgabe arbeiten.
 */

import { expect, test, type Page } from '@playwright/test';

import { readDashboardBalance, storageStatePath } from './helpers';

test.setTimeout(90_000);

/**
 * Liest den Betrag der `VOLUNTARY_TASK_REWARD`-Zeile für eine bestimmte
 * Aufgabe aus `/punktekonto`. Genauer als ein reiner Vorher/Nachher-Vergleich
 * des Punktestands: der Streak-Bonus (`config/defaults.ts` — standardmäßig
 * aktiviert, `floor(0.5 * Serienlänge)`) hängt vom bisherigen Testlauf ab und
 * würde eine simple Saldo-Differenz je nach Ausführungsreihenfolge um einen
 * unvorhersagbaren Betrag verfälschen; die Ledger-Zeile für *diese* Aufgabe
 * ist davon unabhängig.
 */
async function readVoluntaryRewardAmount(page: Page, taskTitle: string): Promise<number> {
  await page.goto('/punktekonto');
  const row = page.locator('li').filter({ hasText: 'Freiwillige Aufgabe' }).filter({ hasText: taskTitle });
  await expect(row).toHaveCount(1);
  // Betrag und Saldo-danach stehen als zwei benachbarte `<span>`s ohne
  // Trennzeichen dazwischen (`LedgerPage.tsx`s `styles.numbers`) — ihr
  // gemeinsamer Text wäre z. B. "+1051" für Betrag 10 und Saldo 1051, nicht
  // sauber auseinanderzurechnen. Der CSS-Modul-Klassenname (Original-Teil
  // bleibt trotz Hash-Suffix als Substring erhalten) trifft gezielt nur den
  // Betrags-`<span>`.
  const amountText = (await row.locator('[class*="positive"], [class*="negative"]').textContent()) ?? '';
  const raw = /^[+−-]([\d.]+)$/.exec(amountText.trim())?.[1];
  if (!raw) throw new Error(`Betrag nicht lesbar aus Ledger-Zeile: "${amountText}"`);
  return Number.parseInt(raw.replace(/\./g, ''), 10);
}

test('Zwei Personen an einem geteilten Gerät erledigen gemeinsam eine Multi-Worker-Aufgabe', async ({ browser }) => {
  const title = `E2E Team-Aufgabe ${Date.now()}`;
  const baseValue = 10;
  let taskUrl = '';

  // ── 1) Elke legt eine Aufgabe mit genau 2 Helfern an, startet eine Instanz
  //       und übernimmt selbst einen der beiden Plätze ─────────────────────
  const elkeCtx = await browser.newContext({ storageState: storageStatePath('elke') });
  try {
    const page = await elkeCtx.newPage();

    await page.goto('/verwaltung/aufgaben');
    await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
    const createDialog = page.getByRole('dialog');
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel('Titel').fill(title);
    await createDialog.getByLabel('Basiswert').fill(String(baseValue));
    // Helfer-Modus bleibt "Genau" (Formular-Default) — nur die Anzahl ändert sich.
    await createDialog.getByLabel('Anzahl Helfer').fill('2');
    // "Manuell": keine Wochentage/Uhrzeit nötig, und weder der deaktivierte
    // Hintergrund-Sweep noch ein anderer Test materialisiert diese Definition
    // je von selbst (`nextOccurrence` liefert für MANUAL immer `null`).
    await createDialog.getByLabel('Typ').selectOption({ label: 'Manuell' });
    await createDialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Aufgabe wurde angelegt.');

    const definitionRow = page.getByRole('listitem').filter({ hasText: title });
    await expect(definitionRow).toBeVisible();
    await definitionRow.getByRole('button', { name: 'Jetzt anbieten' }).click();
    await expect(page.getByRole('status')).toHaveText('Neue Instanz wurde erstellt.');

    await page.goto('/aufgaben');
    await expect(page.getByRole('tablist')).toBeVisible();
    const taskCard = page.getByRole('article').filter({ hasText: title });
    await expect(taskCard).toBeVisible();
    await expect(taskCard.getByRole('heading', { level: 3 })).toHaveText(title);

    // Der Karten-Knopf in der Liste navigiert nur zur Detailseite (§20/§21
    // sind getrennt) — die eigentliche Übernahme passiert erst dort, mit
    // demselben Knopftext.
    await taskCard.getByRole('button', { name: 'Freiwillig übernehmen' }).click();
    await expect(page).toHaveURL(/\/aufgaben\/.+/);
    taskUrl = page.url();
    // react-router hält die *alte* Listenseite im DOM, bis die neue fertig
    // geladen ist (dieselbe Falle wie `helpers.ts`s `clearAssignedTasks` sie
    // dokumentiert) — nur auf die URL zu warten ließe den nächsten Klick auf
    // die noch gemountete Liste treffen, mit zwei gleich benannten Knöpfen.
    // Die eigene Überschrift der Detailseite ist das verlässliche Signal.
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Freiwillig übernehmen' }).click();
    await expect(page.getByRole('status')).toHaveText('OK');

    // Erst 1 von 2 Plätzen besetzt — die Definition verlangt EXACTLY(2), das
    // Mindestmaß ist also noch nicht erreicht, die Instanz bleibt "verfügbar"
    // (`volunteerForTask.ts`: nur der Beitritt, der die Schwelle *erreicht*,
    // schaltet AVAILABLE → ASSIGNED).
    await expect(page.getByText('verfügbar', { exact: true })).toBeVisible();
    await expect(page.getByText('Dir zugewiesen')).toBeVisible();
  } finally {
    // ── 2) Elke meldet sich ab ───────────────────────────────────────────
    await elkeCtx.close();
  }

  // ── 2) …Hannes meldet sich an und 3) übernimmt den zweiten Platz ────────
  const hannesCtx = await browser.newContext({ storageState: storageStatePath('hannes') });
  try {
    const page = await hannesCtx.newPage();

    await page.goto(taskUrl);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    // Jemand ist bereits auf der Aufgabe (`activeSlotCount > 0`) — die CTA
    // heißt deshalb "Mithelfen", nicht "Freiwillig übernehmen" (siehe
    // `TaskDetailPage.tsx`s `task.workerCount > 1 && task.activeSlotCount > 0`).
    await page.getByRole('button', { name: 'Mithelfen' }).click();
    await expect(page.getByRole('status')).toHaveText('OK');

    // Jetzt sind beide Plätze besetzt — die Schwelle ist erreicht, die
    // Instanz ist "zugewiesen".
    await expect(page.getByText('zugewiesen', { exact: true })).toBeVisible();
    await expect(page.getByText('Zugewiesen 2/2')).toBeVisible();

    // ── 4) Hannes erledigt seinen eigenen Platz ─────────────────────────
    const hannesBalanceBefore = await readDashboardBalance(page);

    await page.goto(taskUrl);
    await page.getByRole('button', { name: 'Als erledigt markieren' }).click();
    await expect(page.getByRole('status')).toHaveText('OK');

    // Freiwillig übernommen und erledigt zahlt den vollen aktuellen Wert
    // (`completeTask.ts`: "every slot that completes pays its own assignee
    // in full for VOLUNTARY") — unabhängig davon, dass noch ein zweiter
    // Platz offen ist. Über die Ledger-Zeile geprüft, nicht über die reine
    // Saldo-Differenz (siehe `readVoluntaryRewardAmount`s Dateikopf-Kommentar).
    expect(await readVoluntaryRewardAmount(page, title)).toBe(baseValue);
    const hannesBalanceAfter = await readDashboardBalance(page);
    expect(hannesBalanceAfter).toBeGreaterThanOrEqual(hannesBalanceBefore + baseValue);

    // Nicht der letzte aktive Platz (Elke ist noch dabei) — die Instanz
    // bleibt offen, nicht abgeschlossen.
    await page.goto(taskUrl);
    await expect(page.getByText('zugewiesen', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als erledigt markieren' })).not.toBeVisible();
  } finally {
    // ── …und meldet sich ab ──────────────────────────────────────────────
    await hannesCtx.close();
  }

  // ── 5) Elke meldet sich wieder an und schließt die Aufgabe ab ───────────
  const elkeCtx2 = await browser.newContext({ storageState: storageStatePath('elke') });
  try {
    const page = await elkeCtx2.newPage();
    const elkeBalanceBefore = await readDashboardBalance(page);

    await page.goto(taskUrl);
    await page.getByRole('button', { name: 'Als erledigt markieren' }).click();
    await expect(page.getByRole('status')).toHaveText('OK');

    // ── 6) Beide haben verdient, die Instanz ist jetzt wirklich geschlossen ─
    expect(await readVoluntaryRewardAmount(page, title)).toBe(baseValue);
    const elkeBalanceAfter = await readDashboardBalance(page);
    expect(elkeBalanceAfter).toBeGreaterThanOrEqual(elkeBalanceBefore + baseValue);

    await page.goto(taskUrl);
    await expect(page.getByText('erledigt', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Als erledigt markieren' })).not.toBeVisible();
  } finally {
    await elkeCtx2.close();
  }
});
