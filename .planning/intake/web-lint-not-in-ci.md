---
title: "apps/web ist von ESLint ausgenommen und wird in CI nicht gelintet"
status: pending
priority: normal
target: eslint.config.js, .github/workflows/deploy.yml, apps/web/vitest.config.ts
---

## Description

Während der Arbeit an den Kategorien-Sektionen (`CategoriesSection.tsx`,
`MembersSection.tsx`) fiel auf: `apps/web/vitest.config.ts` hat einen
ESLint-Fehler (`@typescript-eslint/triple-slash-reference` — eine
Triple-Slash-Referenz auf `vitest/config` statt eines `import`).

Der Fehler taucht aber **nicht** auf, wenn CI läuft — nur wenn man `eslint .`
direkt in `apps/web/` ausführt. Grund: `eslint.config.js` (Root) schließt
`apps/web/**` explizit aus (`ignores: [..., 'apps/web/**']`, Zeile 66) — das
war offenbar beabsichtigt für die Backend-spezifischen Architekturregeln
(§7.4-Importmatrix etc.), die für React/Vite-Code nicht gelten. `apps/web`
hat aber sein eigenes, unabhängiges `eslint.config.js`-Setup und einen
eigenen `lint`-Script-Eintrag (`apps/web/package.json`: `"lint": "eslint ."`).

Das Problem: `.github/workflows/deploy.yml`s `test`-Job (Zeile 47-56) ruft
nur das Root-`npm run lint` auf (`eslint .` von der Repo-Wurzel aus) —
wegen des `apps/web/**`-Ignores lintet das nichts in `apps/web`. Es gibt
sonst keinen CI-Schritt, der `apps/web`s eigenes `npm run lint` ausführt.
Damit ist der komplette Frontend-Code aktuell in CI **ungelintet** — ein
Lint-Fehler in `apps/web` (wie der obige) wird nie einen CI-Lauf rot
einfärben, egal wie offensichtlich er lokal ist.

Root-`npm run lint` selbst läuft sauber durch (bestätigt lokal), weil es
`apps/web` gar nicht erst betritt — das täuscht eine grüne CI vor, obwohl
ein ganzer Workspace am Lint-Gate vorbeiläuft.

## Acceptance Criteria

- Der bestehende `@typescript-eslint/triple-slash-reference`-Fehler in
  `apps/web/vitest.config.ts` ist behoben (Triple-Slash-Referenz durch einen
  passenden `import`-Weg ersetzt), sodass `npm run lint -w apps/web` sauber
  durchläuft.
- `apps/web` wird tatsächlich in CI gelintet — entweder indem
  `deploy.yml`s `test`-Job einen zusätzlichen Schritt bekommt (z. B.
  `npm run lint -w apps/web` bzw. `npm run lint --workspaces`), oder indem
  das Root-`eslint.config.js` so erweitert wird, dass es `apps/web` mit
  einem für den React/Vite-Code passenden Regelsatz mit abdeckt. Die Wahl
  zwischen beiden Ansätzen liegt bei der Umsetzung — entscheidend ist, dass
  ein Lint-Fehler in `apps/web` künftig einen CI-Lauf rot einfärbt.
- Nach der Änderung läuft CI (`test`-Job) weiterhin grün auf dem aktuellen
  `main`-Stand (abgesehen vom oben behobenen, vorbestehenden Fehler).
