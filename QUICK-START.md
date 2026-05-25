# CI/CD Pipeline Quick Start Guide

## What Was Set Up

A complete webhook-based CI/CD pipeline with:
- Separate test (dev) and production (main) environments
- Automated deployments via GitHub webhooks
- Safe database migration workflow
- Comprehensive logging and monitoring

## Files Created

### Core System
- `webhook-server.js` - Webhook listener (runs on port 9000)
- `scripts/deploy-test.sh` - Test environment deployment
- `scripts/deploy-prod.sh` - Production deployment
- `scripts/migrate-prod.sh` - Manual production migrations

### Configuration
- `.env.prod.local` - Production environment variables
- `.env.test.local` - Test environment variables (already existed)
- Updated `ecosystem.config.cjs` - Added webhook server to PM2
- Updated `package.json` - Added deployment helper scripts

### Documentation
- `docs/DEPLOYMENT.md` - Complete deployment guide
- `WEBHOOK-SETUP.md` - GitHub webhook configuration
- `TESTING-CHECKLIST.md` - Testing procedures
- `archive/README.md` - Old system archive notes

### Git Setup
- Created `main` branch (renamed from master)
- Created `dev` branch (for test environment)

## Next Steps (In Order)

### 1. Set Up Git Authentication (Required for Deployments)

The deployment scripts need to pull from GitHub. Set up authentication:

**Option A: SSH (Recommended)**
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your-email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings > SSH and GPG keys > New SSH key

# Change remote to SSH
git remote set-url origin git@github.com:PriyameetSingh/hudd-dashboard.git
```

**Option B: Personal Access Token**
```bash
# Generate token at: https://github.com/settings/tokens
# Scopes needed: repo

# Store credentials
git config credential.helper store

# Next git pull will prompt for username and token
```

### 2. Push Branches to GitHub

```bash
# Push main branch
git push -u origin main

# Push dev branch
git push -u origin dev

# Update GitHub default branch to main:
# Go to: https://github.com/PriyameetSingh/hudd-dashboard/settings
# Under "Default branch", change from master to main
```

### 3. Generate Webhook Secret

```bash
# Generate a secure secret
openssl rand -hex 32

# Copy the output - you'll need it for both GitHub and the server
```

### 4. Set Up Environment Variable

```bash
# Add to your shell profile
echo 'export WEBHOOK_SECRET="paste-your-secret-here"' >> ~/.bashrc
source ~/.bashrc

# Verify
echo $WEBHOOK_SECRET
```

### 5. Configure GitHub Webhook

Follow instructions in [WEBHOOK-SETUP.md](WEBHOOK-SETUP.md):
- URL: `http://13.203.18.97:9000/webhook`
- Secret: Use the one you generated above
- Events: Just push events

### 6. Open Port 9000 in Firewall

**AWS Security Group:**
- Add inbound rule: TCP port 9000 from 0.0.0.0/0 (or GitHub IPs)

**iptables (if applicable):**
```bash
sudo iptables -A INPUT -p tcp --dport 9000 -j ACCEPT
sudo iptables-save
```

### 7. Start the Webhook Server

```bash
cd /home/ec2-user/dev/hudd-dashboard

# Option 1: Start just webhook server
npm run webhook:start

# Option 2: Start all services (including existing apps)
pm2 start ecosystem.config.cjs

# Verify it's running
pm2 list

# Check logs
npm run webhook:logs
```

### 8. Test the Setup

```bash
# Test 1: Make a test change on dev branch
git checkout dev
echo "# Test $(date)" >> TEST.md
git add TEST.md
git commit -m "Test: webhook deployment"
git push origin dev

# Watch the logs
npm run webhook:logs
# Should see webhook received and deployment triggered

# Test 2: Check test application
curl http://localhost:8766

# Test 3: Check PM2 status
pm2 list
```

### 9. Complete Testing

Follow [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md) to test all scenarios:
- Dev branch deployment
- Main branch deployment
- Database migrations
- Rollback procedures

## Quick Reference

### Essential Commands

```bash
# Check webhook status
pm2 list | grep webhook

# View webhook logs
npm run webhook:logs

# Restart webhook server
npm run webhook:restart

# Run production migration
npm run migrate:prod

# Check deployment logs
tail -f /var/log/deployments/deploy-*.log
```

### Workflow After Setup

**For new features:**
```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-feature
# ... make changes ...
git commit -am "Add: your feature"
git push origin feature/your-feature
# Create PR to dev on GitHub
# Merge → auto-deploys to test
```

**To promote to production:**
```bash
# Create PR from dev to main on GitHub
# Merge → auto-deploys to prod
# SSH to server and run migrations if needed:
npm run migrate:prod
```

## Troubleshooting

### Webhook not working?
1. Check if webhook server is running: `pm2 list`
2. Check webhook logs: `npm run webhook:logs`
3. Verify webhook secret matches in GitHub and environment
4. Check port 9000 is accessible: `curl http://localhost:9000/webhook`

### Git authentication failing?
1. Test: `git pull origin dev` (should not ask for password)
2. Set up SSH keys or PAT (see step 1 above)
3. Verify remote URL: `git remote -v`

### Deployment failing?
1. Check logs: `tail -f /var/log/deployments/deploy-*.log`
2. Check PM2 status: `pm2 list`
3. Check application logs: `pm2 logs hudd-dashboard`

## Documentation

- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Complete deployment guide (workflows, migrations, rollbacks, troubleshooting)
- **[WEBHOOK-SETUP.md](WEBHOOK-SETUP.md)** - Webhook configuration steps
- **[TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)** - Testing procedures

## Support

If you encounter issues:
1. Check the documentation above
2. Review logs in `/var/log/deployments/`
3. Check PM2 process status: `pm2 list`
4. Review GitHub webhook delivery status

## Summary of Changes

### New Capabilities
✅ Automated deployments on push to dev or main branches  
✅ Separate test and production environments  
✅ Safe database migration workflow  
✅ Comprehensive logging and monitoring  
✅ Easy rollback procedures  
✅ No more manual SSH for deployments  

### Migration from Old System
- Old `auto-deploy.sh` archived in `archive/` directory
- No cron jobs were found (nothing to disable)
- New webhook-based system ready to activate

### Current State
- All files created and configured
- Git branches created locally (need to be pushed)
- Webhook server ready to start
- Deployment scripts ready and tested
- Documentation complete

**Status:** Ready for activation after completing steps 1-7 above
