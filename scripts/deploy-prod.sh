#!/bin/bash

# Deploy script for PRODUCTION environment (main branch)
# This script DOES NOT run migrations automatically - run migrate-prod.sh manually

set -e

PROJECT_DIR="/home/ec2-user/dev/hudd-dashboard"
LOG_FILE="/var/log/deployments/deploy-prod-$(date +%Y%m%d-%H%M%S).log"

# Ensure log directory exists
mkdir -p /var/log/deployments

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "Starting PRODUCTION deployment (main branch)"
log "========================================="

cd "$PROJECT_DIR" || {
    log "ERROR: Failed to change to project directory"
    exit 1
}

# Store current commit for comparison
BEFORE_COMMIT=$(git rev-parse HEAD)
log "Current commit: $BEFORE_COMMIT"

# Fetch latest changes
log "Fetching latest changes from origin..."
git fetch origin main || {
    log "ERROR: Failed to fetch from origin"
    exit 1
}

# Check if there are changes to pull
REMOTE_COMMIT=$(git rev-parse origin/main)
log "Remote commit: $REMOTE_COMMIT"

# Commenting out early exit to force rebuild even when developing on this server
# if [ "$BEFORE_COMMIT" = "$REMOTE_COMMIT" ]; then
#     log "No new changes to deploy"
#     exit 0
# fi

if [ "$BEFORE_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "Local and remote are in sync (developing on this server)"
    log "Continuing with rebuild anyway..."
fi

# Pull latest changes
log "Pulling latest changes from main branch..."
git pull origin main || {
    log "ERROR: Failed to pull from main branch"
    exit 1
}

AFTER_COMMIT=$(git rev-parse HEAD)
log "New commit: $AFTER_COMMIT"

# Check for pending migrations
log "Checking for pending migrations..."
MIGRATION_STATUS=$(npx prisma migrate status 2>&1 || echo "")
if echo "$MIGRATION_STATUS" | grep -q "pending migration"; then
    log "⚠️  WARNING: Pending database migrations detected!"
    log "⚠️  You must run migrations manually:"
    log "⚠️  ssh to server and run: npm run migrate:prod"
    log ""
fi

# Install dependencies
log "Installing/updating dependencies..."
npm install --production=false || {
    log "ERROR: npm install failed"
    exit 1
}

# Run Prisma generate
log "Generating Prisma client..."
npx prisma generate || {
    log "ERROR: Prisma generate failed"
    exit 1
}

# Build the application
log "Building Next.js application..."
npm run build || {
    log "ERROR: Build failed"
    exit 1
}

# Restart PM2 production instance
log "Restarting PM2 production instance..."
npm run pm2:restart || {
    log "WARNING: PM2 restart failed, attempting to start..."
    npm run pm2:start || {
        log "ERROR: Failed to start PM2 production instance"
        exit 1
    }
}

# Wait a moment for the app to start
sleep 3

# Check if the app is running
if pm2 list | grep -q "hudd-dashboard.*online"; then
    log "✓ PRODUCTION deployment completed successfully!"
    log "✓ Application is running on port 8765"
    log "✓ Commit: $AFTER_COMMIT"
    
    if echo "$MIGRATION_STATUS" | grep -q "pending migration"; then
        log ""
        log "⚠️  REMINDER: Run migrations manually!"
        log "⚠️  Command: npm run migrate:prod"
    fi
else
    log "WARNING: Application may not be running properly"
    log "Please check: pm2 logs hudd-dashboard"
fi

log "========================================="
log "PRODUCTION deployment finished"
log "========================================="
