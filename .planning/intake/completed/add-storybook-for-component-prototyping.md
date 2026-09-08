---
title: "Storybook für apps/web hinzufügen — Komponenten isoliert entwerfen und prototypen"
status: completed
priority: normal
target: apps/web/package.json, apps/web/.storybook/, apps/web/src/components/**/*.stories.tsx
campaign: storybook-f-r-apps-web-hinzuf-gen-komponenten-isoliert-entwerfen-und-prototypen
---

## Description

Aktuell gibt es keine Möglichkeit, die Komponenten aus `apps/web/src/
components/` (`Button`, `TaskCard`, `Nav`, `Sheet`, `Toast`, `ValueChip`,
`StatusBadge`, `CategoryBadge`, `DurationInput`, `TimeOfDayInput`,
`AssignmentExplanation`, `BuyoutDisclosure`, `NotificationBell`,
`InstallPrompt`, `Layout` — 15 Komponenten) isoliert von der laufenden
Anwendung zu betrachten oder mit neuen Varianten zu experimentieren. Jede
Komponente hat ihr eigenes CSS-Module (`*.module.css`) und folgt den
zentralen Design-Tokens in `apps/web/src/styles/tokens.css`/`global.css`;
ein Prototyping-Wechsel erfordert heute, die App lokal zu starten und
manuell zum passenden Screen zu navigieren.

Storybook würde erlauben, jede Komponente einzeln mit ihren Props/States
zu rendern (z. B. `Button` in allen Größen/Varianten, `TaskCard` in den
verschiedenen `TaskInstance`-Status, `Sheet`/`Toast` in offenem/
geschlossenem Zustand), ohne Backend oder Routing.

Relevanter Stack (`apps/web/package.json`): Vite 6, React 19, TypeScript
~5.9, CSS Modules, Vitest 4 als Testrunner, ESLint 9 (flat config, siehe
Root-`eslint.config.*`). Storybook muss mit dem vorhandenen Vite-Setup
(`@storybook/react-vite`) statt Webpack laufen, und darf die bestehende
Vite-Config/PWA-Plugin-Konfiguration (`vite-plugin-pwa`) nicht stören.

## Acceptance Criteria

- Storybook (aktuelle Major-Version, Vite-Builder `@storybook/react-vite`)
  ist als Dev-Dependency in `apps/web` (nicht root) installiert und per
  `npm run storybook -w apps/web` (oder gleichwertigem Skript in `apps/
  web/package.json`) lokal startbar.
- Mindestens 3-5 bestehende Komponenten (z. B. `Button`, `TaskCard`,
  `StatusBadge`) bekommen eine `*.stories.tsx`-Datei neben der
  Komponente, die ihre wichtigsten Prop-Varianten zeigt — als
  Grundmuster für weitere Stories, nicht als vollständige Abdeckung
  aller 15 Komponenten.
- Design-Tokens (`apps/web/src/styles/tokens.css`, `global.css`) werden
  in Storybook geladen, sodass Farben/Typografie/Spacing wie in der
  echten App aussehen — keine isolierte, abweichende Storybook-eigene
  Stildatei.
- Storybook-Build/-Start ist von CI und vom normalen `npm run build`/
  `npm run dev`-Workflow der App unabhängig — läuft nicht automatisch in
  bestehenden Skripten mit, bricht sie nicht.
- `npm run typecheck` und `npm run lint` (Root-Skripte) bleiben grün mit
  den neuen Storybook-Konfigurationsdateien und Story-Dateien im Baum
  (ESLint-Konfiguration ggf. um Storybook-Dateien/-Regeln ergänzen, falls
  nötig).
- Kurzer Hinweis in `apps/web`s README oder Root-`README.md`, wie
  Storybook lokal gestartet wird.
