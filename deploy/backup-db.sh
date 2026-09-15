#!/usr/bin/env bash
#
# Nightly logical backup: pg_dump -> gzip -> upload to S3 (or a Lightsail
# bucket, which is S3-API-compatible). Ebene B of docs/hosting-plan.md §6 —
# independent of the Lightsail whole-instance snapshots (Ebene A).
#
# Runs on the Lightsail instance via backup-db.timer, from the same directory
# as docker-compose.yml, and reads the production .env for DB credentials.
# Requires the `aws` CLI configured with a key scoped to PutObject on
# BACKUP_S3_BUCKET only (docs/hosting-plan.md §4 — no admin key on the box).
#
# The unit runs as the deploy user, NOT as root: the instance's IAM key lives
# in that user's ~/.aws/credentials (§4), and root has no copy of it.
# .github/workflows/deploy.yml installs this file and both units on every
# deploy, so editing them here is enough — no manual step on the instance.
#
# This is exactly what .github/workflows/restore-drill.yml downloads and
# restores every week, so a broken backup here fails loudly there too.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/haushaltsauktion}"
cd "$APP_DIR"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
die() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] FEHLER: $*" >&2; exit 1; }

# Read only the three values we need, instead of `set -a; source .env`.
#
# `.env` is Compose syntax, not shell: values there are literal and unquoted,
# so a secret containing a space, `#`, `(`, `"` or a backtick is perfectly
# valid for Compose but makes `source` either mis-parse it or abort this whole
# script via `set -e`. deploy.yml writes several such secrets into that file
# verbatim (SETUP_TOKEN, VAPID_*, INTEGRATION_ENCRYPTION_KEY), which coupled
# the nightly backup to the exact byte content of tokens it never uses — and
# pulled every one of them into the environment of `pg_dump` and `aws` for no
# reason.
env_value() {
  # Last assignment wins, mirroring how Compose itself reads the file. Strips a
  # trailing CR (a file touched on Windows) and one layer of surrounding quotes
  # (`KEY="value"` is valid Compose syntax) — either would otherwise end up
  # inside the bucket name and produce a baffling S3 error.
  sed -n "s/^$1=//p" .env \
    | tail -n 1 \
    | tr -d '\r' \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-$(env_value BACKUP_S3_BUCKET)}"
POSTGRES_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
: "${POSTGRES_USER:=haushalt}"
: "${POSTGRES_DB:=haushaltsauktion}"

# Guard against an obviously empty file only. Deliberately NOT tuned to the
# expected dump size: a freshly migrated household with almost no rows is a
# legitimate state whose dump compresses very small, and a floor that fails
# THAT would block real backups. The trailer check below is what actually
# proves completeness.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-256}"

if [ -z "$BACKUP_S3_BUCKET" ]; then
  die "BACKUP_S3_BUCKET ist in $APP_DIR/.env nicht gesetzt. Der Deploy-Job schreibt den Wert aus dem GitHub-Secret BACKUP_BUCKET dorthin (.github/workflows/deploy.yml) — ein Deploy nach dem Einrichten des Secrets behebt das. Siehe docs/hosting-plan.md §6."
fi

# Preflight: without this, a missing/!wrong credentials file only surfaces at
# the upload below — after a full pg_dump has already run. GetCallerIdentity
# needs no IAM permission of its own, so it isolates "no credentials" from
# "credentials without s3:PutObject".
if ! CALLER=$(aws sts get-caller-identity --query Arn --output text 2>&1); then
  die "AWS-Zugangsdaten nicht nutzbar (aws sts get-caller-identity): ${CALLER}. Erwartet wird der IAM-Nutzer haushaltsauktion-box in ~/.aws/credentials des Deploy-Users (docs/hosting-plan.md §4). Läuft diese Unit als root, sieht sie diese Datei nicht — backup-db.service muss User= auf den Deploy-User setzen."
fi
log "AWS-Identität: ${CALLER}"

TIMESTAMP="$(date -u +%F)"
S3_URI="s3://${BACKUP_S3_BUCKET}/backups/${TIMESTAMP}.sql.gz"

# mktemp rather than a fixed name: the timer and a deploy-triggered run can
# overlap, and two runs sharing one path would corrupt each other's dump.
DUMP_FILE="$(mktemp "/tmp/haushaltsauktion-${TIMESTAMP}.XXXXXX.sql.gz")"
trap 'rm -f "$DUMP_FILE"' EXIT

log "Dumpe Datenbank ${POSTGRES_DB} als ${POSTGRES_USER}..."
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_FILE"

# Validate before upload — uploading a truncated dump is worse than not
# uploading one, because it looks like a backup until the day it is needed.
# `set -o pipefail` above only catches a non-zero exit; a connection that dies
# mid-stream can still leave a well-formed gzip holding half a dump. pg_dump
# writes its completion trailer last, so its presence is the decisive check.
gzip -t "$DUMP_FILE" || die "Dump ist kein gültiges gzip — Upload abgebrochen."

DUMP_BYTES="$(stat -c %s "$DUMP_FILE")"
if [ "$DUMP_BYTES" -lt "$MIN_DUMP_BYTES" ]; then
  die "Dump ist nur ${DUMP_BYTES} Bytes gross (Minimum ${MIN_DUMP_BYTES}) — Upload abgebrochen."
fi

# `tail -c` and not `grep -q` on the stream: grep -q exits at the first match,
# which hands gunzip a SIGPIPE, and under `set -o pipefail` that non-zero
# status would fail this check on a perfectly good dump.
DUMP_TAIL="$(gunzip -c "$DUMP_FILE" | tail -c 4096)"
if ! printf '%s' "$DUMP_TAIL" | grep -q '^-- PostgreSQL database dump complete'; then
  die "Dump enthält keinen pg_dump-Abschlussmarker, ist also unvollständig — Upload abgebrochen."
fi

log "Dump ok (${DUMP_BYTES} Bytes), lade nach ${S3_URI} hoch..."
aws s3 cp "$DUMP_FILE" "$S3_URI" --sse AES256

log "Backup hochgeladen: ${S3_URI}"
