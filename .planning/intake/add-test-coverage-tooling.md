---
title: "Keine Code-Coverage-Messung für apps/api oder apps/web"
status: completed
priority: normal
target: apps/api/vitest.config.ts, apps/web/vitest.config.ts, apps/api/package.json, apps/web/package.json, package.json, .github/workflows/deploy.yml
campaign: keine-code-coverage-messung-f-r-apps-api-oder-apps-web
---

## Description

Im Rahmen einer adversarialen Codebase-Review (Architektur, Tests, Sicherheit)
wurde geprüft, ob die Test-Coverage von `apps/api` und `apps/web` gemessen
werden kann. Ergebnis: **es gibt aktuell keinerlei Coverage-Tooling im
Projekt.**

Konkret geprüft:
- `apps/api/package.json`, `apps/web/package.json`, root `package.json`:
  keine `@vitest/coverage-v8` (oder vergleichbare) Dependency.
- `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`: kein
  `test.coverage`-Block.
- Kein `coverage`-Script in irgendeinem `package.json`.
- `.github/workflows/deploy.yml`: der `test`-Job ruft `npm run test
  --workspaces` auf, aber nirgends mit `--coverage`.

Das Testsuite selbst ist qualitativ stark — die sieben in CLAUDE.md §35
verlangten Szenarien sind namentlich als eigene `describe`-Blöcke vorhanden
(`apps/api/test/domain/economy.test.ts`), und
`apps/api/test/integration/concurrency.test.ts` erzwingt eine echte Race
über `pg_blocking_pids` statt einer Sleep-basierten Simulation. 431 Tests
(239 domain + 70 integration + 122 web) laufen aktuell grün, `tsc --noEmit`
und `eslint .` sind sauber.

Aber ohne Coverage-Zahlen lässt sich das nur qualitativ durch Lesen der
Testdateien beurteilen — eine neue Codezeile ohne zugehörigen Test fällt
weder lokal noch in CI mechanisch auf. Gerade bei einer money-kritischen
Domäne (Punkte-Ledger, Freikauf-Formeln) wäre ein Coverage-Gate ein
sinnvoller zusätzlicher Schutz gegen unbemerkt ungetestete Pfade.

## Acceptance Criteria

- `apps/api` und `apps/web` haben je ein konfiguriertes Coverage-Provider
  (z. B. `@vitest/coverage-v8`) und einen `coverage`-Script-Eintrag
  (`vitest run --coverage`).
- Ein `npm run coverage --workspaces` (oder gleichwertig) von der
  Repo-Wurzel aus erzeugt für beide Workspaces einen Report.
- CI (`deploy.yml`) erzeugt den Report zumindest als Artefakt oder
  Text-Zusammenfassung im Log; ein hartes Coverage-Minimum als Gate ist
  optional und liegt bei der Umsetzung — wichtig ist, dass Coverage-Zahlen
  ab sofort sichtbar und nicht mehr nur aus dem Testdateien-Lesen ableitbar
  sind.
- `domain/` (die reine Geschäftslogik) sollte dabei separat ausgewiesen
  werden können, da dieser Layer laut Architekturdoku die höchste Priorität
  für vollständige Abdeckung hat.

## Notes

Kein akuter Bug — die vorhandenen Tests sind bereits sehr gezielt und
decken die kritischen Invarianten (§44) nachweislich ab. Dies ist reines
Tooling-Fehlen, das Regressionen in ungetesteten Randfällen zukünftig
verhindern würde.
