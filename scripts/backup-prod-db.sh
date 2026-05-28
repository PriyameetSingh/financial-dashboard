#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="/home/ec2-user/dev/hudd-dashboard"
BACKUP_DIR="/home/ec2-user/db-backups"
LOG_DIR="/var/log/deployments"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/backup-prod-db-${TIMESTAMP}.log"

mkdir -p "${BACKUP_DIR}"
mkdir -p "${LOG_DIR}"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

load_env() {
  local env_file="$1"
  if [ -f "${env_file}" ]; then
    # shellcheck source=/dev/null
    set -a && source "${env_file}" && set +a
    return 0
  fi
  return 1
}

log "========================================="
log "Starting production database backup"
log "========================================="

cd "${PROJECT_DIR}"

if load_env "${PROJECT_DIR}/.env.prod.local"; then
  log "Loaded environment from .env.prod.local"
elif load_env "${PROJECT_DIR}/.env"; then
  log "Loaded environment from .env"
else
  log "ERROR: Could not find .env.prod.local or .env"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is missing"
  exit 1
fi

DB_NAME="$(echo "${DATABASE_URL}" | sed -n 's|.*://[^/]*/\([^?]*\).*|\1|p')"
if [ -z "${DB_NAME}" ]; then
  DB_NAME="prod"
fi

BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERROR: pg_dump not found. Please install PostgreSQL client tools."
  exit 1
fi

log "Creating backup (custom pg_dump format)..."
if ! pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"; then
  log "Host pg_dump failed, retrying with postgres:16 docker image..."
  rm -f "${BACKUP_FILE}"
  docker run --rm \
    --network host \
    -e DATABASE_URL="${DATABASE_URL}" \
    -v "${BACKUP_DIR}:${BACKUP_DIR}" \
    postgres:16 \
    sh -c "pg_dump \"${DATABASE_URL}\" --format=custom --no-owner --no-privileges --file=\"${BACKUP_FILE}\""
fi

BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"
log "To restore: pg_restore --clean --if-exists --dbname=<target_db> ${BACKUP_FILE}"
log "========================================="
log "Backup completed"
log "========================================="
