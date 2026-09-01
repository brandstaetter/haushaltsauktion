/**
 * §6–§10, §21, §31 — Zufallszuweisung → Freikauf → Wertsteigerung → erneutes
 * Angebot, komplett über die echte Oberfläche.
 *
 * Der Sweep (`POST /admin/assignments/run`) ist die dokumentierte
 * Testabkürzung für die 60-Minuten-Zufallsvergabe (Auftrag, "test-only way to
 * force a deterministic random assignment") — kein Ersatz für den Fluss
 * selbst, nur für das Warten auf den Timer.
 *
 * Eine Einschränkung der aktuellen Verwaltungsoberfläche: die Benutzer-Seite
 * (`/verwaltung/benutzer`, §17) hat keine Möglichkeit, einer Person manuell
 * Punkte gutzuschreiben.
 * Wen der gewichtete Zufall trifft, steht vorher nicht fest — trifft er eine
 * Person mit 0 Punkten, wäre ein Freikauf nach den Standardregeln
 * (`allowNegativeBalance: false`) gar nicht möglich, unabhängig vom eigentlich
 * zu testenden Freikauf-Mechanismus. Deshalb ruft dieser Test bei Bedarf den
 * echten, bereits vorhandenen Endpunkt `POST /admin/members/:id/points/adjust`
 * direkt auf (mit derselben Session und demselben CSRF-Token, den die SPA
 * auch verwendet) — reines Testvorbereitung, keine Umgehung der eigentlich
 * geprüften Freikauf-Logik, die weiterhin vollständig über die Oberfläche
 * läuft.
 *
 * Läuft nach `flow-2-concurrent-volunteer.spec.ts` (alphabetisch "3" nach
 * "2"), damit beide vorherigen Tests sich zuerst je eine Aufgabe direkt
 * sichern können, bevor hier der Rest auf einen Schlag zufällig verteilt wird.
 */

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { clearAssignedTasks, DEMO_USERS, type DemoUserKey, storageStatePath } from './helpers';

const MEMBER_KEYS: DemoUserKey[] = ['elke', 'arthur', 'luise', 'hannes'];

async function csrfTokenFor(page: Page): Promise<string> {
  const res = await page.request.get('/api/auth/me');
  const body = (await res.json()) as { csrfToken: string | null };
  if (!body.csrfToken) throw new Error('Keine CSRF-Token in der Sitzung gefunden.');
  return body.csrfToken;
}

async function grantPoints(adminPage: Page, csrfToken: string, memberId: string, amount: number): Promise<void> {
  const res = await adminPage.request.post(`/api/admin/members/${memberId}/points/adjust`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      amount,
      reason: 'E2E-Testvorbereitung: sicherstellen, dass der Freikauf leistbar ist',
      type: 'MANUAL_ADJUSTMENT',
    },
  });
  expect(res.ok(), `Punkte-Anpassung fehlgeschlagen: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function readDisclosureRow(page: Page, label: string): Promise<number> {
  const row = page.locator('dl > div').filter({ hasText: label });
  const text = await row.locator('dd').textContent();
  const n = Number.parseInt((text ?? '').replace(/\./g, ''), 10);
  if (Number.isNaN(n)) throw new Error(`"${label}" nicht als Zahl lesbar aus: "${text}"`);
  return n;
}

interface MemberSession {
  key: DemoUserKey;
  ctx: BrowserContext;
  page: Page;
}

test('Zufallszuweisung → Freikauf → Wertsteigerung → erneutes Angebot', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: storageStatePath('elke') });
  const members: MemberSession[] = await Promise.all(
    MEMBER_KEYS.map(async (key) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(key) });
      const page = await ctx.newPage();
      return { key, ctx, page };
    }),
  );

  try {
    const adminPage = await adminCtx.newPage();
    const csrfToken = await csrfTokenFor(adminPage);

    await adminPage.goto('/verwaltung/aufgaben');
    await adminPage.getByRole('button', { name: 'Zufallszuweisung jetzt ausführen' }).click();
    const sweepStatus = adminPage.getByRole('status');
    await expect(sweepStatus).toContainText('Ergebnis:');
    const sweepResultText = ((await sweepStatus.textContent()) ?? '').trim();

    // Über alle vier Mitglieder verteilt suchen, wen der Sweep zufällig traf —
    // vorher steht das nicht fest (§6, "Die Zufallsauswahl muss technisch
    // nachvollziehbar sein", nicht aber vorhersagbar).
    let buyoutPage: Page | null = null;
    let buyoutKey: DemoUserKey | null = null;
    for (const member of members) {
      await member.page.goto('/aufgaben');
      await member.page.getByRole('tab', { name: 'Meine Aufgaben' }).click();
      const empty = member.page.getByText('Dir ist gerade nichts zugewiesen.', { exact: true });
      const article = member.page.getByRole('article').first();
      // Warten, bis entweder die Leermeldung oder eine Karte tatsächlich da
      // ist — sonst überholt die Prüfung das asynchrone Laden der Liste.
      await expect(empty.or(article)).toBeVisible();
      if (await article.isVisible().catch(() => false)) {
        buyoutPage = member.page;
        buyoutKey = member.key;
        break;
      }
    }

    test.skip(
      buyoutPage === null,
      `Sweep hat niemanden zufällig zugewiesen (${sweepResultText}) — vermutlich waren keine Aufgaben mehr offen.`,
    );
    if (buyoutPage === null || buyoutKey === null) return; // für TypeScript — test.skip hat den Test oben bereits beendet.

    await buyoutPage.getByRole('article').first().getByRole('button').click();
    await expect(buyoutPage).toHaveURL(/\/aufgaben\/.+/);

    // Bestätigt die Annahme: eine noch unbeantwortete Zufallszuweisung zeigt
    // "Aufgabe übernehmen" (Annehmen) statt direkt "erledigt" (§21).
    await expect(buyoutPage.getByRole('button', { name: 'Aufgabe übernehmen' })).toBeVisible();

    // §31: die Offenlegung mit allen fünf Werten steht schon vor jeder Entscheidung.
    await expect(buyoutPage.getByRole('heading', { name: 'Freikauf' })).toBeVisible();
    for (const label of [
      'Dein Punktestand',
      'Freikaufkosten',
      'Punktestand danach',
      'Aufgabenwert jetzt',
      'Aufgabenwert danach',
    ]) {
      await expect(buyoutPage.locator('dl').getByText(label, { exact: true })).toBeVisible();
    }

    let balanceBefore = await readDisclosureRow(buyoutPage, 'Dein Punktestand');
    const cost = await readDisclosureRow(buyoutPage, 'Freikaufkosten');

    if (balanceBefore < cost) {
      // Die zugeloste Person kann sich nach den Standardregeln
      // (`allowNegativeBalance: false`) nicht freikaufen — nicht weil der
      // Mechanismus kaputt ist, sondern weil sie zufällig noch nichts
      // verdient hat. Siehe Dateikopf.
      const membersRes = await adminPage.request.get('/api/members');
      const { items } = (await membersRes.json()) as {
        items: Array<{ id: string; displayName: string }>;
      };
      const target = items.find((m) => m.displayName === DEMO_USERS[buyoutKey].name);
      if (!target) throw new Error(`Mitglied "${DEMO_USERS[buyoutKey].name}" nicht in /api/members gefunden.`);
      await grantPoints(adminPage, csrfToken, target.id, cost - balanceBefore + 20);
      await buyoutPage.reload();
      await expect(buyoutPage.getByRole('heading', { name: 'Freikauf' })).toBeVisible();
      balanceBefore = await readDisclosureRow(buyoutPage, 'Dein Punktestand');
    }

    const balanceAfterQuote = await readDisclosureRow(buyoutPage, 'Punktestand danach');
    const valueBefore = await readDisclosureRow(buyoutPage, 'Aufgabenwert jetzt');
    const valueAfter = await readDisclosureRow(buyoutPage, 'Aufgabenwert danach');

    // §9 Default (packages/shared DEFAULT_CONFIG): MULTIPLIER × 1.5, CEIL, minimumIncrease 1.
    const expectedValueAfter = Math.max(Math.ceil(valueBefore * 1.5), valueBefore + 1);
    expect(valueAfter, 'Wertsteigerung entspricht nicht der konfigurierten Formel').toBe(
      expectedValueAfter,
    );
    // §8 Default: costStrategy CURRENT_TASK_VALUE, multiplier 1.0.
    expect(cost, 'Freikaufkosten weichen vom aktuellen Aufgabenwert ab').toBe(valueBefore);
    expect(balanceAfterQuote).toBe(balanceBefore - cost);
    expect(balanceBefore).toBeGreaterThanOrEqual(cost);

    await buyoutPage
      .getByRole('button', { name: new RegExp(`^Für ${cost} Punkte freikaufen$`) })
      .click();
    await expect(buyoutPage.getByRole('status')).toHaveText('OK');

    // §10: wieder verfügbar, mit dem gestiegenen Wert.
    await expect(buyoutPage.getByText('verfügbar', { exact: true })).toBeVisible();
    await expect(buyoutPage.getByRole('button', { name: 'Freiwillig übernehmen' })).toBeVisible();
    await expect(buyoutPage.getByRole('img', { name: /^Aktueller Wert/ })).toHaveAttribute(
      'aria-label',
      new RegExp(`Aktueller Wert ${expectedValueAfter} Punkte`),
    );

    // Punkte serverseitig bestätigt, nicht nur optimistisch in der UI (§36).
    await buyoutPage.goto('/');
    const balanceCard = buyoutPage.getByText('Dein Punktestand', { exact: true }).locator('..');
    await expect(balanceCard).toContainText(String(balanceAfterQuote));

    // Aufräumen: übrige Zufallszuweisungen (an dieselbe oder andere Personen)
    // abschließen statt ASSIGNED liegen zu lassen (§5.3 — sonst zieht der
    // nächste Seed-Lauf für diese Aufgabendefinition keine neue Instanz nach).
    for (const member of members) {
      await clearAssignedTasks(member.page);
    }
  } finally {
    await Promise.all(members.map((member) => member.ctx.close()));
    await adminCtx.close();
  }
});
