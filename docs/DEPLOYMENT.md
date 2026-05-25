# Deployment Guide

## Overview

This project uses a webhook-based CI/CD pipeline with separate development (test) and production environments. All deployments are automated via GitHub webhooks, eliminating the need for manual SSH access for routine deployments.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│                                                              │
│  ┌──────────────┐    ┌──────────┐    ┌──────────────┐     │
│  │   Feature    │───>│   dev    │───>│     main     │     │
│  │   Branches   │    │ (test)   │    │  (production)│     │
│  └──────────────┘    └──────────┘    └──────────────┘     │
│                            │                  │             │
└────────────────────────────┼──────────────────┼─────────────┘
                             │                  │
                        Push Event         Push Event
                             │                  │
                             v                  v
                      ┌──────────────────────────────┐
                      │    Webhook Server (Port 9000) │
                      └──────────────────────────────┘
                             │                  │
                             v                  v
                    ┌────────────────┐  ┌──────────────┐
                    │ Test Env       │  │ Prod Env     │
                    │ Port 8766      │  │ Port 8765    │
                    │ + Auto Migrate │  │ Manual Migrate│
                    └────────────────┘  └──────────────┘
```

## Environments

### Development (Test) Environment
- **Branch:** `dev`
- **Port:** 8766
- **Database:** `hudd_test`
- **PM2 Process:** `hudd-dashboard-test`
- **Migrations:** Automatic
- **Purpose:** Integration testing and validation before production

### Production Environment
- **Branch:** `main`
- **Port:** 8765
- **Database:** `hudd_nexus` (or `hudd`)
- **PM2 Process:** `hudd-dashboard`
- **Migrations:** Manual (requires approval)
- **Purpose:** Live production application

## Branching Strategy (Git Flow)

### Branches

- **main** - Production branch (stable releases only)
- **dev** - Development/test branch (integration and testing)
- **feature/*** - Feature branches (created from `dev`)

### Workflow

```
1. Create feature branch from dev
   └─> Work on feature
       └─> Push to feature branch
           └─> Create PR to dev
               └─> Merge to dev → AUTO-DEPLOYS to test
                   └─> Test on test environment
                       └─> Create PR from dev to main
                           └─> Merge to main → AUTO-DEPLOYS to prod
```

## Development Workflow

### 1. Starting a New Feature

```bash
# Ensure dev is up to date
git checkout dev
git pull origin dev

# Create feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ... edit files ...

# Commit changes
git add .
git commit -m "Add: description of your feature"

# Push feature branch
git push origin feature/your-feature-name
```

### 2. Creating a Pull Request

1. Go to GitHub repository
2. Create Pull Request from `feature/your-feature-name` to `dev`
3. Add description and request review
4. Wait for approval
5. Merge the PR

**Result:** Automatic deployment to test environment (port 8766)

### 3. Testing on Test Environment

After merge to `dev`:
- Wait 1-2 minutes for deployment to complete
- Check deployment logs: `ssh user@server "npm run webhook:logs"`
- Access test environment: `http://your-server:8766`
- Verify your changes work correctly
- Test with test database data

### 4. Promoting to Production

Once tested and verified on dev:

```bash
# Create PR from dev to main on GitHub
# OR do it locally:

git checkout main
git pull origin main
git merge dev
git push origin main
```

**Result:** Automatic deployment to production (port 8765)

**Important:** Database migrations do NOT run automatically on production!

### 5. Running Production Migrations

If your changes include database migrations:

```bash
# SSH to server
ssh user@your-server

# Navigate to project
cd /home/ec2-user/dev/hudd-dashboard

# Run migration script (includes backup and safety checks)
npm run migrate:prod
```

The script will:
1. Show pending migrations
2. Ask for confirmation
3. Create database backup
4. Run migrations
5. Verify success

## Database Migrations

### Creating Migrations

Always create migrations on the `dev` branch:

```bash
# On dev branch
git checkout dev

# Create migration
npx prisma migrate dev --name describe_your_changes

# This creates a new migration file in prisma/migrations/
# Commit the migration files
git add prisma/migrations/
git commit -m "Migration: describe your changes"
git push origin dev
```

### Migration Workflow

**Test Environment (Automatic):**
1. Push migration to `dev` branch
2. Webhook triggers deployment
3. Migrations run automatically
4. Test the migration on test database
5. Verify data integrity

**Production (Manual with Safety):**
1. Merge `dev` to `main`
2. Webhook triggers deployment (build only)
3. SSH to server
4. Run `npm run migrate:prod`
5. Review changes and confirm
6. Automatic backup created
7. Migration executes
8. Verify success

### Migration Best Practices

- Always test migrations on test environment first
- Review migration SQL before running on production
- Have a rollback plan
- Communicate with team before production migrations
- Run during low-traffic periods if possible
- Monitor application after migration

## Monitoring and Logs

### Webhook Logs

```bash
# View real-time webhook logs
npm run webhook:logs

# Or directly
pm2 logs webhook-server

# Or view log files
tail -f /var/log/deployments/webhook-*.log
```

### Deployment Logs

```bash
# Test deployment logs
tail -f /var/log/deployments/deploy-test-*.log

# Production deployment logs
tail -f /var/log/deployments/deploy-prod-*.log

# Migration logs
tail -f /var/log/deployments/migrate-prod-*.log
```

### Application Logs

```bash
# Production app logs
pm2 logs hudd-dashboard

# Test app logs
pm2 logs hudd-dashboard-test

# All PM2 processes
pm2 logs
```

### PM2 Status

```bash
# Check all processes
pm2 list

# Detailed status
pm2 status

# Process information
pm2 info hudd-dashboard
```

## Rollback Procedures

### Rollback Application Code

If a deployment causes issues:

```bash
# SSH to server
ssh user@your-server
cd /home/ec2-user/dev/hudd-dashboard

# Find the previous good commit
git log --oneline -10

# Rollback to previous commit
git reset --hard <commit-hash>

# Rebuild and restart
npm install
npm run build
npm run pm2:restart  # or npm run pm2:restart:test
```

### Rollback Database Migration

If a migration causes issues:

```bash
# Restore from automatic backup
cd /home/ec2-user/db-backups
ls -lht  # Find the backup file

# Restore (replace DB_NAME and BACKUP_FILE)
pg_restore -d hudd_nexus <backup-file-name>.sql

# Or restore specific backup
PGPASSWORD="password" pg_restore -h localhost -U hudd_user -d hudd_nexus /path/to/backup.sql
```

### Emergency Rollback

For critical issues:

```bash
# Stop affected application
pm2 stop hudd-dashboard  # or hudd-dashboard-test

# Rollback code
git reset --hard <last-good-commit>
npm install
npm run build

# Restore database from backup if needed
# (see above)

# Restart application
pm2 start hudd-dashboard

# Monitor logs
pm2 logs hudd-dashboard
```

## Common Tasks

### Restarting Applications

```bash
# Restart production
npm run pm2:restart

# Restart test
npm run pm2:restart:test

# Restart webhook server
npm run webhook:restart

# Restart all
pm2 restart all
```

### Manual Deployment

If needed, you can trigger deployments manually:

```bash
# Deploy test environment
npm run deploy:test

# Deploy production
npm run deploy:prod
```

### Viewing Environment Variables

```bash
# Production environment
cat .env
cat .env.prod.local

# Test environment
cat .env.test.local
```

### Checking Migration Status

```bash
# Production
npx prisma migrate status

# Test
node --env-file=.env.test.local node_modules/.bin/prisma migrate status
```

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm install <package>@latest

# Commit and push
git add package.json package-lock.json
git commit -m "Update: package-name to version x.y.z"
git push origin dev
```

## Troubleshooting

### Webhook Not Triggering

**Symptoms:** Push to GitHub but no deployment

**Checks:**
1. Is webhook server running? `pm2 list | grep webhook`
2. Check GitHub webhook deliveries (Settings > Webhooks)
3. Check webhook logs: `npm run webhook:logs`
4. Is port 9000 accessible? `curl http://localhost:9000/webhook`

**Fixes:**
```bash
# Restart webhook server
npm run webhook:restart

# Check environment variable
echo $WEBHOOK_SECRET

# Verify webhook configured in GitHub with correct secret
```

### Deployment Fails

**Symptoms:** Webhook triggers but deployment fails

**Checks:**
1. Check deployment logs in `/var/log/deployments/`
2. Check git authentication: `git pull origin dev`
3. Check disk space: `df -h`
4. Check memory: `free -h`

**Fixes:**
```bash
# Common issues
npm install  # Dependency issues
npm run build  # Build issues
pm2 restart hudd-dashboard  # Process issues

# Check specific error in logs
tail -50 /var/log/deployments/deploy-*.log
```

### Build Errors

**Symptoms:** Build fails during deployment

**Checks:**
1. Check build logs
2. Lint errors: `npm run lint`
3. TypeScript errors: `npx tsc --noEmit`

**Fixes:**
```bash
# Fix locally first
npm run build  # Test build locally
git add .
git commit -m "Fix: build errors"
git push origin dev
```

### Migration Errors

**Symptoms:** Migration fails on test or production

**Checks:**
1. Check migration file syntax
2. Check database connectivity
3. Check migration status: `npx prisma migrate status`
4. Review migration SQL

**Fixes:**
```bash
# Resolve migration issues
npx prisma migrate resolve --applied <migration-name>  # Mark as applied
npx prisma migrate resolve --rolled-back <migration-name>  # Mark as rolled back

# Or restore from backup and recreate migration
```

### Application Not Starting

**Symptoms:** PM2 shows "stopped" or "error" status

**Checks:**
1. `pm2 logs <app-name>` for errors
2. Check port availability: `lsof -i :8765` or `lsof -i :8766`
3. Check environment variables loaded correctly

**Fixes:**
```bash
# Kill process on port if stuck
lsof -ti:8765 | xargs kill -9

# Delete PM2 process and restart
pm2 delete hudd-dashboard
npm run pm2:start

# Check logs for specific error
pm2 logs hudd-dashboard --lines 100
```

## Security Best Practices

1. **Webhook Secret:** Keep `WEBHOOK_SECRET` confidential, rotate periodically
2. **Environment Files:** Never commit `.env`, `.env.prod.local`, `.env.test.local`
3. **Database Backups:** Store backups securely, test restore procedures
4. **Access Control:** Limit SSH access, use SSH keys not passwords
5. **Monitoring:** Set up alerts for failed deployments
6. **Logs:** Regularly review logs for suspicious activity
7. **Dependencies:** Keep dependencies updated, run security audits: `npm audit`

## Maintenance

### Regular Tasks

- **Daily:** Review deployment logs
- **Weekly:** Check disk space, review error logs
- **Monthly:** Update dependencies, rotate secrets, test backups
- **Quarterly:** Review and optimize deployment process

### Backup Strategy

- **Automatic:** Database backups before each production migration
- **Location:** `/home/ec2-user/db-backups/`
- **Retention:** Keep last 30 days of backups
- **Testing:** Test restore procedure quarterly

## Quick Reference

### Essential Commands

```bash
# Check status
pm2 list

# View logs
pm2 logs <app-name>
npm run webhook:logs

# Restart apps
npm run pm2:restart
npm run pm2:restart:test
npm run webhook:restart

# Deploy manually
npm run deploy:test
npm run deploy:prod
npm run migrate:prod

# Git branches
git checkout dev    # Switch to dev
git checkout main   # Switch to main
git pull origin dev # Pull latest dev
```

### Essential Files

- `webhook-server.js` - Webhook listener
- `scripts/deploy-test.sh` - Test deployment script
- `scripts/deploy-prod.sh` - Production deployment script
- `scripts/migrate-prod.sh` - Manual migration script
- `ecosystem.config.cjs` - PM2 configuration
- `.env.prod.local` - Production environment overrides
- `.env.test.local` - Test environment overrides

### Essential URLs

- Test Application: `http://your-server:8766`
- Production Application: `http://your-server:8765`
- Webhook Endpoint: `http://your-server:9000/webhook`
- GitHub Repository: https://github.com/PriyameetSingh/hudd-dashboard

## Support

For issues or questions:
1. Check this documentation
2. Review logs (`/var/log/deployments/`)
3. Check GitHub webhook deliveries
4. Review PM2 process status and logs
5. Contact the team lead or DevOps

## Additional Documentation

- [WEBHOOK-SETUP.md](../WEBHOOK-SETUP.md) - Initial webhook setup instructions
- [TESTING-CHECKLIST.md](../TESTING-CHECKLIST.md) - Deployment testing procedures
- [README.md](../README.md) - Project overview
