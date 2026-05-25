#!/bin/bash

# Manual production database migration script
# This script includes safety checks and creates a backup before migrating

set -e

PROJECT_DIR="/home/ec2-user/dev/hudd-dashboard"
LOG_FILE="/var/log/deployments/migrate-prod-$(date +%Y%m%d-%H%M%S).log"
BACKUP_DIR="/home/ec2-user/db-backups"
ENV_FILE="$PROJECT_DIR/.env.prod.local"

# Ensure directories exist
mkdir -p /var/log/deployments
mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "PRODUCTION DATABASE MIGRATION"
log "========================================="

cd "$PROJECT_DIR" || {
    log "ERROR: Failed to change to project directory"
    exit 1
}

# Check migration status
log "Checking migration status..."
MIGRATION_STATUS=$(npx prisma migrate status 2>&1 || echo "")
echo "$MIGRATION_STATUS"

if ! echo "$MIGRATION_STATUS" | grep -q "pending migration"; then
    log "✓ No pending migrations. Database is up to date."
    exit 0
fi

log ""
log "⚠️  WARNING: About to run database migrations on PRODUCTION!"
log ""

# Extract database connection info
if [ -f "$ENV_FILE" ]; then
    DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
else
    DB_URL=$(grep "^DATABASE_URL=" "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

# Extract database name from URL
DB_NAME=$(echo "$DB_URL" | sed -n 's|.*://[^/]*/\([^?]*\).*|\1|p')
log "Database: $DB_NAME"
log ""

# Show pending migrations
log "Pending migrations:"
echo "$MIGRATION_STATUS" | grep -A 50 "pending migration"
log ""

# Confirmation prompt
read -p "Do you want to proceed with the migration? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    log "Migration cancelled by user"
    exit 0
fi

# Create database backup
log "Creating database backup..."
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql"

if [ -f "$ENV_FILE" ]; then
    # Extract connection details
    DB_HOST=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:[^@]*@\([^:]*\):.*|\1|p')
    DB_PORT=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:[^@]*@[^:]*:\([0-9]*\)/.*|\1|p')
    DB_USER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
    DB_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
    
    PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE" || {
        log "ERROR: Failed to create database backup"
        log "Aborting migration for safety"
        exit 1
    }
else
    log "WARNING: Could not create automatic backup (env file not found)"
    read -p "Continue without backup? (yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        log "Migration cancelled - no backup created"
        exit 0
    fi
fi

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "✓ Backup created: $BACKUP_FILE (${BACKUP_SIZE})"
fi

log ""
log "Running migrations..."

# Run migrations
if [ -f "$ENV_FILE" ]; then
    node --env-file="$ENV_FILE" node_modules/.bin/prisma migrate deploy || {
        log "ERROR: Migration failed!"
        log "Database backup is available at: $BACKUP_FILE"
        log "To restore: pg_restore -d $DB_NAME $BACKUP_FILE"
        exit 1
    }
else
    npx prisma migrate deploy || {
        log "ERROR: Migration failed!"
        if [ -f "$BACKUP_FILE" ]; then
            log "Database backup is available at: $BACKUP_FILE"
            log "To restore: pg_restore -d $DB_NAME $BACKUP_FILE"
        fi
        exit 1
    }
fi

log ""
log "✓ Migration completed successfully!"
log "✓ Backup available at: $BACKUP_FILE"
log ""
log "Verifying migration status..."
npx prisma migrate status

log "========================================="
log "PRODUCTION MIGRATION COMPLETE"
log "========================================="
