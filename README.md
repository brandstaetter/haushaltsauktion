# Haushaltsauktion

Eine faire, spielerische Verteilung von Haushaltsaufgaben innerhalb einer
Familie oder kleinen Gruppe: Aufgaben können freiwillig übernommen werden
(und bringen dann Punkte), oder werden per Los zufällig zugewiesen (und
bringen dann keine Punkte). Eine zugeloste Aufgabe kann gegen Punkte
abgelehnt werden — dabei steigt ihr Wert, und sie wird erneut angeboten.

Die volle Spezifikation steht in [`CLAUDE.md`](./CLAUDE.md).

## Schnellstart (Docker, ein Kommando)

Voraussetzung: Docker und Docker Compose.

```bash
docker compose up --build -d
```

Das startet Postgres, die API (die beim Hochfahren automatisch
`prisma migrate deploy` ausführt — kein separater Migrationsschritt nötig)
und das Web-Frontend hinter nginx. Danach:

- Web: http://localhost:8080
- API: http://localhost:3000 (Health-Check: `/healthz`)

**Demo-Daten laden** (einmalig, idempotent — kann gefahrlos mehrfach laufen):

```bash
docker compose exec api npx tsx prisma/seed.ts
```

Das legt den Haushalt „Demo Family" mit vier Mitgliedern und sechs
Aufgaben an (siehe [Demo-Daten](#demo-daten) unten). Seeding läuft
bewusst *nicht* automatisch bei jedem Container-Start — das würde eine
echte Bereitstellung bei jedem Neustart stillschweigend zurücksetzen.

```bash
docker compose down          # alles stoppen
docker compose down -v       # inklusive Datenbankvolume löschen
```

## Lokale Entwicklung (ohne Docker für api/web)

Nur Postgres läuft in Docker, `api` und `web` laufen direkt mit `npm`, damit
Hot-Reload funktioniert.

```bash
npm install                  # installiert alle Workspaces
docker compose up -d db      # nur Postgres
npm run db:migrate           # Migrationen anwenden
npm run seed                 # Demo-Daten laden (idempotent)
npm run dev                  # startet api + web parallel (via `concurrently`)
```

- Web-Dev-Server: http://localhost:8080 (Vite, proxyt `/api/*` zur API)
- API: http://localhost:3000

Beide Ports, sowie `DB_PORT`, sind über Umgebungsvariablen konfigurierbar
(`API_PORT`, `WEB_PORT`, `DB_PORT` — siehe `docker-compose.yml`).

### Erforderliche Umgebungsvariablen (`.env` im Repo-Root)

| Variable | Pflicht | Default | Zweck |
|---|---|---|---|
| `DATABASE_URL` | ja | — | Postgres-Verbindung (`apps/api/src/config.ts`) |
| `SESSION_SECRET` | ja | — | Signiert Session-Cookies, mind. 8 Zeichen |
| `NODE_ENV` | nein | `development` | `development` \| `test` \| `production` |
| `PORT` / `HOST` | nein | `3000` / `0.0.0.0` | API-Listen-Adresse |
| `COOKIE_SECURE` | nein | `true` | Cookies nur über HTTPS; für lokales HTTP auf `false` setzen |
| `SESSION_TTL_HOURS` | nein | `720` (30 Tage) | Session-Gültigkeit |
| `SWEEP_INTERVAL_SECONDS` | nein | `60` | Intervall der Hintergrund-Zufallsvergabe; `0` deaktiviert den Timer (der Endpunkt `POST /api/admin/assignments/run` funktioniert trotzdem) |
| `LOG_LEVEL` | nein | `info` | pino-Log-Level |
| `CORS_ORIGINS` | nein | — | Komma-getrennte erlaubte Origins (Dev-SPA auf anderem Port) |
| `SETUP_TOKEN` | nein | — (Feature deaktiviert) | Schaltet `POST /api/register` frei — siehe [Ersteinrichtung](#ersteinrichtung-neuer-haushalt) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | nein | `haushalt` / `haushalt` / `haushaltsauktion` | nur für `docker-compose.yml`s `db`-Service |

Eine echte Bereitstellung **muss** `SESSION_SECRET` auf einen zufälligen,
geheimen Wert setzen und `COOKIE_SECURE` nicht auf `false` stellen.

## Ersteinrichtung (neuer Haushalt)

Für eine echte Bereitstellung — nicht die Demo-Daten — gibt es zwei Wege,
den allerersten Haushalt samt Admin-Konto anzulegen. Beide erzeugen
denselben Datensatz (Haushalt, Konfiguration Version 1, Admin-Nutzer,
Mitgliedschaft); der Unterschied ist nur, ob es über die App oder über ein
Terminal auf dem Server passiert.

**Weg 1 — über die App (Standardweg).** Setze `SETUP_TOKEN` auf einen
zufälligen, geheimen Wert (mind. 16 Zeichen) und starte/redeploye die API.
Danach ist `/registrieren` erreichbar (auch verlinkt von der Login-Seite):
dort trägt eine Person den Token, den Haushaltsnamen und ihre eigenen
Zugangsdaten ein und wird direkt als Admin eingeloggt. Ist `SETUP_TOKEN`
nicht gesetzt, existiert die Route serverseitig gar nicht — `POST
/api/register` antwortet mit einem echten 404, nicht mit einer sichtbaren,
aber deaktivierten Route. Der Token ist absichtlich **kein** offenes
Self-Service-Signup: er gilt nur für die Erstanlage; alle weiteren
Mitglieder fügt ein Admin danach über `/verwaltung` hinzu (§17).

**Weg 2 — CLI-Fallback** (`apps/api/prisma/create-admin.ts`, per `npm run
create-admin`). Bleibt bewusst erhalten für den Fall, dass der Setup-Token
verloren geht oder rotiert wurde, bevor überhaupt ein Haushalt existiert —
dann ist Weg 1 nicht mehr nutzbar, und ein interaktiver Terminalzugriff auf
den Server ist der einzige verbleibende Weg zurück. Fragt interaktiv nach
E-Mail, Haushaltsname und Anzeigename, erzeugt ein zufälliges Passwort und
zeigt es genau einmal an. Für den Alltagsbetrieb ist dieser Weg **nicht**
vorgesehen (CLAUDE.md §37 verlangt Betreibbarkeit ohne eigenen
Systemadministrator) — er ist ausschließlich die Notfall-Wiederherstellung.

## Demo-Daten

Haushalt „Demo Family", vier Mitglieder, sechs Aufgaben (§38). Passwort für
alle Demo-Konten: `demo1234`.

| Person | E-Mail | Rolle |
|---|---|---|
| Elke | elke@demo.local | ADMIN |
| Arthur | arthur@demo.local | MEMBER |
| Luise | luise@demo.local | MEMBER |
| Hannes | hannes@demo.local | MEMBER |

Die Login-Seite bietet im Entwicklungsmodus (`import.meta.env.DEV`) einen
Schnellanmelde-Block mit diesen vier Konten — dieser Block ist in einem
Produktions-Build (`vite build`, auch im Docker-Image) bewusst nicht
enthalten, da eine überlebende Demo-Anmeldung eine Zugangsdaten-Umgehung
wäre (siehe Entscheidungslog der Kampagne).

| Aufgabe | Basiswert |
|---|---|
| Geschirrspüler ausräumen | 2 |
| Müll hinausbringen | 2 |
| Wäsche aufhängen | 4 |
| Staubsaugen | 4 |
| Bad putzen | 6 |
| Küche gründlich reinigen | 7 |

## Konfiguration

Alle Spielregeln sind pro Haushalt konfigurierbar, versioniert und über die
Admin-Oberfläche (`/verwaltung`, nur für Mitglieder mit Rolle `ADMIN`)
änderbar — kein Redeploy nötig. Dieselbe Seite verwaltet auch die Mitglieder
(anlegen, Rolle/Aktivstatus, Teilnahmebeschränkungen: ausgeschlossene
Kategorien/Aufgaben, Abwesenheiten) und die Aufgaben selbst (Aufgaben
anlegen/bearbeiten/archivieren inkl. Wiederholungsregel und
Berechtigungen, Kategorien verwalten) — beides ruft ausschließlich bereits
bestehende, serverseitig validierte Endpunkte auf, nichts davon rechnet
etwas Verbindliches im Client. Das Konfigurationsschema lebt in
[`packages/shared/src/config/`](./packages/shared/src/config/)
(`HouseholdConfigSchema`), die Defaults in `defaults.ts` spiegeln CLAUDE.md
§39 wörtlich. Wichtigste Defaults:

| Bereich | Parameter | Default |
|---|---|---|
| Freiwillig | `rewardTiming` | `ON_COMPLETE` |
| Zuweisung | `strategy` | `WEIGHTED_FAIRNESS` |
| Zuweisung | `offerDurationMinutes` | `60` |
| Zuweisung | `preventImmediateReassignment` | `true` |
| Freikauf | `costStrategy` | `CURRENT_TASK_VALUE` |
| Freikauf | `allowNegativeBalance` | `false` |
| Wertsteigerung | `strategy` | `MULTIPLIER` × `1.5`, `CEIL`, min. `+1` |
| Erledigung | `resetStrategy` | `BASE_VALUE` |
| Punkteverfall | `enabled` | `false` |
| Fairness | `weightFloor` | `0.1` (kein Mitglied wird dauerhaft unerreichbar) |

Komplexe Formeln (z. B. eine eigene Wertsteigerungs-Formel) laufen durch
einen handgeschriebenen arithmetischen Ausdrucks-Parser
(`packages/shared/src/formula/`) — kein `eval()`, wie in CLAUDE.md §17
gefordert. Jede Änderung wird serverseitig validiert und lässt sich vor dem
Speichern über `POST /api/admin/config/preview` live vorschauen, mit
demselben Code, der auch die verbindliche Berechnung macht.

## Architektur

Kurzfassung — die vollständige Begründung steht in
[`.planning/architecture-haushaltsauktion.md`](./.planning/architecture-haushaltsauktion.md).

- **Modularer Monolith**, npm-Workspaces: `apps/api` (Fastify + Prisma),
  `apps/web` (React 19 + Vite SPA), `packages/shared` (Domänentypen,
  Konfigurationsschema, Formel-Parser — von beiden Apps importiert, nie
  dupliziert).
- **`TaskDefinition` vs. `TaskInstance`**: eine wiederkehrende Aufgabe (z. B.
  „Bad putzen — jeden Samstag") ist von ihren konkreten Vorkommen getrennt
  (z. B. „Bad putzen — 29.08.2026"), damit Historie, aktueller Wert und
  Wiederholungsregeln nicht verwechselt werden können.
- **Explizite State Machine** für `TaskInstance` (AVAILABLE → ASSIGNED →
  COMPLETED, mit CANCELLED/PAUSED/EXPIRED-Zweigen) und eine getrennte
  Zuweisungs-Unter-Maschine für Zufallszuweisung → Annahme/Freikauf.
  Illegale Übergänge sind als Matrix enumeriert und getestet.
  (`apps/api/src/domain/task/state-machine.ts`)
- **Punkte ausschließlich über ein Ledger** (`PointTransaction`): kein Code
  schreibt einen Punktestand direkt, jede Änderung ist eine Buchung mit
  altem/neuem Saldo, Typ, Initiator und Zeitstempel.
  (`apps/api/src/app/points/`, §14)
- **Nebenläufigkeit**: `READ COMMITTED` plus strikt aufsteigende
  `SELECT … FOR UPDATE`-Zeilensperren (Sweep-Advisory-Lock → TaskInstance →
  TaskAssignment → HouseholdMember), damit zwei gleichzeitige Anfragen auf
  dieselbe Aufgabe serialisieren statt zu wettrennen. Bewiesen unter echter
  erzwungener Überlappung (nicht nur `Promise.all`) in
  `apps/api/test/integration/concurrency.test.ts` — siehe die Kommentare
  dort und in `apps/api/src/app/tx.ts` für die vollständige Begründung.
- **Fairness-Auswahl**: `WEIGHTED_FAIRNESS` mit einer dokumentierten,
  reproduzierbaren (seeded RNG) Formel, die die Wahrscheinlichkeit anhand
  bisheriger Zufallslast, Freiwilligenarbeit und Aktualität anpasst, mit
  einer Gewichts-Untergrenze, damit niemand dauerhaft ausgeschlossen wird.
  Nachvollziehbar über `GET /api/assignments/:id/explanation` (§32).
- **Sicherheit**: Businesslogik ist ausschließlich serverseitig verbindlich
  — kein Preis, kein Punktestand wird je im Client berechnet. Login
  antwortet identisch (Status, Body, CPU-Zeit) bei unbekannter E-Mail und
  falschem Passwort, um kein Enumerieren von Konten zuzulassen. Rate-Limits
  auf Login (5/5 Min) und mutierenden Aktionen (30/Min pro Mitglied).

## Tests

```bash
npm test                       # Unit + Integration: shared, api, web (327 Tests)
npm run typecheck               # strikter TypeScript-Check, packages/shared + apps/api + e2e/
npm run typecheck -w apps/web   # apps/web hat ein eigenes tsconfig, läuft NICHT im obigen Kommando mit
npm run lint                    # ESLint, inkl. projektspezifischer Regel gegen falsche Lock-Reihenfolge
npm run sim -w apps/api         # §34-Simulation: 4 Mitglieder × 20 Aufgaben × 1000 Zyklen
npx playwright test             # 23 End-to-End-Specs gegen den echten Stack
```

Für `npx playwright test` muss Postgres bereits laufen
(`docker compose up -d db`); Fastify-API und Vite-Dev-Server werden von
Playwright selbst als `webServer`-Prozesse gestartet und nach dem Lauf
wieder beendet. Die Suite deckt die Kernmechanik ab, nicht nur Navigation:
freiwillige Übernahme, ein Wettlauf zweier Personen um dieselbe Aufgabe
(genau eine gewinnt), Zufallszuweisung → Freikauf → Wertsteigerung →
erneutes Angebot, und eine Admin-Konfigurationsänderung, die einen
Seiten-Reload übersteht.

Die Integrationstests unter `apps/api/test/integration/` brauchen ebenfalls
eine laufende Postgres-Instanz (`docker compose up -d db`) — sie sind Teil
von `npm test -w apps/api` und laufen automatisch mit.

## Projektstruktur

```
apps/
  api/            Fastify-Backend: Domänenkern, Persistenz, HTTP-API
    src/domain/     reine Geschäftslogik (State Machine, Fairness, Formeln) — kein Prisma, kein Fastify
    src/app/        Use-Cases: eine Transaktion pro Operation, ruft domain/ auf
    src/infra/      HTTP-Routen, Auth, Fastify-Server
    src/simulation/ §34-Simulationsmodul
    prisma/         Schema, Migrationen, Seed
    test/domain/    schnelle, reine Unit-Tests
    test/integration/  Tests gegen echte Postgres + echten Fastify-Server
  web/            React/Vite SPA
    src/pages/       eine Komponente pro Route
    src/components/  wiederverwendbare UI-Bausteine
    src/api/         Fetch-Client + React-Query-Hooks
    src/strings/     alle deutschen Texte zentral (kein Hardcoding in JSX)
packages/
  shared/         von api und web importierte Domänentypen, Konfigurationsschema, Formel-Parser
e2e/              Playwright-End-to-End-Tests gegen den vollen Stack
.planning/        Architektur-, UX- und Kampagnendokumente dieses Projekts
```

## Wichtige fachliche Invarianten

Diese Regeln gelten unabhängig von jeder Konfiguration (CLAUDE.md §44):

- Eine zufällig zugewiesene und erledigte Aufgabe erzeugt **keine** Punkte.
- Punkte für Arbeit entstehen ausschließlich durch freiwillige Übernahmen.
- Ein Freikauf kostet Punkte und erhöht den aktuellen Aufgabenwert; die
  Aufgabe wird danach erneut angeboten.
- Nach Erledigung wird der Aufgabenwert auf den Basiswert zurückgesetzt.
- Jede Punkteänderung ist über das Ledger nachvollziehbar.
