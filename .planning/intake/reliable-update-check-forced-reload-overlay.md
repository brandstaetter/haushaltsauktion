---
title: "Update-Check unzuverlässig: Versionsprüfung bei jedem Backend-Call statt SW-Lifecycle, sofortiges blockierendes Reload-Overlay"
status: completed
priority: urgent
target: apps/api/src/infra/http/server.ts, apps/web/src/api/client.ts, apps/web/src/components/UpdatePrompt/UpdatePrompt.tsx, apps/web/vite.config.ts
campaign: update-check-unzuverl-ssig-versionspr-fung-bei-jedem-backend-call-statt-sw-lifec
---

## Description

Der aktuelle Update-Mechanismus (intake "notify-on-new-deploy-and-refresh-cache",
bereits umgesetzt) basiert ausschließlich auf `vite-plugin-pwa`s
Service-Worker-Lifecycle: `registerType: 'prompt'` in `apps/web/vite.config.ts:22`,
`useRegisterSW()` in `UpdatePrompt.tsx` liefert `needRefresh`, sobald der Browser
selbst einen neuen Service Worker registriert. Das Problem daran (Nutzerbeschwerde):
Browser prüfen einen registrierten Service Worker standardmäßig nur bei
Navigation/Tab-Neuladen auf ein Update, nicht bei jedem API-Call — es gibt keinen
konfigurierten `periodicSync`/Intervall-Check (`vite.config.ts` VitePWA-Block hat
kein `onRegisteredSW` mit `setInterval(() => registration.update(), …)`). Bei einem
langlebigen offenen Tab (die App pollt laut `UpdatePrompt.tsx`-Kommentar ohnehin
`/dashboard`/`/notifications` alle 30s) kann es deshalb mehrere manuelle
Neuladevorgänge dauern, bis der Browser den neuen Service Worker überhaupt bemerkt.

Gewünschte Änderung — zwei Teile:

1. **Versionsprüfung bei jedem Backend-Call statt SW-Polling.** `apps/api/src/infra/http/server.ts:36`
   (`buildServer`) ist der zentrale Fastify-Bootstrap-Punkt, an dem bereits Hooks
   registriert werden (`app.addHook('preHandler', …)`, Zeile 61/66) — ein `onSend`-Hook
   dort könnte auf **jede** Antwort einen Versions-/Build-Identifier-Header setzen
   (z. B. `X-App-Version`, gespeist aus Git-SHA/Build-Timestamp zur Deploy-Zeit statt
   `package.json`s statischer `0.1.0`, die pro Deploy nie erhöht wird). Der einzige
   Funnel-Punkt für jeden Frontend-Request ist bereits vorhanden:
   `apps/web/src/api/client.ts:29` (`api()`), durch den jeder Backend-Call läuft —
   dort könnte der Header bei jeder Antwort gegen eine zur Build-Zeit ins Frontend
   eingebettete Version verglichen werden (aktuell existiert keine solche
   Build-Zeit-Konstante — kein `import.meta.env.VITE_APP_VERSION` o. Ä. in
   `vite.config.ts`, das müsste neu eingeführt werden).
2. **Sofortiges blockierendes Overlay statt dismissbarem Banner.** `UpdatePrompt.tsx`
   zeigt heute laut eigenem Kommentar bewusst ein dismissbares Banner mit
   erforderlichem Klick, keine automatische Aktualisierung — Begründung dort: ein
   langlebiger Tab soll nicht "unter den Füßen" der Nutzerin plötzlich neu laden,
   während sie gerade mit Punktesalden/Aufgabenwerten arbeitet (vgl. CLAUDE.md §31
   "keine manipulativen Dark Patterns", was hier eher für "kein erzwungenes
   Verhalten" als für "kein Blockieren" stand). Der neue Wunsch kehrt das explizit
   um: sobald eine neue Version erkannt wird, soll sofort ein Overlay erscheinen,
   das die gesamte UI blockiert (keine Interaktion mehr möglich) und einen Reload
   erzwingt — kein Dismiss, keine Wahl.

## Spannungspunkt fürs Briefing

Diese Anfrage widerspricht bewusst zwei früheren, dokumentierten Entscheidungen
(beide in `UpdatePrompt.tsx`/`vite.config.ts`-Kommentaren begründet):
`registerType: 'prompt'` statt `'autoUpdate'` und ein dismissbares statt
erzwungenes Banner — beide explizit gewählt, damit ein offener Tab nicht
unangekündigt unter der Nutzerin wegreloadet. Das Briefing sollte klären, ob:

- das neue Overlay das bestehende `UpdatePrompt`-Banner vollständig ersetzt, oder
- es eine Eskalationsstufe ist (z. B. Banner zuerst, Overlay erst nach N Minuten
  ohne Reaktion oder nach mehrfachem Dismiss).

Serverseitig ist ohnehin nichts inhaltlich unsicher, falls ein Client kurzzeitig
eine alte Version fährt (§36: Businesslogik ist ausschließlich serverseitig
verbindlich, der Server validiert jede Aktion unabhängig vom Client-Build) — das
Problem ist rein UX/Koordination ("warum sieht mein Bildschirm anders aus"), kein
Korrektheits- oder Sicherheitsrisiko. Das relativiert die Dringlichkeit eines
harten Zwangs-Reloads gegenüber der bisherigen bewussten Zurückhaltung und sollte
im Briefing gegen die Nutzerfreundlichkeit abgewogen werden.

## Acceptance Criteria

- Jede Antwort des Backends (nicht nur eine dedizierte Version-Route) trägt einen
  Versions-/Build-Identifier, der sich bei jedem Deploy ändert (Git-SHA oder
  Build-Timestamp — nicht `package.json`s manuell gepflegte Semver, die aktuell
  nie erhöht wird).
- Das Frontend vergleicht diesen Identifier bei **jedem** API-Aufruf (über den
  zentralen `api()`-Funnel in `apps/web/src/api/client.ts`, nicht punktuell pro
  Seite) gegen die zur Build-Zeit ins Bundle eingebettete eigene Version.
- Sobald ein Mismatch erkannt wird, erscheint sofort ein Overlay, das die gesamte
  Seite blockiert (keine weiteren Klicks/Eingaben möglich) und einen Reload
  erzwingt — ohne Dismiss-Option.
- Der bestehende service-worker-basierte Mechanismus (`UpdatePrompt.tsx`,
  `registerType: 'prompt'`) wird im Rahmen dieses Tickets bewusst abgelöst oder
  ergänzt (zu entscheiden im Briefing, siehe Spannungspunkt oben) — nicht
  stillschweigend beide parallel unkoordiniert weiterlaufen lassen.
- Der neue Header-Vergleich darf keine falsch-positiven Reloads durch Caching
  auslösen (z. B. ein von einem Proxy/Service-Worker gecachtes altes `api()`-Response
  mit veraltetem Header) — `workbox.navigateFallbackDenylist` schließt `/api/*`
  bereits von SW-Caching aus (`vite.config.ts:34`), das bleibt so.
- Serverseitig verbindlich (§36): der Versions-Header ist rein informativ für den
  Client, keine Autorisierungs- oder Geschäftslogik hängt clientseitig daran.
