#!/bin/bash

# Deploy script for TEST environment (dev branch)
# This script automatically runs database migrations

set -e

PROJECT_DIR="/home/ec2-user/dev/hudd-dashboard"
LOG_FILE="/var/log/deployments/deploy-test-$(date +%Y%m%d-%H%M%S).log"
ENV_FILE="$PROJECT_DIR/.env.test.local"

# Ensure log directory exists
mkdir -p /var/log/deployments

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "Starting TEST deployment (dev branch)"
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
git fetch origin dev || {
    log "ERROR: Failed to fetch from origin"
    exit 1
}

# Check if there are changes to pull
REMOTE_COMMIT=$(git rev-parse origin/dev)
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
log "Pulling latest changes from dev branch..."
git pull origin dev || {
    log "ERROR: Failed to pull from dev branch"
    exit 1
}

AFTER_COMMIT=$(git rev-parse HEAD)
log "New commit: $AFTER_COMMIT"

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

# Run database migrations (AUTOMATED for test)
log "Running database migrations..."
if [ -f "$ENV_FILE" ]; then
    node --env-file="$ENV_FILE" node_modules/.bin/prisma migrate deploy || {
        log "ERROR: Database migration failed"
        exit 1
    }
else
    log "WARNING: $ENV_FILE not found, using default environment"
    npx prisma migrate deploy || {
        log "ERROR: Database migration failed"
        exit 1
    }
fi
log "Database migrations completed successfully"

# Build the application
log "Building Next.js application..."
npm run build || {
    log "ERROR: Build failed"
    exit 1
}

# Restart PM2 test instance
log "Restarting PM2 test instance..."
npm run pm2:restart:test || {
    log "WARNING: PM2 restart failed, attempting to start..."
    npm run pm2:start:test || {
        log "ERROR: Failed to start PM2 test instance"
        exit 1
    }
}

# Wait a moment for the app to start
sleep 3

# Check if the app is running
if pm2 list | grep -q "hudd-dashboard-test.*online"; then
    log "✓ TEST deployment completed successfully!"
    log "✓ Application is running on port 8766"
    log "✓ Commit: $AFTER_COMMIT"
else
    log "WARNING: Application may not be running properly"
    log "Please check: pm2 logs hudd-dashboard-test"
fi

log "========================================="
log "TEST deployment finished"
log "========================================="
