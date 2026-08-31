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
# This is exactly what .github/workflows/restore-drill.yml downloads and
# restores every week, so a broken backup here fails loudly there too.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/haushaltsauktion}"
cd "$APP_DIR"

# shellcheck disable=SC1091
set -a
source .env
set +a

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET muss in .env gesetzt sein}"
: "${POSTGRES_USER:=haushalt}"
: "${POSTGRES_DB:=haushaltsauktion}"

TIMESTAMP="$(date -u +%F)"
DUMP_FILE="/tmp/haushaltsauktion-${TIMESTAMP}.sql.gz"
trap 'rm -f "$DUMP_FILE"' EXIT

docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DUMP_FILE"

aws s3 cp "$DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/backups/${TIMESTAMP}.sql.gz" --sse AES256

echo "Backup hochgeladen: s3://${BACKUP_S3_BUCKET}/backups/${TIMESTAMP}.sql.gz"
