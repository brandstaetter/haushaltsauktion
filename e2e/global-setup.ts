/**
 * Stellt vor dem Testlauf die Demo-Daten aus §38 her.
 *
 * Der Seed ist idempotent: er legt „Demo Family“ mit vier Mitgliedern, vier
 * Kategorien und sechs Aufgaben an oder aktualisiert sie. Damit starten die
 * Tests auf einer bekannten Basis, ohne die Datenbank zu löschen — ein
 * `migrate reset` würde die Arbeit anderer Prozesse an derselben Instanz
 * mitreißen.
 *
 * Der Seed allein reicht bei wiederholten Läufen nicht: er veröffentlicht nur
 * dann eine neue Instanz, wenn deren Fälligkeit nach §18 tatsächlich erreicht
 * ist und noch keine offene Instanz existiert (§5.3). `flow-1` erledigt eine
 * Aufgabe, `flow-2`s Wettlauf-Gewinner lässt eine `ASSIGNED` zurück — beides
 * korrektes Verhalten, aber am selben Kalendertag erzeugt es keine neue
 * Gelegenheit. Zusätzlich braucht der Zufallszug eine *reife* Instanz
 * (`offerExpiresAt <= now`) — `playwright.config.ts` schaltet den
 * Hintergrund-Sweep-Timer für den E2E-Lauf ab, damit er nicht selbst welche
 * mit einer erst in der Zukunft reifen Frist materialisiert, aber Instanzen,
 * die eine frühere Sitzung schon so angelegt hat, bleiben davon unberührt.
 * `e2e-fixture-refresh` räumt beides auf: siehe die Begründung dort.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default function globalSetup(): void {
  // Über die Shell, weil `npx` unter Windows ein `.cmd` ist und `execFileSync`
  // ein Batch-Skript nicht direkt starten kann (EINVAL).
  // `--env-file`, weil `tsx` — anders als die Prisma-CLI — keine `.env` liest.
  execSync('npx tsx --env-file=.env apps/api/prisma/seed.ts', {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  execSync('npx tsx --env-file=.env apps/api/prisma/e2e-fixture-refresh.ts', {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}
