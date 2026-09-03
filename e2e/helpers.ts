/**
 * Gemeinsame Bausteine der E2E-Tests.
 *
 * Bewusst über Rollen und sichtbaren deutschen Text lokalisiert, nicht über
 * `data-testid`: die Anwendung führt diese Konvention nirgends, und eine
 * Suchhilfe, die es nur für Tests gibt, verrutscht bei der ersten Umgestaltung
 * unbemerkt. Bricht dagegen ein Text, ist das eine echte Änderung an dem, was
 * die Familie liest.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

/** Aus `apps/api/prisma/seed.ts` (§38). */
export const DEMO_PASSWORD = 'demo1234';

export const DEMO_USERS = {
  elke: { name: 'Elke', email: 'elke@demo.local' },
  arthur: { name: 'Arthur', email: 'arthur@demo.local' },
  luise: { name: 'Luise', email: 'luise@demo.local' },
  hannes: { name: 'Hannes', email: 'hannes@demo.local' },
} as const;

export type DemoUserKey = keyof typeof DEMO_USERS;

const authDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');

/**
 * Wo die Sitzung einer Demo-Person zwischen den Tests liegt.
 *
 * Der Anmelde-Endpunkt ist auf fünf Versuche je fünf Minuten begrenzt (§36) —
 * eine Schutzmaßnahme, die für Tests nicht aufgeweicht wird. Deshalb meldet
 * sich jede Person genau einmal je Lauf an (`auth.setup.ts`), und alle
 * weiteren Tests übernehmen das Sitzungs-Cookie.
 */
export function storageStatePath(key: DemoUserKey): string {
  return path.join(authDir, `${key}.json`);
}

/** Erzwingt einen Test ohne Sitzung, unabhängig vom Projekt-Default. */
export const NO_SESSION = { cookies: [], origins: [] };

/** Die sechs Aufgaben aus §38, wie der Seed sie anlegt. */
export const SEEDED_TASK_TITLES = [
  'Geschirrspüler ausräumen',
  'Müll hinausbringen',
  'Wäsche aufhängen',
  'Staubsaugen',
  'Bad putzen',
  'Küche gründlich reinigen',
] as const;

/** Trifft jeden der sechs Aufgabentitel, egal in welchem Satz er steht. */
export const SEEDED_TASK_TITLE_PATTERN = new RegExp(
  SEEDED_TASK_TITLES.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

/**
 * Meldet eine Demo-Person an und wartet, bis das Dashboard steht.
 *
 * Nutzt die Schnellwahl der Anmeldeseite (nur im Dev-Build sichtbar), die die
 * Felder füllt, aber nicht absendet — abgeschickt wird bewusst über denselben
 * Knopf, den auch eine Person drückt.
 */
export async function loginAsDemoUser(page: Page, key: DemoUserKey): Promise<void> {
  const user = DEMO_USERS[key];

  await page.goto('/login');
  await page.getByRole('button', { name: user.name, exact: true }).click();

  await expect(page.getByLabel('Benutzername oder E-Mail')).toHaveValue(user.email);
  await expect(page.getByLabel('Passwort')).toHaveValue(DEMO_PASSWORD);

  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

  await expect(page.getByRole('heading', { name: `Hallo ${user.name}` })).toBeVisible();
}

/**
 * Liest den Punktestand von der Startseite (§19 „Für mich“).
 *
 * Navigiert selbst dorthin, damit ein Aufruf immer den aktuell vom Server
 * gelieferten Stand liefert statt eines möglicherweise veralteten React-Query-
 * Caches auf einer anderen Seite.
 */
export async function readDashboardBalance(page: Page): Promise<number> {
  await page.goto('/');
  const card = page.getByText('Dein Punktestand', { exact: true }).locator('..');
  await expect(card).toBeVisible();
  const text = (await card.textContent()) ?? '';
  const match = /Dein Punktestand\s*(-?[\d.]+)/.exec(text);
  const raw = match?.[1];
  if (!raw) throw new Error(`Punktestand nicht lesbar aus: "${text}"`);
  return Number.parseInt(raw.replace(/\./g, ''), 10);
}

/**
 * Liest den aktuellen Aufgabenwert aus dem `ValueChip` auf der Detailseite.
 *
 * Der sichtbare Zahlentext ist `aria-hidden` (§31 — die Chip-Grafik ist
 * dekorativ), das barrierefreie `aria-label` trägt denselben Wert in Worten
 * und ist deshalb die verlässlichere Quelle für einen Test.
 */
export async function readCurrentTaskValue(page: Page): Promise<number> {
  const chip = page.getByRole('img', { name: /^Aktueller Wert/ });
  const label = await chip.getAttribute('aria-label');
  const match = label ? /Aktueller Wert (-?\d+) Punkte/.exec(label) : null;
  const raw = match?.[1];
  if (!raw) throw new Error(`Aufgabenwert nicht lesbar aus: "${label}"`);
  return Number.parseInt(raw, 10);
}

/**
 * Öffnet von der Aufgabenliste aus die erste freiwillig verfügbare Aufgabe.
 *
 * Sucht bewusst nach *irgendeiner* verfügbaren Aufgabe statt einen Titel aus
 * dem Seed fest zu verdrahten — andere Tests im selben Lauf können bereits
 * einzelne Aufgaben übernommen haben (Modul-Kommentar in `helpers.ts`).
 */
export async function openFirstAvailableTask(page: Page): Promise<{ title: string; url: string }> {
  await page.goto('/aufgaben');
  await expect(page.getByRole('tablist')).toBeVisible();

  const empty = page.getByText('Gerade nichts offen.', { exact: true });
  const firstCard = page.getByRole('article').first();
  await expect(empty.or(firstCard)).toBeVisible();

  if (await empty.isVisible()) {
    throw new Error('Keine freiwillig verfügbare Aufgabe zum Testen gefunden.');
  }

  const title = (await firstCard.getByRole('heading', { level: 3 }).textContent())?.trim() ?? '';
  await firstCard.getByRole('button', { name: 'Freiwillig übernehmen' }).click();
  await expect(page).toHaveURL(/\/aufgaben\/.+/);

  return { title, url: page.url() };
}

/**
 * Nimmt alle noch offenen Zuweisungen der angemeldeten Person entgegen und
 * erledigt sie (Zufallszuweisungen zunächst per „Aufgabe übernehmen“, §21).
 *
 * Reines Aufräumen für die Tests, die eine Person zufällig zugewiesen
 * bekommen, aber nicht für den Freikauf oder eine eigene Prüfung brauchen —
 * sonst bliebe die Aufgabe `ASSIGNED` liegen und würde weder beim nächsten
 * Testlauf neu ausgeboten (`maxOpenInstancesPerDefinition`, §5.3) noch aus der
 * Liste offener Aufgaben verschwinden.
 */
export async function clearAssignedTasks(page: Page): Promise<string[]> {
  const completed: string[] = [];

  for (let guard = 0; guard < 10; guard += 1) {
    await page.goto('/aufgaben');
    await page.getByRole('tab', { name: 'Meine Aufgaben' }).click();

    const empty = page.getByText('Dir ist gerade nichts zugewiesen.', { exact: true });
    const firstCard = page.getByRole('article').first();
    await expect(empty.or(firstCard)).toBeVisible();
    if (await empty.isVisible()) break;

    const title = (await firstCard.getByRole('heading', { level: 3 }).textContent())?.trim() ?? '';

    await firstCard.getByRole('button').click();
    // `waitForURL` alone is not enough here: react-router v7 wraps `navigate()`
    // in a transition, so the URL updates before the new route's DOM commits —
    // React keeps the *old* page's content on screen until the new one is
    // ready, to avoid a loading flash. Waiting only on the URL let the button
    // queries below race the still-mounted list ("Meine Aufgaben") DOM, which
    // — when more than one task is assigned at once (several ripe instances
    // in the same sweep) — has several same-named "Als erledigt markieren"
    // buttons, one per card, and threw a strict-mode multi-match. Waiting for
    // *this task's own heading* only resolves once the detail page has
    // actually painted, which is the real signal we need.
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    // Danach entscheiden, welcher Knopf da ist — sonst rennt die Prüfung dem
    // asynchronen Laden davon und übersieht "Aufgabe übernehmen" (§4.6-Race).
    const acceptButton = page.getByRole('button', { name: 'Aufgabe übernehmen' });
    const completeButton = page.getByRole('button', { name: 'Als erledigt markieren' });
    await expect(acceptButton.or(completeButton)).toBeVisible();

    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      await expect(page.getByRole('status')).toHaveText('OK');
    }

    // `useAcceptAssignment`'s query invalidation is fire-and-forget, so the
    // button swap from "Aufgabe übernehmen" to "Als erledigt markieren" isn't
    // guaranteed to have landed yet — this assertion's own auto-retry is what
    // actually waits it out, not the click above.
    await expect(completeButton).toBeVisible();
    await completeButton.click();
    await expect(page.getByRole('status')).toHaveText('OK');
    completed.push(title);
  }

  return completed;
}

/**
 * Prüft, dass die Seite nicht seitlich scrollt (§19, §31 — „mobile first“).
 *
 * Ein einziges zu breites Element genügt, um auf dem Telefon horizontales
 * Scrollen auszulösen; genau das fängt dieser Vergleich ab.
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    metrics.scrollWidth,
    `Dokument ist ${metrics.scrollWidth}px breit, sichtbar sind ${metrics.clientWidth}px ` +
      `(body: ${metrics.bodyScrollWidth}px) — die Seite scrollt horizontal.`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

/**
 * Prüft, dass ein Element seinen Text nur an Wortgrenzen umbricht, nie
 * mitten im Wort (§31 — hier für den Aktions-Button auf der `TaskCard`).
 *
 * Liest die tatsächlich gerenderten Zeilenumbrüche über
 * `Range.getClientRects()` aus (jede Zeichenposition bekommt ihr eigenes
 * Rect, ein Sprung in der vertikalen Position markiert einen Zeilenumbruch),
 * statt nur die berechneten CSS-Eigenschaften zu prüfen — das erfasst auch,
 * ob der verfügbare Platz überhaupt für einen sauberen Umbruch reicht.
 */
export async function expectNoMidWordWrap(locator: Locator): Promise<void> {
  const result = await locator.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode() as Text | null;
    if (!textNode) return { breaks: [] as number[], text: '' };

    const text = textNode.textContent ?? '';
    const range = document.createRange();
    const breaks: number[] = [];
    let lastTop: number | null = null;
    for (let i = 0; i < text.length; i += 1) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      if (lastTop !== null && Math.abs(rect.top - lastTop) > 1) {
        breaks.push(i);
      }
      lastTop = rect.top;
    }
    return { breaks, text };
  });

  for (const index of result.breaks) {
    const before = result.text[index - 1];
    const after = result.text[index];
    expect(
      before === ' ' || after === ' ',
      `Zeilenumbruch mitten im Wort in "${result.text}" bei Position ${index}.`,
    ).toBe(true);
  }
}

/**
 * Prüft, dass ein Element seinen Text in genau einer Zeile darstellt — kein
 * Umbruch, auch nicht sauber an einer Wortgrenze (§31 — hier für Nav-Labels:
 * anders als beim Aktions-Button auf der `TaskCard`, wo ein Umbruch an der
 * Wortgrenze in Ordnung ist, macht bei der unteren Navigation schon *ein*
 * zusätzlicher Umbruch den betroffenen Eintrag höher als seine Nachbarn und
 * verschiebt die ganze Leiste — es zählt jeder Umbruch, nicht nur ein
 * mitten-im-Wort-Umbruch).
 *
 * Nutzt dieselbe `Range.getClientRects()`-Technik wie `expectNoMidWordWrap`.
 */
export async function expectNoLineWrap(locator: Locator): Promise<void> {
  const result = await locator.evaluate((el) => {
    // Skip whitespace-only text nodes (e.g. a stray text node between an
    // icon element and the label `<span>`) rather than blindly taking the
    // first one — that would silently check zero/whitespace content and let
    // an actually-wrapped label pass.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    for (let candidate = walker.nextNode() as Text | null; candidate; candidate = walker.nextNode() as Text | null) {
      if ((candidate.textContent ?? '').trim().length > 0) {
        textNode = candidate;
        break;
      }
    }
    if (!textNode) return { lines: 0, text: '' };

    const text = textNode.textContent ?? '';
    const range = document.createRange();
    let lines = text.length > 0 ? 1 : 0;
    let lastTop: number | null = null;
    for (let i = 0; i < text.length; i += 1) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      if (lastTop !== null && Math.abs(rect.top - lastTop) > 1) {
        lines += 1;
      }
      lastTop = rect.top;
    }
    return { lines, text };
  });

  expect(result.lines, `"${result.text}" bricht in ${result.lines} Zeilen um.`).toBeLessThanOrEqual(1);
}

/**
 * Prüft, dass ein Element seinen Text vollständig zeigt statt ihn per
 * `text-overflow: ellipsis` abzuschneiden (§31 — Nav-Labels dürfen wieder
 * sichtbaren Text tragen; ein "…" ist genauso unlesbar wie ein Umbruch, nur
 * dass `expectNoLineWrap` es nicht bemerkt, weil `white-space: nowrap` einen
 * Umbruch ohnehin strukturell ausschließt — hier zählt stattdessen, ob der
 * Inhalt breiter ist als die sichtbare Box).
 */
export async function expectNoTextTruncation(locator: Locator): Promise<void> {
  const result = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    text: (el.textContent ?? '').trim(),
  }));

  // 1px Toleranz für Subpixel-Rundung beim Messen selbst, nicht als
  // erlaubter Abschneide-Spielraum für echten Text.
  expect(
    result.scrollWidth,
    `"${result.text}" ist auf ${result.clientWidth}px abgeschnitten (benötigt ${result.scrollWidth}px).`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}
