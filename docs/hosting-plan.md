# Hosting-, Backup- und Restore-Plan (AWS)

Status: Die CI/CD-Workflows und Deploy-Skripte unten sind im Repo umgesetzt (siehe §10). Es wurde noch kein AWS-Ressourcen-Provisioning durchgeführt — die Workflows laufen erst, sobald die in §10 gelisteten AWS-Ressourcen und GitHub-Secrets angelegt sind.

## 1. Rahmenbedingungen

- Zielgruppe: eine Familie, laut Seed-Daten 4 Mitglieder (`Elke`, `Arthur`, `Luise`, `Hannes`), realistisch 1–20 Nutzer (CLAUDE.md §43).
- Last: praktisch keine gleichzeitige Nutzung, sporadische Zugriffe über den Tag verteilt. Keine Hochverfügbarkeitsanforderung.
- Kein eigener Systemadministrator in der Familie (CLAUDE.md §37) → die Lösung muss mit minimalem laufendem Betriebsaufwand auskommen.
- Stack (aus dem Repo): Fastify-API + PostgreSQL 16 (Prisma) + React/Vite-SPA hinter nginx, alle drei als Container, orchestriert über `docker-compose.yml`. `apps/api`'s Container führt beim Start automatisch `prisma migrate deploy` aus — kein manueller Migrationsschritt nötig.
- Vorgabe: AWS-Account vorhanden, soll bevorzugt genutzt werden; Kosteneffizienz hat Priorität vor Skalierbarkeit oder "Cloud-nativer" Architektur.

## 2. Empfehlung: AWS Lightsail (Single-Instance)

Für diese Größenordnung ist ein Single-Node-Setup auf **Amazon Lightsail** die beste Kosten/Aufwand-Balance — nicht ECS/Fargate + RDS + ALB, und nicht rohes EC2 mit selbst verwalteten Security Groups/EBS/Elastic-IP-Zoo.

Gründe:
- Bündelpreis (Compute + Datenvolumen + Traffic-Kontingent) statt vieler Einzelposten.
- **Eingebaute automatische Snapshots** der ganzen Instanz — das deckt die "Backup"-Anforderung auf Infrastrukturebene ab, ohne eigenes Tooling.
- Ein Snapshot lässt sich mit einem Klick/Befehl in eine **neue Instanz** verwandeln — das ist exakt die "kann ich Backups wiederherstellen"-Verifikationsumgebung aus der Aufgabenstellung, praktisch geschenkt.
- Kein IAM-Rollen-, VPC- oder Subnetz-Wissen nötig, um loszulegen; passt zu "ohne eigenen Systemadministrator betreibbar".

Architektur:

```
                    ┌─────────────────────────────┐
 Familie (Browser)  │   Lightsail-Instanz (Wien/   │
        │           │   Frankfurt: eu-central-1)   │
        │  HTTPS     │                              │
        └──────────► │  Caddy (TLS, Let's Encrypt) │
                    │        │                     │
                    │        ├─► nginx (web, :80)  │
                    │        └─► Fastify (api,:3000)│
                    │              │               │
                    │        Postgres 16 (Docker,  │
                    │        Volume auf System-SSD)│
                    └─────────────────────────────┘
                              │  nightly pg_dump
                              ▼
                    Lightsail Object Storage / S3
                    (verschlüsselt, versioniert,
                     Lifecycle → Glacier IR → Ablauf)

        Lightsail Automatic Snapshots (täglich, ganze Instanz)
                              │
                              ▼
                 (on demand) neue Instanz aus Snapshot
                 = Restore-Verifikationsumgebung
```

`docker-compose.yml` bleibt praktisch unverändert; einzige Ergänzung ist ein Reverse Proxy mit automatischem TLS (Caddy) vor `web`/`api`, statt der Ports direkt offen zu lassen.

### Instanzgröße

| Plan | RAM | vCPU | SSD | Traffic inkl. |
|---|---|---|---|---|
| $7/Monat (`micro_3_0`) | 1 GB | 2 | 40 GB | 2 TB |
| **$12/Monat (`small_3_0`, provisioniert)** | 2 GB | 2 | 60 GB | 3 TB |

Empfehlung: **`small_3_0`**. Beim tatsächlichen Provisioning (§10) stellte sich heraus, dass die günstigeren `_ipv6_`-Bundle-Varianten (die ursprünglich mit $10/Monat für dieselben Specs eingeplant waren) **IPv6-only** sind — keine öffentliche IPv4-Adresse, `attachStaticIp` schlägt dafür sogar mit `InvalidInputException` fehl. Für eine Familie, deren Heimnetz üblicherweise IPv4-basiert ist, ist das unbrauchbar. Deshalb `small_3_0` (klassisches Bundle, $12/Monat, `--ip-address-type dualstack` bei der Erstellung → IPv4 **und** IPv6).

*Preise Stand Provisioning (siehe §10) — auf der aktuellen [Lightsail-Preisseite](https://aws.amazon.com/lightsail/pricing/) im Zweifel neu verifizieren.*

## 3. Deployment-Fluss (kein Build auf der Zielinstanz)

Um mit der kleinen Instanz auszukommen und Ausfallzeiten beim Deploy zu vermeiden:

0. **Gitleaks-Secret-Scan als Pflicht-Gate vor jedem Deploy.** Der Workflow `.github/workflows/gitleaks.yml` (bereits im Repo, läuft ab sofort bei jedem Push/PR auf `main`) scannt den vollen Verlauf des Diffs mit [gitleaks](https://github.com/gitleaks/gitleaks) gegen bekannte Secret-Muster (AWS-Keys, private Keys, generische High-Entropy-Tokens usw.). Konfiguration in `.gitleaks.toml` (erweitert die Standardregeln, allowlisted nur generierte Artefakte wie `package-lock.json`-Integritätshashes und `dist/`-Ordner — keine echten Ausnahmen für Secret-Muster). Der Deploy-Workflow (Schritt 1) muss von diesem Job abhängen (`needs: gitleaks` bzw. als Required-Check im Branch-Protection-Regelwerk für `main`), damit ein Fund den Weg in Richtung Hosting-Instanz blockiert, bevor irgendein Image gebaut oder gepusht wird.
1. GitHub Actions baut bei Push auf `main` beide Images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) und pusht sie nach **Amazon ECR** (Kosten: < 1 GB Images, Free-Tier-Rahmen bzw. Cent-Beträge/Monat).
2. Ein kleines Deploy-Skript verbindet sich per SSH (oder `aws ssm` falls auf EC2 statt Lightsail migriert wird) zur Instanz und führt aus:
   ```
   docker compose pull && docker compose up -d
   ```
3. `prisma migrate deploy` läuft automatisch beim API-Container-Start (siehe Dockerfile-Kommentar) — kein separater Migrationsschritt im Deploy nötig.

Damit findet auf der Produktionsinstanz nie ein `npm ci`/`tsc`/`vite build` statt — das entschärft die RAM-Grenze zusätzlich zum Instanz-Upgrade.

## 4. Secrets

- `SESSION_SECRET`, DB-Zugangsdaten: als `.env`-Datei **nur auf der Instanz**, nicht im Image, nicht im Repo (schon jetzt via `.env`/`.env.example`-Trennung so gehandhabt).
- Für den S3/Lightsail-Bucket-Zugriff des Backup-Skripts: ein eigener IAM-Nutzer mit einer auf **einen Bucket, ein Prefix, `PutObject`/`GetObject`** beschränkten Policy — kein Admin-Key auf der Box. Lightsail-Instanzen unterstützen (anders als EC2) keine IAM-Instanzrollen; das ist der bewusste Trade-off für die einfachere Bündel-Bepreisung. Zugriffsschlüssel alle ~90 Tage rotieren (Kalendererinnerung reicht bei dieser Größenordnung).
- SSH: nur Public-Key-Auth, Zugriff nur von bekannten IPs (Lightsail-Firewall), kein Passwort-Login.

## 5. Kostenübersicht (monatlich, USD, Richtwerte)

| Posten | Kosten |
|---|---|
| Lightsail-Instanz (2 GB/2 vCPU/60 GB/3 TB, dualstack) | $12.00 |
| Lightsail Object Storage (Backups, 5 GB Small Bundle) *oder* S3 + Glacier IR | $1.00 – $1.50 |
| Route 53 Hosted Zone (falls Domain-DNS bei AWS verwaltet wird) | $0.50 |
| Domain-Registrierung (falls neu, jährlich umgelegt) | ~$1.00 |
| ECR-Image-Speicher | < $0.20 |
| Restore-Drill (siehe §7), quartalsweise 1h temporäre Instanz | < $0.10 im Schnitt |
| CloudWatch Basis-Monitoring | $0.00 (Free Tier) |
| **Summe** | **≈ $14–15 / Monat** |

Zum Vergleich, warum andere AWS-Optionen verworfen wurden:
- **ECS Fargate + RDS**: allein der Application Load Balancer kostet ~$16–18/Monat fix, dazu RDS `db.t4g.micro` (~$12–13/Monat) und Fargate-Task-Zeit — landet bei $35–45+/Monat für eine Last, die das nicht braucht.
- **Elastic Beanstalk**: intern ebenfalls EC2 + ELB, ähnliche Kostenbasis wie oben, zusätzlicher Abstraktionsaufwand ohne Nutzen bei dieser Größe.
- **EC2 statt Lightsail**: vergleichbare reine Rechenkosten, aber ohne die eingebauten Snapshot-Restore-Funktionen; man müsste AMI-Snapshots und Restore-Tooling selbst bauen. Einziger Vorteil wäre die IAM-Instanzrolle (siehe §4) — für diese Größenordnung nicht ausschlaggebend.
- **Nicht-AWS-Alternative zur Einordnung**: ein Hetzner-CX22-Server (2 vCPU/4 GB/40 GB) kostet ~€4,50/Monat und wäre günstiger als jede AWS-Compute-Option. Da ein AWS-Account aber bereits vorhanden ist und explizit als Option genannt wurde, bleibt die Empfehlung bei Lightsail — der Aufpreis (~$5–8/Monat) kauft die eingebaute Snapshot/Restore-Funktionalität und Integration in denselben Account für Rechnungsstellung/Zugriffssteuerung.

## 6. Backup-Strategie (zwei unabhängige Ebenen)

Bewusst zwei Ebenen, damit ein einzelner defekter Mechanismus nicht zum Totalverlust führt:

**Ebene A — Instanz-Snapshot (Infrastruktur-Ebene)**
- Lightsail "Automatic Snapshots" aktivieren: täglich, Aufbewahrung 7 Tage (Standardverhalten).
- Deckt die *gesamte* Instanz ab: OS, Docker-Volumes, Konfiguration, Caddy-TLS-Zertifikate.
- Nachteil: grobkörnig (ganzer Tag), keine Point-in-Time-Wiederherstellung innerhalb eines Tages.

**Ebene B — Logisches DB-Backup (Anwendungs-Ebene)**
- Implementiert in `deploy/backup-db.sh`, ausgelöst durch den systemd-Timer `deploy/backup-db.timer` (Service-Unit: `deploy/backup-db.service`). Beide Unit-Dateien werden bei der Ersteinrichtung nach `/etc/systemd/system/` auf der Instanz kopiert und mit `systemctl enable --now backup-db.timer` aktiviert (täglich 03:00 UTC).
- Das Skript liest `POSTGRES_USER`/`POSTGRES_DB`/`BACKUP_S3_BUCKET` aus der produktiven `.env`, dumpt via `docker compose exec db pg_dump`, komprimiert und lädt SSE-verschlüsselt nach `s3://$BACKUP_S3_BUCKET/backups/<datum>.sql.gz` hoch.
- S3-Lifecycle-Regel: 30 Tage Standard → danach Glacier Instant Retrieval → Löschung nach 12 Monaten (Kostenkontrolle, keine unbegrenzte Anhäufung).
- Bucket-Versionierung + Server-Side-Encryption (SSE-S3) aktivieren.
- Vorteil gegenüber Ebene A: granular (jede Nacht), portabel (lässt sich in jede Postgres-Instanz einspielen, unabhängig von Lightsail), kleine Dateigröße bei dieser Datenmenge (Ledger + wenige hundert Task-Instanzen/Jahr, siehe CLAUDE.md §43).

## 7. Restore-Verifikationsumgebung

Ein Backup, das nie wiederhergestellt wurde, ist keine Garantie. Zwei Prüfstufen, unterschiedlich häufig:

**Stufe 1 — automatisierter DB-Restore-Test (wöchentlich, praktisch kostenlos)**
- Implementiert in `.github/workflows/restore-drill.yml` (`schedule: cron` montags 04:00 UTC + `workflow_dispatch`), läuft komplett im CI-Runner, ohne neue AWS-Ressourcen:
  1. Neuesten Key unter `s3://<bucket>/backups/` per `aws s3api list-objects-v2` ermitteln und laden (per OIDC-Rolle, nur Lesezugriff auf den Backup-Bucket).
  2. Temporären `postgres:16-alpine`-Service-Container im Workflow starten, Dump einspielen (`psql -v ON_ERROR_STOP=1`).
  3. `npm run db:migrate -w apps/api` (= `prisma migrate deploy`) gegen die wiederhergestellte DB — exakt der Befehl, den der API-Container beim Produktionsstart ausführt, statt nur `migrate status`, damit der Test auch eine tatsächliche Recovery simuliert.
  4. `npm run verify-restore -w apps/api` (`apps/api/prisma/verify-restore.ts`): Kern-Tabellen (`households`, `household_members`, `task_definitions`) nicht leer; Ledger-Saldo je Mitglied aus `PointTransaction` rekonstruiert und gegen `HouseholdMember.pointsCache` verglichen (§14/§44-Invariante); Hash-Chain-lite (`previousTransactionId`) je Mitglied lückenlos; Alter der jüngsten Transaktion nur zur Information geloggt, kein harter Grenzwert.
  5. Bei Fehlschlag: Workflow schlägt fehl → GitHub-Standardbenachrichtigung per E-Mail an die Repo-Eigentümer:in (ausreichend bei dieser Nutzerzahl, kein Slack/PagerDuty nötig).
- Kosten: $0 (GitHub-Actions-Freikontingent, minimaler S3-Egress).

**Stufe 2 — vollständiger DR-Drill (quartalsweise, oder vor größeren Änderungen)**
- Aus dem jüngsten Lightsail-Snapshot eine **neue, temporäre Instanz** erzeugen (`aws lightsail create-instances-from-snapshot` oder Konsole).
- Instanz hochfahren, `docker compose ps` prüfen, `/healthz`-Endpunkt der API abrufen, Login mit einem Testnutzer, Dashboard lädt Daten.
- Stichprobe: Datenstand der wiederhergestellten Instanz mit dem Snapshot-Zeitpunkt abgleichen (kein Datenverlust seit Snapshot außer erwarteter Lücke).
- Temporäre Instanz danach löschen.
- Kosten: Lightsail rechnet stundengenau bis zum Monatsdeckel ab; ein 30–60-minütiger Test kostet Bruchteile eines Cents.
- Dieser Test verifiziert etwas, das Stufe 1 nicht kann: dass die *ganze Instanz* (nicht nur die DB) aus einem Snapshot lauffähig wiederhergestellt werden kann.

## 8. Monitoring & Alerting (minimal, passend zur Zielgruppe)

- CloudWatch-Basismetriken der Instanz (CPU, Netzwerk, Status-Check) — im Free Tier enthalten, Alarm bei Status-Check-Fehler → E-Mail via SNS.
- Externer Uptime-Check (z. B. UptimeRobot Free-Plan) auf `/healthz` — unabhängig davon, ob AWS selbst ein Problem meldet.
- API-Logs (`pino`) bleiben vorerst lokal auf der Instanz (`docker logs`); bei Bedarf später CloudWatch Logs Agent ergänzen — für diese Nutzerzahl nicht Tag-1-kritisch.

## 9. Erstes Setup — Reihenfolge (Runbook-Skizze)

1. Lightsail-Instanz erstellen (Ubuntu-Blueprint, $10-Plan, `eu-central-1`), statische IP zuweisen.
2. Docker + Docker-Compose-Plugin installieren, Repo (bzw. nur `docker-compose.yml` + gebaute Images) auf die Instanz bringen.
3. Domain per A-Record auf die statische IP zeigen lassen; Caddy vor `web`/`api` für automatisches Let's-Encrypt-TLS konfigurieren.
4. `.env` mit produktivem `SESSION_SECRET` und DB-Zugangsdaten anlegen (nicht das Dev-Default aus `docker-compose.yml` übernehmen).
5. `docker compose up -d`, `prisma migrate deploy` läuft automatisch mit hoch.
6. Admin-Account anlegen (`npm run create-admin` gegen die Produktions-DB, einmalig).
7. Lightsail Automatic Snapshots aktivieren.
8. S3-/Lightsail-Bucket + IAM-Nutzer für Backups anlegen; `deploy/backup-db.sh` + `deploy/backup-db.service` + `deploy/backup-db.timer` auf die Instanz kopieren, `chmod +x deploy/backup-db.sh`, `systemctl enable --now backup-db.timer`, ersten Lauf manuell verifizieren (`systemctl start backup-db.service`, dann `journalctl -u backup-db.service`).
9. Die bereits im Repo vorhandenen GitHub-Actions-Workflows aktivieren, indem die in §10 gelisteten Secrets/Variablen im Repo hinterlegt werden: `.github/workflows/deploy.yml` (Test → Build+Push nach ECR → Deploy) und `.github/workflows/restore-drill.yml` (wöchentlicher Restore-Test). Den bereits vorhandenen `gitleaks`-Workflow als Required-Status-Check in den Branch-Protection-Regeln für `main` eintragen, damit `deploy.yml` bei einem Secret-Fund gar nicht erst startet.
10. Einen manuellen Stufe-2-DR-Drill (§7) durchführen, bevor die Familie produktiv auf das System verlassen soll.

## 10. Implementierte CI/CD-Artefakte

Im Repo bereits vorhanden (Code, kein Provisioning):

| Datei | Zweck |
|---|---|
| `.github/workflows/gitleaks.yml` + `.gitleaks.toml` | Secret-Scan, Pflicht-Gate vor Build/Deploy (§3 Schritt 0) |
| `.github/workflows/deploy.yml` | Test (`typecheck`/`lint`/`test` inkl. Integrationstests gegen Postgres-Service-Container) → Build+Push beider Images nach ECR (OIDC) → SSH-Deploy auf die Instanz |
| `.github/workflows/restore-drill.yml` | Wöchentlicher automatisierter Restore-Test (§7 Stufe 1) |
| `apps/api/prisma/verify-restore.ts` (`npm run verify-restore -w apps/api`) | Sanity-Checks nach einem Restore: Kern-Tabellen, Ledger-Konsistenz, Hash-Chain |
| `deploy/backup-db.sh`, `deploy/backup-db.service`, `deploy/backup-db.timer` | Nächtliches `pg_dump` → S3 auf der Instanz (§6 Ebene B) |

**AWS-Ressourcen (Account `637423428697`, Region `eu-central-1`) — provisioniert:**

| Ressource | Wert |
|---|---|
| OIDC-Provider | `token.actions.githubusercontent.com` |
| ECR-Repository | `haushaltsauktion-api` |
| ECR-Repository | `haushaltsauktion-web` |
| S3-Backup-Bucket | `haushaltsauktion-backups-637423428697` (versioniert, SSE-AES256, Public Access Block, Lifecycle 30 Tage → Glacier IR → Ablauf nach 365 Tagen) |
| IAM-Rolle | `gha-haushaltsauktion-deploy` — Trust nur für `repo:brandstaetter/haushaltsauktion:ref:refs/heads/main`; Rechte beschränkt auf ECR-Push in die beiden Repositories oben |
| IAM-Rolle | `gha-haushaltsauktion-backup-read` — gleiche Trust-Einschränkung; Rechte beschränkt auf `GetObject`/`ListBucket` unter `backups/*` im Bucket oben |
| Lightsail-Instanz | `haushaltsauktion`, `eu-central-1a`, Ubuntu 24.04 LTS, Bundle `small_3_0` (dualstack) |
| Statische IP | `haushaltsauktion-ip` → `35.158.29.79` (IPv4), zusätzlich eine automatisch zugewiesene IPv6-Adresse |
| Lightsail-Key-Pair | `haushaltsauktion-deploy` (ed25519, ausschließlich für den CI-Deploy — kein persönlicher SSH-Key wiederverwendet) |
| Firewall (Instance Public Ports) | TCP 22, 80, 443 offen (0.0.0.0/0 und ::/0) |
| Automatic Snapshots Add-on | aktiviert, täglich 03:00 UTC |

Auf der Instanz per Bootstrap (`curl get.docker.com`, offizieller AWS-CLI-v2-Installer) bereits eingerichtet: Docker Engine + Compose-Plugin, AWS CLI v2, Verzeichnis `/opt/haushaltsauktion` (Eigentümer `ubuntu`). Das Ubuntu-24.04-Image liefert kein apt-Paket `awscli` mehr — deshalb der offizielle Installer statt `apt-get install awscli`.

**GitHub Secrets (Repo `brandstaetter/haushaltsauktion`) — gesetzt:**
`AWS_CI_DEPLOY_ROLE_ARN`, `AWS_BACKUP_READ_ROLE_ARN`, `BACKUP_BUCKET`, `DEPLOY_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`.

**Branch-Protection** auf `main`: `scan` (der Gitleaks-Job) ist als Required Status Check eingetragen (siehe §3/§9). Das erforderte, das Repository auf public zu stellen — GitHubs Free-Plan unterstützt Branch Protection auf private Repos für persönliche Accounts nicht.

**Noch offen** (bewusst nicht Teil dieses Provisioning-Schritts, da domainabhängig):
- Docker-Compose-Stack + Caddy-Reverse-Proxy + produktive `.env` sind noch nicht auf der Instanz deployt — `deploy.yml`s SSH-Schritt findet aktuell noch kein `docker-compose.yml` unter `/opt/haushaltsauktion`.
- Domain/DNS-A-Record auf `35.158.29.79`, TLS-Konfiguration.
- `deploy/backup-db.sh`/`.timer`/`.service` sind noch nicht auf die Instanz kopiert — dafür fehlt die produktive `.env` mit `BACKUP_S3_BUCKET`, die erst mit dem App-Deploy entsteht. Bis dahin läuft `restore-drill.yml` absichtlich fehlschlagend ("kein Backup gefunden").
- Optional: Environment `production` mit Required Reviewers versehen, damit ein Deploy manuell bestätigt werden muss, bevor `deploy.yml`'s letzter Job läuft.

## 11. Offene Entscheidungen für den Nutzer

- Domain: vorhandene Domain wiederverwenden oder neu registrieren?
- Region: `eu-central-1` (Frankfurt) empfohlen für niedrige Latenz in Europa und DSGVO-Datenresidenz — bitte bestätigen, falls Familie außerhalb Europas sitzt.
- Backup-Ziel: einfacher Lightsail-Bucket (weniger Konfiguration, geringfügig teurer) vs. rohes S3 + Glacier-Lifecycle (günstiger auf Dauer, etwas mehr IAM-Konfiguration) — beide oben mit eingepreist, Entscheidung ändert die Gesamtkosten nur um ~$0.50/Monat.
