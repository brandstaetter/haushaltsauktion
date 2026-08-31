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
| $5/Monat | 1 GB | 2 | 40 GB | 2 TB |
| **$10/Monat (empfohlen)** | 2 GB | 2 | 60 GB | 3 TB |

Empfehlung: **$10-Tier**. Der $5-Tier reicht für den laufenden Betrieb (3 schlanke Container), wird aber knapp, sobald Images direkt auf der Instanz gebaut werden (Node/TSC-Build braucht während `npm ci`/`vite build` deutlich mehr als 1 GB RSS). Deshalb Punkt 3.

*Preise Stand Trainingsdaten — vor dem eigentlichen Provisioning auf der aktuellen [Lightsail-Preisseite](https://aws.amazon.com/lightsail/pricing/) verifizieren.*

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
| Lightsail-Instanz (2 GB/2 vCPU/60 GB/3 TB) | $10.00 |
| Lightsail Object Storage (Backups, 5 GB Small Bundle) *oder* S3 + Glacier IR | $1.00 – $1.50 |
| Route 53 Hosted Zone (falls Domain-DNS bei AWS verwaltet wird) | $0.50 |
| Domain-Registrierung (falls neu, jährlich umgelegt) | ~$1.00 |
| ECR-Image-Speicher | < $0.20 |
| Restore-Drill (siehe §7), quartalsweise 1h temporäre Instanz | < $0.10 im Schnitt |
| CloudWatch Basis-Monitoring | $0.00 (Free Tier) |
| **Summe** | **≈ $12–13 / Monat** |

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

**Damit die Workflows tatsächlich laufen, müssen noch angelegt werden** (reine AWS-/GitHub-Konfiguration, kein Code):

*In AWS:*
- Ein ECR-Repository `haushaltsauktion-api` und eines `haushaltsauktion-web` (Region `eu-central-1`).
- Eine OIDC-Identitätsanbieter-Registrierung für `token.actions.githubusercontent.com`, falls im Account noch nicht vorhanden.
- Eine IAM-Rolle für `deploy.yml` (Trust Policy auf dieses Repo/Branch beschränkt) mit Rechten für `ecr:GetAuthorizationToken` + Push auf die beiden Repositories.
- Eine zweite, nur lesende IAM-Rolle für `restore-drill.yml` mit `s3:ListBucket`/`s3:GetObject` beschränkt auf den Backup-Bucket/-Prefix.
- Der S3- bzw. Lightsail-Bucket für Backups selbst (§6), plus der separate IAM-Nutzer mit `PutObject`-Zugriff für `deploy/backup-db.sh` auf der Instanz.

*In GitHub (Repo-Settings → Secrets and variables → Actions):*
- `AWS_CI_DEPLOY_ROLE_ARN` — Rolle für Build+Push (`deploy.yml`).
- `AWS_BACKUP_READ_ROLE_ARN` — Rolle für den Restore-Test (`restore-drill.yml`).
- `BACKUP_BUCKET` — Name des Backup-Buckets (von beiden Workflows referenziert, aktuell nur in `restore-drill.yml` verdrahtet).
- `DEPLOY_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY` — Zugangsdaten für den SSH-Deploy-Schritt (privater Schlüssel, dessen öffentliches Gegenstück in `~/.ssh/authorized_keys` auf der Instanz liegt).
- Branch-Protection-Regel für `main`: `gitleaks` als Required Status Check eintragen (§3/§9).
- Optional: Environment `production` mit Required Reviewers versehen, damit ein Deploy manuell bestätigt werden muss, bevor `deploy.yml`'s letzter Job läuft.

## 11. Offene Entscheidungen für den Nutzer

- Domain: vorhandene Domain wiederverwenden oder neu registrieren?
- Region: `eu-central-1` (Frankfurt) empfohlen für niedrige Latenz in Europa und DSGVO-Datenresidenz — bitte bestätigen, falls Familie außerhalb Europas sitzt.
- Backup-Ziel: einfacher Lightsail-Bucket (weniger Konfiguration, geringfügig teurer) vs. rohes S3 + Glacier-Lifecycle (günstiger auf Dauer, etwas mehr IAM-Konfiguration) — beide oben mit eingepreist, Entscheidung ändert die Gesamtkosten nur um ~$0.50/Monat.
