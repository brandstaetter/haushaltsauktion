---
title: "CI: E2E-Tests gegen einen temporären Wegwerf-Stack vor dem echten Deploy"
status: in-progress
priority: normal
target: .github/workflows/deploy.yml, docker-compose.yml, e2e/, playwright.config.ts, docs/hosting-plan.md
campaign: ci-e2e-tests-gegen-einen-tempor-ren-wegwerf-stack-vor-dem-echten-deploy
---

## Description

`.github/workflows/deploy.yml` führt aktuell im `test`-Job nur
`typecheck`/`lint`/`npm run test` (Vitest, inkl. Integrationstests gegen
einen Postgres-Service-Container) aus — die Playwright-E2E-Suite (`e2e/`,
`playwright.config.ts`) läuft in CI **nicht**. Sie startet lokal API und
Web-Dev-Server per `webServer`-Konfig direkt aus dem Quellcode (`npx tsx
apps/api/src/main.ts`, Vite-Dev-Server), nicht aus den tatsächlich
gebauten Docker-Images.

`docs/hosting-plan.md` §3.1 verweist bereits darauf, dass fachliche
Korrektheit "die E2E-Suite ... abdeckt", aber diese Abdeckung existiert in
der Pipeline aktuell nicht — die Images werden nach `build-and-push` direkt
per SSH auf die Produktionsinstanz deployt (`deploy`-Job), ohne dass die
tatsächlich gebauten Container jemals gegen einen echten Browser-Flow
getestet wurden. Der Post-Deploy Health Check (§3.1) prüft nur, dass
Container hochkommen, ausdrücklich nicht die fachliche Korrektheit.

Gewünscht: ein zusätzlicher CI-Schritt, der zwischen `build-and-push` und
`deploy` (oder alternativ zusätzlich zum bestehenden `test`-Job, vor dem
Push nach ECR) einen temporären, isolierten Stack aus den frisch gebauten
Images hochfährt (z. B. per `docker compose` mit eigenem Projektnamen/Netz
und Wegwerf-Postgres — nicht die Produktionsdatenbank), die
Playwright-E2E-Suite dagegen laufen lässt, und den Stack danach wieder
vollständig abbaut — unabhängig vom Ausgang. Ein Fehlschlag muss den
Workflow vor `deploy` stoppen (kein Deploy auf rot).

Dieser Schritt soll außerdem als Teil der PR-Checks laufen, nicht nur beim
Deploy-Workflow auf `main`. `deploy.yml` triggert aktuell nur auf
`push: branches: [main]` und `workflow_dispatch` — anders als
`gitleaks.yml`, das zusätzlich `pull_request` als Trigger hat. Der neue
Wegwerf-Stack-plus-E2E-Schritt (mitsamt Image-Build, ohne den Push nach ECR
und ohne den `deploy`-Job) muss daher auch bei einem `pull_request`-Event
laufen, damit E2E-Regressionen schon vor dem Merge auffallen und nicht erst
beim Deploy von `main`.

## Acceptance Criteria

- Neuer CI-Job (oder Erweiterung eines bestehenden) baut die tatsächlichen
  Docker-Images (API + Web, ggf. wiederverwendet aus `build-and-push`) und
  startet sie zusammen mit einer eigenen, temporären Postgres-Instanz als
  Wegwerf-Stack — getrennt von Produktionsdaten/-instanz.
- Die bestehende Playwright-E2E-Suite (`e2e/*.spec.ts`) läuft gegen diesen
  Wegwerf-Stack (echte Container statt `tsx`/Vite-Dev-Server), inkl. Seed
  über `e2e/global-setup.ts` bzw. einem äquivalenten Weg für den
  Container-Betrieb.
- Der Wegwerf-Stack wird nach dem Lauf zuverlässig abgebaut (auch bei
  fehlgeschlagenen Tests) — kein Ressourcen-Leck in der CI-Umgebung.
- Schlagen die E2E-Tests fehl, bricht die Pipeline vor dem `deploy`-Job
  ab; die Produktionsinstanz wird nicht angefasst.
- CI-Laufzeit bleibt in einem vertretbaren Rahmen (die Suite ist bewusst
  `workers: 1`, nicht parallelisiert — ggf. dokumentieren, was das für die
  Gesamtlaufzeit des Workflows bedeutet).
- `docs/hosting-plan.md` §3 (Deployment-Fluss) und §10
  (Implementierte CI/CD-Artefakte) aktualisiert, damit sie den neuen Schritt
  korrekt widerspiegeln.
- Der Wegwerf-Stack-plus-E2E-Schritt läuft auch als PR-Check (Trigger
  `pull_request`, analog zu `gitleaks.yml`), unabhängig davon, ob im
  selben Lauf ein Deploy stattfindet — `build-and-push` (Push nach ECR)
  und `deploy` (SSH auf die Produktionsinstanz) dürfen dabei nicht
  mitlaufen, nur Build + Wegwerf-Stack + E2E.
- Auf `main` bleibt der bestehende Ablauf (`test` → `build-and-push` →
  `deploy`) erhalten, ergänzt um den neuen E2E-Schritt vor `deploy`; die
  vorhandenen Jobs und ihre Gates ändern sich ansonsten nicht.

## Notes

Betrifft nur `.github/workflows/deploy.yml` und die E2E-Infrastruktur,
nicht die Produktions-Compose-Datei (`deploy/docker-compose.prod.yml`) —
der Wegwerf-Stack braucht ein eigenes, von Produktion unabhängiges Compose-
Setup (neuer CI-spezifischer Compose-File oder Erweiterung des
Root-`docker-compose.yml`, mit klarer Trennung von Secrets/Zugangsdaten).
