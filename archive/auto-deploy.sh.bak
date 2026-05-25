#!/bin/bash

# Auto-pull, build, and deploy script
PROJECT_DIR="/home/ec2-user/dev/hudd-dashboard"
LOG_FILE="/tmp/auto-deploy.log"
cd "$PROJECT_DIR" || exit 1

{
    echo "[$(date)] Starting auto-deploy check..."
    
    # Fetch latest changes
    git fetch origin master 2>&1
    
    # Check if there are new commits to pull
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/master)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "[$(date)] ✓ New changes detected, pulling from master..."
        git pull origin master 2>&1
        
        echo "[$(date)] ✓ Installing dependencies..."
        npm install 2>&1
        
        echo "[$(date)] ✓ Building application..."
        npm run build 2>&1
        
        echo "[$(date)] ✓ Stopping old application..."
        pkill -f "PORT=8765 npm start" 2>/dev/null || true
        sleep 2
        
        echo "[$(date)] ✓ Starting application on port 8765..."
        nohup sh -c 'PORT=8765 npm start' > /tmp/app.log 2>&1 &
        APP_PID=$!
        sleep 2
        
        if ps -p $APP_PID > /dev/null; then
            echo "[$(date)] ✓ Application started successfully (PID: $APP_PID)"
        else
            echo "[$(date)] ✗ Failed to start application"
        fi
    else
        echo "[$(date)] - No new changes on master"
    fi
    
} >> "$LOG_FILE" 2>&1
